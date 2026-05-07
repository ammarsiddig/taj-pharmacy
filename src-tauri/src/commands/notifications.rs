use rusqlite::params;
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::license_guard;

#[derive(Debug, Serialize)]
pub struct NotificationRow {
    pub id: String,
    pub notification_type: String,
    pub title: String,
    pub title_ar: Option<String>,
    pub message: String,
    pub message_ar: Option<String>,
    pub severity: String,
    pub reference_type: Option<String>,
    pub reference_id: Option<String>,
    pub is_read: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct NotificationSummary {
    pub unread_count: i64,
    pub notifications: Vec<NotificationRow>,
}

#[tauri::command]
pub fn get_notifications(
    db: State<'_, Database>,
    tenant_id: String,
    user_id: String,
    unread_only: bool,
    limit: Option<i64>,
) -> Result<NotificationSummary, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(50);

    let unread_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notifications
         WHERE tenant_id = ?1 AND (user_id = ?2 OR user_id IS NULL)
           AND is_read = 0 AND deleted_at IS NULL",
        params![tenant_id, user_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let sql = format!(
        "SELECT id, notification_type, title, title_ar, message, message_ar,
                severity, reference_type, reference_id, is_read, created_at
         FROM notifications
         WHERE tenant_id = ?1 AND (user_id = ?2 OR user_id IS NULL)
           AND deleted_at IS NULL
           AND (?3 = 0 OR is_read = 0)
         ORDER BY created_at DESC
         LIMIT {}",
        lim
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(
        params![tenant_id, user_id, unread_only as i64],
        |row: &rusqlite::Row| {
            Ok(NotificationRow {
                id: row.get(0)?,
                notification_type: row.get(1)?,
                title: row.get(2)?,
                title_ar: row.get(3)?,
                message: row.get(4)?,
                message_ar: row.get(5)?,
                severity: row.get(6)?,
                reference_type: row.get(7)?,
                reference_id: row.get(8)?,
                is_read: row.get(9)?,
                created_at: row.get(10)?,
            })
        },
    ).map_err(|e: rusqlite::Error| e.to_string())?;

    let mut notifications = Vec::new();
    for row in rows {
        notifications.push(row.map_err(|e: rusqlite::Error| e.to_string())?);
    }

    Ok(NotificationSummary { unread_count, notifications })
}

#[tauri::command]
pub fn mark_notification_read(
    db: State<'_, Database>,
    tenant_id: String,
    notification_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    conn.execute(
        "UPDATE notifications SET is_read = 1,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![notification_id, tenant_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn mark_all_notifications_read(
    db: State<'_, Database>,
    tenant_id: String,
    user_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    conn.execute(
        "UPDATE notifications SET is_read = 1,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE tenant_id = ?1 AND (user_id = ?2 OR user_id IS NULL)
           AND is_read = 0 AND deleted_at IS NULL",
        params![tenant_id, user_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_system_alerts(
    db: State<'_, Database>,
    tenant_id: String,
    _branch_id: String,
) -> Result<Vec<NotificationRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Generate alerts dynamically from current DB state
    let mut alerts: Vec<NotificationRow> = Vec::new();
    let now_id = || Uuid::new_v4().to_string();

    // Low stock products
    let low_stock_count: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT p.id) FROM products p
         LEFT JOIN (
             SELECT product_id, SUM(quantity_current) as total_qty
             FROM batches WHERE tenant_id = ?1 AND status = 'active' AND deleted_at IS NULL
             GROUP BY product_id
         ) b ON p.id = b.product_id
         WHERE p.tenant_id = ?1 AND p.deleted_at IS NULL AND p.is_active = 1
           AND p.min_stock_level > 0
           AND COALESCE(b.total_qty, 0) <= p.min_stock_level
           AND COALESCE(b.total_qty, 0) > 0",
        params![tenant_id],
        |row| row.get(0),
    ).unwrap_or(0);

    if low_stock_count > 0 {
        alerts.push(NotificationRow {
            id: now_id(),
            notification_type: "low_stock".to_string(),
            title: format!("{} Products Low on Stock", low_stock_count),
            title_ar: Some(format!("{} منتج منخفض المخزون", low_stock_count)),
            message: "Some products have fallen to or below their minimum stock level.".to_string(),
            message_ar: Some("بعض المنتجات وصلت إلى الحد الأدنى للمخزون.".to_string()),
            severity: "warning".to_string(),
            reference_type: Some("products".to_string()),
            reference_id: None,
            is_read: false,
            created_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        });
    }

    // Out of stock products
    let out_of_stock_count: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT p.id) FROM products p
         LEFT JOIN (
             SELECT product_id, SUM(quantity_current) as total_qty
             FROM batches WHERE tenant_id = ?1 AND status = 'active' AND deleted_at IS NULL
             GROUP BY product_id
         ) b ON p.id = b.product_id
         WHERE p.tenant_id = ?1 AND p.deleted_at IS NULL AND p.is_active = 1
           AND COALESCE(b.total_qty, 0) = 0",
        params![tenant_id],
        |row| row.get(0),
    ).unwrap_or(0);

    if out_of_stock_count > 0 {
        alerts.push(NotificationRow {
            id: now_id(),
            notification_type: "out_of_stock".to_string(),
            title: format!("{} Products Out of Stock", out_of_stock_count),
            title_ar: Some(format!("{} منتج نفد من المخزون", out_of_stock_count)),
            message: "Some products have zero stock available.".to_string(),
            message_ar: Some("بعض المنتجات لا يوجد بها مخزون.".to_string()),
            severity: "error".to_string(),
            reference_type: Some("products".to_string()),
            reference_id: None,
            is_read: false,
            created_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        });
    }

    // Expiring in 30 days
    let expiring_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM batches
         WHERE tenant_id = ?1 AND status = 'active' AND deleted_at IS NULL
           AND expiry_date IS NOT NULL
           AND DATE(expiry_date) > DATE('now')
           AND DATE(expiry_date) <= DATE('now', '+30 days')
           AND quantity_current > 0",
        params![tenant_id],
        |row| row.get(0),
    ).unwrap_or(0);

