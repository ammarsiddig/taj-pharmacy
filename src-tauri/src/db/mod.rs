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
        let conn = Connection::open(db_path).map_err(|e| format!("Failed to open database: {}", e))?;

        // Set pragmas
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;",
        )
        .map_err(|e| format!("Failed to set pragmas: {}", e))?;

        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
        };

        db.run_migrations()?;
        db.run_seed()?;

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
}
