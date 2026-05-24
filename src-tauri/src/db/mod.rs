pub mod migrations;
pub mod seed;

use rusqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct Database {
    pub conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self, String> {
        let conn = Connection::open(db_path).map_err(|e| format!("فشل فتح قاعدة البيانات: {}", e))?;

        // Set pragmas
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;",
        )
        .map_err(|e| format!("فشل تعيين إعدادات قاعدة البيانات: {}", e))?;

        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
        };

        db.run_migrations()?;
        db.run_seed()?;
        db.ensure_role_permissions()?;

        Ok(db)
    }

    fn run_migrations(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        migrations::run(&conn)
    }

    fn run_seed(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        seed::run(&conn)
    }

    // Idempotent: seeds role_permissions for built-in roles if missing.
    // Must run AFTER run_seed because migrations run before seed, so roles
    // are empty when TASK-910 migration attempts to seed permissions.
    fn ensure_role_permissions(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let already_seeded: i64 = conn
            .query_row("SELECT COUNT(*) FROM role_permissions", [], |r| r.get(0))
            .unwrap_or(0);
        if already_seeded > 0 {
            return Ok(());
        }

        let default_perms: &[(&str, &[(&str, &str)])] = &[
            ("owner", &[
                ("dashboard.view","write"),
                ("pos.sell","write"), ("pos.returns","write"), ("pos.history","write"),
                ("pos.discount","write"), ("sessions","write"), ("products","write"),
                ("inventory","write"), ("transfers","write"), ("disposal","write"),
                ("purchases","write"), ("supplier_returns","write"), ("suppliers","write"),
                ("customers","write"), ("customer_payments","write"),
                ("accounts","write"), ("account_transfers","write"), ("expenses","write"),
                ("reports.sales","write"), ("reports.inventory","write"), ("reports.financial","write"),
                ("audit","write"), ("settings.users","write"), ("settings.branches","write"),
                ("settings.license","write"), ("settings.backup","write"),
                ("settings.payment_methods","write"), ("settings.tax","write"),
            ]),
            ("manager", &[
                ("dashboard.view","write"),
                ("pos.sell","write"), ("pos.returns","write"), ("pos.history","write"),
                ("pos.discount","write"), ("sessions","write"), ("products","write"),
                ("inventory","write"), ("transfers","write"), ("disposal","write"),
                ("purchases","write"), ("supplier_returns","write"), ("suppliers","write"),
                ("customers","write"), ("customer_payments","write"),
                ("accounts","read"), ("account_transfers","none"), ("expenses","write"),
                ("reports.sales","write"), ("reports.inventory","write"), ("reports.financial","none"),
                ("audit","read"), ("settings.users","none"), ("settings.branches","none"),
                ("settings.license","none"), ("settings.backup","read"),
                ("settings.payment_methods","write"), ("settings.tax","write"),
            ]),
            ("pharmacist", &[
                ("dashboard.view","read"),
                ("pos.sell","write"), ("pos.returns","write"), ("pos.history","write"),
                ("pos.discount","write"), ("sessions","write"), ("products","read"),
                ("inventory","write"), ("transfers","write"), ("disposal","read"),
                ("purchases","none"), ("supplier_returns","none"), ("suppliers","read"),
                ("customers","read"), ("customer_payments","write"),
                ("accounts","none"), ("account_transfers","none"), ("expenses","none"),
                ("reports.sales","read"), ("reports.inventory","read"), ("reports.financial","none"),
                ("audit","none"), ("settings.users","none"), ("settings.branches","none"),
                ("settings.license","none"), ("settings.backup","none"),
                ("settings.payment_methods","none"), ("settings.tax","none"),
            ]),
            ("cashier", &[
                ("pos.sell","write"), ("pos.returns","none"), ("pos.history","none"),
                ("pos.discount","none"), ("sessions","write"), ("products","none"),
                ("inventory","none"), ("transfers","none"), ("disposal","none"),
                ("purchases","none"), ("supplier_returns","none"), ("suppliers","none"),
                ("customers","read"), ("customer_payments","none"),
                ("accounts","none"), ("account_transfers","none"), ("expenses","none"),
                ("reports.sales","none"), ("reports.inventory","none"), ("reports.financial","none"),
                ("audit","none"), ("settings.users","none"), ("settings.branches","none"),
                ("settings.license","none"), ("settings.backup","none"),
                ("settings.payment_methods","none"), ("settings.tax","none"),
            ]),
        ];

        for (role_name, perms) in default_perms {
            let role_id: String = conn
                .query_row(
                    "SELECT id FROM roles WHERE name = ?1 AND deleted_at IS NULL LIMIT 1",
                    rusqlite::params![role_name],
                    |r| r.get(0),
                )
                .unwrap_or_default();
            if role_id.is_empty() { continue; }
            for (resource, level) in *perms {
                conn.execute(
                    "INSERT OR IGNORE INTO role_permissions (role_id, resource, level) VALUES (?1, ?2, ?3)",
                    rusqlite::params![role_id, resource, level],
                ).ok();
            }
        }

        // Ensure owner users have see_all_branches=1
        conn.execute(
            "UPDATE users SET see_all_branches = 1
             WHERE role_id IN (SELECT id FROM roles WHERE name = 'owner' AND deleted_at IS NULL)
               AND see_all_branches = 0",
            [],
        ).ok();

        log::info!("Role permissions seeded");
        Ok(())
    }
}