    if expiring_count > 0 {
        alerts.push(NotificationRow {
            id: now_id(),
            notification_type: "expiring_soon".to_string(),
            title: format!("{} Batches Expiring in 30 Days", expiring_count),
            title_ar: Some(format!("{} دفعة تنتهي خلال 30 يوم", expiring_count)),
            message: "Some batches are approaching their expiry date.".to_string(),
            message_ar: Some("بعض الدفعات تقترب من تاريخ انتهاء صلاحيتها.".to_string()),
            severity: "warning".to_string(),
            reference_type: Some("batches".to_string()),
            reference_id: None,
            is_read: false,
            created_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        });
    }

    // Expired batches with stock
    let expired_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM batches
         WHERE tenant_id = ?1 AND status = 'active' AND deleted_at IS NULL
           AND expiry_date IS NOT NULL
           AND DATE(expiry_date) <= DATE('now')
           AND quantity_current > 0",
        params![tenant_id],
        |row| row.get(0),
    ).unwrap_or(0);

    if expired_count > 0 {
        alerts.push(NotificationRow {
            id: now_id(),
            notification_type: "expired".to_string(),
            title: format!("{} Expired Batches Still in Stock", expired_count),
            title_ar: Some(format!("{} دفعة منتهية الصلاحية في المخزون", expired_count)),
            message: "Expired products must be removed from stock immediately.".to_string(),
            message_ar: Some("يجب إزالة المنتجات المنتهية الصلاحية من المخزون فوراً.".to_string()),
            severity: "error".to_string(),
            reference_type: Some("batches".to_string()),
            reference_id: None,
            is_read: false,
            created_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        });
    }

    // Overdue supplier payments
    let overdue_suppliers: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT supplier_id) FROM supplier_invoices
         WHERE tenant_id = ?1 AND payment_status != 'paid'
           AND deleted_at IS NULL AND status = 'confirmed'
           AND DATE(invoice_date) <= DATE('now', '-30 days')",
        params![tenant_id],
        |row| row.get(0),
    ).unwrap_or(0);

    if overdue_suppliers > 0 {
        alerts.push(NotificationRow {
            id: now_id(),
            notification_type: "overdue_payables".to_string(),
            title: format!("{} Suppliers with Overdue Payments", overdue_suppliers),
            title_ar: Some(format!("{} موردين لديهم مدفوعات متأخرة", overdue_suppliers)),
            message: "Some supplier invoices are overdue by more than 30 days.".to_string(),
            message_ar: Some("بعض فواتير الموردين متأخرة أكثر من 30 يوماً.".to_string()),
            severity: "warning".to_string(),
            reference_type: Some("suppliers".to_string()),
            reference_id: None,
            is_read: false,
            created_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        });
    }

    // Payment schedules due tomorrow
    let due_tomorrow: i64 = conn.query_row(
        "SELECT COUNT(*) FROM supplier_payment_schedules
         WHERE tenant_id = ?1 AND is_paid = 0 AND deleted_at IS NULL
           AND DATE(due_date) = DATE('now', '+1 day')",
        params![tenant_id],
        |row| row.get(0),
    ).unwrap_or(0);

    if due_tomorrow > 0 {
        alerts.push(NotificationRow {
            id: now_id(),
            notification_type: "supplier_overdue".to_string(),
            title: format!("{} Payment(s) Due Tomorrow", due_tomorrow),
            title_ar: Some(format!("{} دفعة مستحقة غداً", due_tomorrow)),
            message: "You have supplier payment schedule installments due tomorrow.".to_string(),
            message_ar: Some("لديك دفعات مجدولة للموردين مستحقة غداً.".to_string()),
            severity: "warning".to_string(),
            reference_type: Some("supplier_invoices".to_string()),
            reference_id: None,
            is_read: false,
            created_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        });
    }

    Ok(alerts)
}
