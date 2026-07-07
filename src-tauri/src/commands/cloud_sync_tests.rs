use super::*;
    use crate::commands::cloud_sync_outbox::*;
    use crate::commands::cloud_sync_outbox_helpers::parse_iso_to_utc;
    use crate::commands::cloud_sync_scheduler::{run_background_scheduler_once, CloudSyncSchedulerConfig};
    use crate::db::{migrations, seed};
    use rusqlite::{params, Connection};
    use serde_json::json;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::{Mutex, OnceLock};
    use std::thread;

    const TEST_TENANT_ID: &str = "default-tenant";

    struct FixedNowGuard {
        previous: Option<DateTime<Utc>>,
    }

    impl FixedNowGuard {
        fn set(iso: &str) -> Self {
            let fixed = parse_iso_to_utc(iso).expect("invalid fixed test timestamp");
            let previous = TEST_NOW.with(|value| value.replace(Some(fixed)));
            Self { previous }
        }
    }

    impl Drop for FixedNowGuard {
        fn drop(&mut self) {
            let previous = self.previous.take();
            TEST_NOW.with(|value| {
                value.replace(previous);
            });
        }
    }

    struct SyncEnvGuard {
        previous_endpoint: Option<String>,
        previous_token: Option<String>,
    }

    impl SyncEnvGuard {
        fn set(endpoint: &str) -> Self {
            let previous_endpoint = std::env::var("PMS_OWNER_SYNC_ENDPOINT").ok();
            let previous_token = std::env::var("PMS_OWNER_SYNC_TOKEN").ok();
            std::env::set_var("PMS_OWNER_SYNC_ENDPOINT", endpoint);
            std::env::remove_var("PMS_OWNER_SYNC_TOKEN");
            Self {
                previous_endpoint,
                previous_token,
            }
        }
    }

    impl Drop for SyncEnvGuard {
        fn drop(&mut self) {
            if let Some(endpoint) = self.previous_endpoint.as_deref() {
                std::env::set_var("PMS_OWNER_SYNC_ENDPOINT", endpoint);
            } else {
                std::env::remove_var("PMS_OWNER_SYNC_ENDPOINT");
            }

            if let Some(token) = self.previous_token.as_deref() {
                std::env::set_var("PMS_OWNER_SYNC_TOKEN", token);
            } else {
                std::env::remove_var("PMS_OWNER_SYNC_TOKEN");
            }
        }
    }

    struct TestHttpServer {
        endpoint: String,
        handle: Option<thread::JoinHandle<()>>,
    }

    impl TestHttpServer {
        fn spawn_ok(expected_requests: usize) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind test http server");
            let address = listener.local_addr().expect("read test server address");
            let endpoint = format!("http://{}", address);

            let handle = thread::spawn(move || {
                for _ in 0..expected_requests {
                    let (mut stream, _) = listener.accept().expect("accept test request");
                    respond_ok(&mut stream);
                }
            });

            Self {
                endpoint,
                handle: Some(handle),
            }
        }

        fn join(mut self) {
            if let Some(handle) = self.handle.take() {
                handle.join().expect("join test http server");
            }
        }
    }

    fn respond_ok(stream: &mut TcpStream) {
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .expect("set read timeout");
        let mut buffer = [0_u8; 4096];
        let _ = stream.read(&mut buffer);
        stream
            .write_all(
                b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
            )
            .expect("write test response");
        stream.flush().expect("flush test response");
    }

    fn env_lock() -> &'static Mutex<()> {
        static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        ENV_LOCK.get_or_init(|| Mutex::new(()))
    }

    fn create_test_database() -> Database {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;",
        )
        .expect("apply test pragmas");

        migrations::run(&conn).expect("run test migrations");
        seed::run(&conn).expect("run test seed");

        // seed::run creates a tenant with a random UUID, but these tests key
        // everything off TEST_TENANT_ID ("default-tenant"). Ensure that tenant row
        // exists so the cloud_sync_outbox → tenants FK is satisfied.
        conn.execute(
            "INSERT OR IGNORE INTO tenants (id, tenant_id, name, name_ar, currency_code, timezone)
             VALUES (?1, ?1, 'Test Tenant', 'مستأجر اختباري', 'SDG', 'Africa/Khartoum')",
            params![TEST_TENANT_ID],
        )
        .expect("seed test tenant");

        Database {
            conn: Arc::new(std::sync::Mutex::new(conn)),
        }
    }

    fn insert_outbox_row(
        db: &Database,
        row_id: &str,
        status: &str,
        attempt_count: i64,
        created_at: &str,
        last_attempt_at: Option<&str>,
    ) {
        let conn = db.conn.lock().expect("lock db");
        conn.execute(
            "INSERT INTO cloud_sync_outbox
                (id, tenant_id, event_type, entity_type, entity_id, payload_json, status, attempt_count, last_attempt_at, created_at, updated_at)
             VALUES (?1, ?2, 'snapshot', 'owner_dashboard', 'owner_dashboard', ?3, ?4, ?5, ?6, ?7, ?7)",
            params![
                row_id,
                TEST_TENANT_ID,
                json!({ "row_id": row_id }).to_string(),
                status,
                attempt_count,
                last_attempt_at,
                created_at,
            ],
        )
        .expect("insert outbox row");
    }

    fn count_outbox_rows(db: &Database, status: &str) -> i64 {
        let conn = db.conn.lock().expect("lock db");
        conn.query_row(
            "SELECT COUNT(*) FROM cloud_sync_outbox WHERE tenant_id = ?1 AND status = ?2",
            params![TEST_TENANT_ID, status],
            |row| row.get(0),
        )
        .expect("count outbox rows")
    }

    fn row_status(db: &Database, row_id: &str) -> String {
        let conn = db.conn.lock().expect("lock db");
        conn.query_row(
            "SELECT status FROM cloud_sync_outbox WHERE id = ?1",
            params![row_id],
            |row| row.get(0),
        )
        .expect("read row status")
    }

    fn sync_state_counts(db: &Database) -> (i64, i64, i64, i64) {
        let conn = db.conn.lock().expect("lock db");
        conn.query_row(
            "SELECT last_run_processed, last_run_synced, last_run_failed, last_run_retried
             FROM cloud_sync_state
             WHERE tenant_id = ?1",
            params![TEST_TENANT_ID],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .expect("read sync state counts")
    }

    #[test]
    fn scheduler_skips_when_runtime_is_already_in_progress() {
        let db = create_test_database();
        insert_outbox_row(
            &db,
            "pending-overlap",
            "pending",
            0,
            "2026-04-16T09:00:00.000Z",
            None,
        );
        let runtime = CloudSyncRuntime::default();
        let _guard = acquire_run_guard(&runtime).expect("acquire initial guard");

        run_background_scheduler_once(
            &db,
            &runtime,
            CloudSyncSchedulerConfig {
                interval: Duration::from_secs(30),
                page_size: 10,
                max_pages: 1,
            },
        );

        assert_eq!(count_outbox_rows(&db, "pending"), 1);
        assert_eq!(row_status(&db, "pending-overlap"), "pending");
    }

    #[test]
    fn retry_cycle_processes_only_retry_ready_failed_rows() {
        let _fixed_now = FixedNowGuard::set("2026-04-16T12:00:00.000Z");
        let db = create_test_database();
        insert_outbox_row(
            &db,
            "failed-ready",
            "failed",
            1,
            "2026-04-16T11:00:00.000Z",
            Some("2026-04-16T11:59:50.000Z"),
        );
        insert_outbox_row(
            &db,
            "failed-waiting",
            "failed",
            1,
            "2026-04-16T11:05:00.000Z",
            Some("2026-04-16T11:59:58.000Z"),
        );

        let server = TestHttpServer::spawn_ok(1);
        let _env_lock = env_lock().lock().expect("lock sync env");
        let _env = SyncEnvGuard::set(&server.endpoint);

        let result = execute_sync_cycle(
            &db,
            TEST_TENANT_ID,
            10,
            1,
            CloudSyncRunMode::Manual,
            true,
        )
        .expect("run retry-ready cycle");

        assert_eq!(result.processed, 1);
        assert_eq!(result.synced, 1);
        assert_eq!(result.failed, 0);
        assert_eq!(result.retried, 1);
        assert_eq!(result.pages_run, 1);
        assert_eq!(row_status(&db, "failed-ready"), "synced");
        assert_eq!(row_status(&db, "failed-waiting"), "failed");
        assert_eq!(sync_state_counts(&db), (1, 1, 0, 1));

        drop(_env);
        drop(_env_lock);
        server.join();
    }

    #[test]
    fn sync_cycle_respects_page_bounds_and_records_summary_counts() {
        let _fixed_now = FixedNowGuard::set("2026-04-16T13:00:00.000Z");
        let db = create_test_database();
        for index in 0..5 {
            let created_at = format!("2026-04-16T10:00:0{}.000Z", index);
            insert_outbox_row(
                &db,
                &format!("pending-{}", index + 1),
                "pending",
                0,
                &created_at,
                None,
            );
        }

        let server = TestHttpServer::spawn_ok(4);
        let _env_lock = env_lock().lock().expect("lock sync env");
        let _env = SyncEnvGuard::set(&server.endpoint);

        let result = execute_sync_cycle(
            &db,
            TEST_TENANT_ID,
            2,
            2,
            CloudSyncRunMode::Manual,
            true,
        )
        .expect("run bounded sync cycle");

        assert_eq!(result.processed, 4);
        assert_eq!(result.synced, 4);
        assert_eq!(result.failed, 0);
        assert_eq!(result.retried, 0);
        assert_eq!(result.pages_run, 2);
        assert!(result.has_more_pending);
        assert_eq!(count_outbox_rows(&db, "synced"), 4);
        assert_eq!(count_outbox_rows(&db, "pending"), 1);
        assert_eq!(row_status(&db, "pending-5"), "pending");
        assert_eq!(sync_state_counts(&db), (4, 4, 0, 0));

        drop(_env);
        drop(_env_lock);
        server.join();
    }
