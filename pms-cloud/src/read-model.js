import db from './db.js';
import { v4 as uuidv4 } from 'uuid';

const EVENT_LABELS = {
  product_created: 'منتج جديد',
  product_updated: 'تحديث منتج',
  product_toggled: 'تغيير حالة منتج',
  customer_created: 'عميل جديد',
  customer_updated: 'تحديث عميل',
  customer_toggled: 'تغيير حالة عميل',
  customer_payment_recorded: 'تسجيل دفعة عميل',
  supplier_created: 'مورد جديد',
  supplier_updated: 'تحديث مورد',
  supplier_toggled: 'تغيير حالة مورد',
  supplier_payment_recorded: 'تسجيل دفعة مورد',
  purchase_draft_created: 'فاتورة شراء جديدة',
  purchase_confirmed: 'تأكيد فاتورة شراء',
  purchase_cancelled: 'إلغاء فاتورة شراء',
  sale_created: 'عملية بيع جديدة',
  invoice_sale_created: 'فاتورة بيع جديدة',
  pos_session_opened: 'فتح جلسة بيع',
  pos_session_closed: 'إغلاق جلسة بيع',
  return_created: 'مرتجع جديد',
  expense_created: 'مصروف جديد',
  expense_updated: 'تحديث مصروف',
  expense_deleted: 'حذف مصروف',
  account_transfer_created: 'تحويل بين حسابات',
  warehouse_location_created: 'موقع تخزين جديد',
  warehouse_location_updated: 'تحديث موقع تخزين',
  warehouse_location_toggled: 'تغيير حالة موقع',
  stock_take_started: 'بدء جرد مخزون',
  stock_take_item_updated: 'تحديث عنصر جرد',
  stock_take_confirmed: 'تأكيد جرد مخزون',
  stock_take_cancelled: 'إلغاء جرد مخزون',
  supplier_return_created: 'مرتجع مورد جديد',
  supplier_return_confirmed: 'تأكيد مرتجع مورد',
  refresh_request: 'طلب تحديث',
  snapshot: 'لقطة بيانات',
};

/**
 * Process a received sync event and update read models.
 */
export function processEvent(tenantId, event) {
  const { event_id, event_type, entity_type, entity_id, payload, created_at } = event;

  // Upsert tenant
  db.prepare(`
    INSERT INTO tenants (id, last_event_at, total_events)
    VALUES (?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      last_event_at = excluded.last_event_at,
      total_events = tenants.total_events + 1
  `).run(tenantId, new Date().toISOString());

  // Store raw event (idempotent via unique event_id)
  const storeStmt = db.prepare(`
    INSERT INTO sync_events (id, tenant_id, event_id, event_type, entity_type, entity_id, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, event_id) DO NOTHING
  `);
  storeStmt.run(
    uuidv4(),
    tenantId,
    event_id,
    event_type,
    entity_type,
    entity_id,
    typeof payload === 'object' ? JSON.stringify(payload) : payload || null,
    created_at
  );

  // Update dashboard read model for snapshot events
  if (event_type === 'snapshot' && entity_type === 'owner_dashboard') {
    updateDashboardFromSnapshot(tenantId, payload);
  }

  // Add to activity log
  const summary = EVENT_LABELS[event_type] || event_type;
  db.prepare(`
    INSERT INTO read_activity (id, tenant_id, event_type, entity_type, entity_id, summary, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), tenantId, event_type, entity_type, entity_id, summary, created_at);

  // Trim activity log to latest 500 per tenant
  db.prepare(`
    DELETE FROM read_activity
    WHERE tenant_id = ? AND id NOT IN (
      SELECT id FROM read_activity WHERE tenant_id = ? ORDER BY received_at DESC LIMIT 500
    )
  `).run(tenantId, tenantId);
}

function updateDashboardFromSnapshot(tenantId, payload) {
  if (!payload || typeof payload !== 'object') return;

  db.prepare(`
    INSERT INTO read_dashboard (
      tenant_id, pharmacy_name,
      products_count, customers_count, suppliers_count,
      today_sales_count, today_sales_total,
      month_sales_count, month_sales_total,
      low_stock_count, out_of_stock_count, expiring_soon_count,
      total_customer_receivables, total_supplier_payables,
      snapshot_generated_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET
      pharmacy_name = excluded.pharmacy_name,
      products_count = excluded.products_count,
      customers_count = excluded.customers_count,
      suppliers_count = excluded.suppliers_count,
      today_sales_count = excluded.today_sales_count,
      today_sales_total = excluded.today_sales_total,
      month_sales_count = excluded.month_sales_count,
      month_sales_total = excluded.month_sales_total,
      low_stock_count = excluded.low_stock_count,
      out_of_stock_count = excluded.out_of_stock_count,
      expiring_soon_count = excluded.expiring_soon_count,
      total_customer_receivables = excluded.total_customer_receivables,
      total_supplier_payables = excluded.total_supplier_payables,
      snapshot_generated_at = excluded.snapshot_generated_at,
      updated_at = excluded.updated_at
  `).run(
    tenantId,
    payload.pharmacy_name || '',
    payload.products_count || 0,
    payload.customers_count || 0,
    payload.suppliers_count || 0,
    payload.today_sales_count || 0,
    payload.today_sales_total || 0,
    payload.month_sales_count || 0,
    payload.month_sales_total || 0,
    payload.low_stock_count || 0,
    payload.out_of_stock_count || 0,
    payload.expiring_soon_count || 0,
    payload.total_customer_receivables || 0,
    payload.total_supplier_payables || 0,
    payload.generated_at || new Date().toISOString(),
    new Date().toISOString()
  );
}
