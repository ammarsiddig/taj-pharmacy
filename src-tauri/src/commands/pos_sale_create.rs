use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::license_guard;
use crate::commands::guard;
use crate::commands::audit;
use crate::commands::session_state::{AuthSessionState, resolve_identity};
use super::pos_types::*;
use super::pos::{
    FLAG_POS,
    resolve_fefo_items,
    next_sequence,
    resolve_session_cash_account_id,
    resolve_bank_payment_info,
    build_sale_out,
};

#[tauri::command]
pub fn create_sale(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    session_id: String,
    cashier_id: String,
    payment_method: String,
    payment_method_id: Option<String>,
    amount_paid: i64,
    items: Vec<SaleItemInput>,
    customer_id: Option<String>,
    discount: Option<i64>,
    tax_percent: Option<i64>,
    pharmacist_override_by: Option<String>,
    notes: Option<String>,
    split_payments: Option<Vec<SalePaymentInput>>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<SaleOut, String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &cashier_id, &branch_id)?;
    if items.is_empty() {
        return Err("يجب إضافة صنف واحد على الأقل".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_POS)?;
    guard::require_access(&conn, &cashier_id, "pos.sell", guard::Level::Write)?;

    let session_status: String = conn.query_row(
        "SELECT status FROM pos_sessions WHERE id = ?1 AND tenant_id = ?2",
        params![session_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الجلسة غير موجودة".to_string())?;
    if session_status != "open" {
        return Err("الجلسة مغلقة".into());
    }

    if !matches!(payment_method.as_str(), "cash" | "bank_transfer" | "credit" | "partial") {
        return Err("طريقة الدفع غير صالحة".into());
    }

    let split_payments = split_payments.unwrap_or_default();
    if split_payments.iter().any(|payment| {
        !matches!(payment.payment_method.as_str(), "cash" | "bank_transfer") || payment.amount <= 0
    }) {
        return Err("تفاصيل الدفع المقسّم غير صالحة".into());
    }

    // Reject zero/negative line quantities up front. FEFO resolution silently
    // collapses a qty<=0 line to nothing, so this must run on the raw input
    // (before resolve_fefo_items) or the empty/negative sale slips through.
    for item in &items {
        if item.quantity <= 0 {
            let pname: String = conn.query_row(
                "SELECT trade_name FROM products WHERE id = ?1 AND tenant_id = ?2",
                params![item.product_id, tenant_id],
                |row| row.get(0),
            ).unwrap_or_else(|_| item.product_id.clone());
            return Err(format!("الكمية غير صالحة للصنف {} — يجب أن تكون أكبر من صفر", pname));
        }
    }

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let resolved = resolve_fefo_items(&conn, &tenant_id, &items, &today)?;

    for item in &resolved {
        let is_rx: bool = conn.query_row(
            "SELECT is_prescription FROM products WHERE id = ?1 AND tenant_id = ?2",
            params![item.product_id, tenant_id],
            |row| row.get(0),
        ).unwrap_or(false);
        if is_rx {
            match &pharmacist_override_by {
                Some(id) if !id.trim().is_empty() => {}
                _ => {
                    let pname: String = conn.query_row(
                        "SELECT trade_name FROM products WHERE id = ?1",
                        params![item.product_id],
                        |row| row.get(0),
                    ).unwrap_or_else(|_| item.product_id.clone());
                    return Err(format!("يتطلب وصفة طبية: {} — يجب تحديد الصيدلاني المسؤول", pname));
                }
            }
        }
    }

    let mut item_costs: Vec<(String, i64, i64, i64, i64)> = Vec::new(); // (product_name, unit_price, unit_cost, min_sale_price, quantity)

    for item in &resolved {
        let (qty, expiry_date, batch_status, unit_cost): (i64, Option<String>, String, i64) = conn.query_row(
            "SELECT quantity_current, expiry_date, status, unit_cost FROM batches WHERE id = ?1 AND tenant_id = ?2",
            params![item.batch_id, tenant_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        ).map_err(|_| "الدفعة غير موجودة".to_string())?;

        if batch_status == "disposed" {
            let pname: String = conn.query_row(
                "SELECT trade_name FROM products WHERE id = ?1",
                params![item.product_id],
                |row| row.get(0),
            ).unwrap_or_else(|_| item.product_id.clone());
            return Err(format!("الدفعة محجوبة أو تالفة ولا يمكن بيعها: {}", pname));
        }

        if let Some(ref exp) = expiry_date {
            if exp.as_str() < today.as_str() {
                let pname: String = conn.query_row(
                    "SELECT trade_name FROM products WHERE id = ?1",
                    params![item.product_id],
                    |row| row.get(0),
                ).unwrap_or_else(|_| item.product_id.clone());
                return Err(format!("الدفعة منتهية الصلاحية: {}", pname));
            }
        }

        if qty < item.quantity {
            let pname: String = conn.query_row(
                "SELECT trade_name FROM products WHERE id = ?1",
                params![item.product_id],
                |row| row.get(0),
            ).unwrap_or_else(|_| item.product_id.clone());
            return Err(format!("كمية غير كافية: {}", pname));
        }

        let (pname, min_sale_price): (String, i64) = conn.query_row(
            "SELECT trade_name, min_sale_price FROM products WHERE id = ?1",
            params![item.product_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap_or_else(|_| (item.product_id.clone(), 0));
        item_costs.push((pname, item.unit_price, unit_cost, min_sale_price, item.quantity));
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<String, String> {
        let sale_number = next_sequence(&conn, &tenant_id, "sale_number")?;
        let sale_id = Uuid::new_v4().to_string();

        let subtotal: i64 = resolved.iter().map(|i| i.quantity * i.unit_price).sum();
        let disc_amount = discount.unwrap_or(0).max(0);
        let after_discount = (subtotal - disc_amount).max(0);
        let tax_amount = tax_percent.map(|tp| after_discount * tp / 10000).unwrap_or(0);
        let total = after_discount + tax_amount;

        // Margin floor — runs with OR without a discount. Each line's effective
        // per-unit price (after its share of any cart discount) must be >= the
        // product's min_sale_price, falling back to unit_cost when min_sale_price
        // is 0/unset. A low unit_price entered with no discount is caught here too.
        let discount_rate = if subtotal > 0 { 1.0 - disc_amount as f64 / subtotal as f64 } else { 1.0 };
        for (pname, unit_price, unit_cost, min_sale_price, _qty) in &item_costs {
            let floor = if *min_sale_price > 0 { *min_sale_price } else { *unit_cost };
            if floor <= 0 { continue; }
            let effective_price = (*unit_price as f64 * discount_rate) as i64;
            if effective_price < floor {
                if *unit_cost > 0 && effective_price < *unit_cost {
                    return Err(format!("صنف {} سيُباع بـ {} ج.س وهو أقل من سعر التكلفة ({} ج.س). قلل من الخصم.", pname, effective_price, unit_cost));
                }
                return Err(format!("صنف {} سيُباع بـ {} ج.س وهو أقل من الحد الأدنى للبيع ({} ج.س).", pname, effective_price, min_sale_price));
            }
        }

        let split_paid_total: i64 = split_payments.iter().map(|payment| payment.amount).sum();
        let effective_amount_paid = if split_payments.is_empty() {
            amount_paid
        } else {
            if amount_paid != split_paid_total {
                return Err("المبلغ المدفوع لا يطابق تفاصيل الدفع المقسّم".into());
            }
            split_paid_total
        };

        if !split_payments.is_empty() && effective_amount_paid > total {
            return Err("مجموع الدفعات المقسمة لا يمكن أن يتجاوز الإجمالي".into());
        }

        if split_payments.is_empty()
            && matches!(payment_method.as_str(), "cash" | "bank_transfer")
            && effective_amount_paid < total
        {
            return Err("المبلغ المدفوع أقل من الإجمالي".into());
        }

        let outstanding = (total - effective_amount_paid).max(0);
        let change_amount = if split_payments.is_empty() && payment_method == "cash" {
            (effective_amount_paid - total).max(0)
        } else {
            0
        };
        let stored_payment_method = if split_payments.is_empty() {
            payment_method.clone()
        } else {
            "partial".to_string()
        };
        let payment_status = if outstanding > 0 {
            if effective_amount_paid == 0 { "credit" } else { "partial" }
        } else {
            "paid"
        };

        let payment_method_name: Option<String> = if split_payments.is_empty() && payment_method == "bank_transfer" {
            if let Some(ref pmid) = payment_method_id {
                Some(resolve_bank_payment_info(&conn, &tenant_id, pmid)?.1.unwrap_or_else(|| "Bank".to_string()))
            } else {
                None
            }
        } else {
            None
        };

        conn.execute(
            "INSERT INTO sales (id, tenant_id, branch_id, sale_number, sale_type, session_id, cashier_id,
                customer_id, subtotal, discount, tax_amount, total, amount_paid, change_amount,
                payment_method, payment_method_id, payment_method_name, payment_status, notes)
             VALUES (?1, ?2, ?3, ?4, 'pos', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![sale_id, tenant_id, branch_id, sale_number, session_id, cashier_id,
                    customer_id, subtotal, disc_amount, tax_amount, total, effective_amount_paid, change_amount,
                    stored_payment_method, payment_method_id, payment_method_name, payment_status, notes],
        ).map_err(|e| format!("فشل إنشاء عملية البيع: {}", e))?;

        for item in &resolved {
            let item_id = Uuid::new_v4().to_string();
            let item_subtotal = item.quantity * item.unit_price;

            conn.execute(
                "INSERT INTO sale_items (id, tenant_id, sale_id, product_id, batch_id, quantity, unit_price, unit_cost, subtotal)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![item_id, tenant_id, sale_id, item.product_id, item.batch_id,
                        item.quantity, item.unit_price, item.unit_cost, item_subtotal],
            ).map_err(|e| format!("فشل إضافة صنف البيع: {}", e))?;

            let qty_before: i64 = conn.query_row(
                "SELECT quantity_current FROM batches WHERE id = ?1",
                params![item.batch_id],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?;

            let qty_after = qty_before - item.quantity;

            conn.execute(
                "UPDATE batches SET quantity_current = ?2, status = CASE WHEN ?2 = 0 THEN 'depleted' ELSE status END,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1",
                params![item.batch_id, qty_after],
            ).map_err(|e| e.to_string())?;

            let mv_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                        movement_type, quantity_change, quantity_before, quantity_after,
                        reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'sell', ?6, ?7, ?8, 'sale', ?9, ?10)",
                params![mv_id, tenant_id, branch_id, item.product_id, item.batch_id,
                        -item.quantity, qty_before, qty_after, sale_id, cashier_id],
            ).map_err(|e| e.to_string())?;
        }

        if outstanding > 0 {
            if let Some(ref cid) = customer_id {
                let (cust_balance, cust_limit): (i64, i64) = conn.query_row(
                    "SELECT current_balance, credit_limit FROM customers WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL AND is_active = 1",
                    params![cid, tenant_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                ).map_err(|_| "العميل غير موجود أو غير نشط".to_string())?;

                if cust_limit < 0 {
                    // sentinel -1 = unlimited credit, allow
                } else if cust_limit == 0 {
                    return Err("هذا العميل نقدي فقط (لا يسمح بالائتمان)".to_string());
                } else if cust_balance + outstanding > cust_limit {
                    return Err(format!("تجاوز حد الائتمان المسموح به: الرصيد {} + المبلغ {} > الحد {}", cust_balance, outstanding, cust_limit));
                }

                conn.execute(
                    "UPDATE customers SET current_balance = current_balance + ?2,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?1",
                    params![cid, outstanding],
                ).map_err(|e| e.to_string())?;
            } else {
                return Err("يجب اختيار عميل للبيع بالآجل أو الدفع الجزئي".into());
            }
        }

        let payments_to_record = if split_payments.is_empty() {
            let collected_amount = effective_amount_paid.min(total);
            if collected_amount > 0 && matches!(payment_method.as_str(), "cash" | "bank_transfer") {
                vec![SalePaymentInput {
                    payment_method: payment_method.clone(),
                    payment_method_id: payment_method_id.clone(),
                    amount: collected_amount,
                }]
            } else {
                Vec::new()
            }
        } else {
            split_payments.clone()
        };

        let mut cash_collected = 0_i64;
        for payment in payments_to_record {
            let (account_id, payment_name) = match payment.payment_method.as_str() {
                "cash" => (resolve_session_cash_account_id(&conn, &session_id)?, None),
                "bank_transfer" => {
                    let pmid = payment.payment_method_id.as_deref()
                        .filter(|value| !value.is_empty())
                        .ok_or_else(|| "يجب اختيار حساب بنكي لعمليات التحويل البنكي".to_string())?;
                    resolve_bank_payment_info(&conn, &tenant_id, pmid)?
                }
                _ => return Err("طريقة دفع غير مدعومة ضمن الدفع المقسّم".into()),
            };

            let pay_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO sale_payments (id, tenant_id, sale_id, payment_method, payment_method_id, payment_method_name, amount)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![pay_id, tenant_id, sale_id, payment.payment_method, payment.payment_method_id, payment_name, payment.amount],
            ).map_err(|e| e.to_string())?;

            let bal_before: i64 = conn.query_row(
                "SELECT current_balance FROM accounts WHERE id = ?1",
                params![account_id],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?;

            let bal_after = bal_before + payment.amount;
            let tx_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                        amount, balance_before, balance_after, reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, 'sale_income', 'in', ?4, ?5, ?6, 'sale', ?7, ?8)",
                params![tx_id, tenant_id, account_id, payment.amount, bal_before, bal_after, sale_id, cashier_id],
            ).map_err(|e| e.to_string())?;

            conn.execute(
                "UPDATE accounts SET current_balance = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
                params![account_id, bal_after],
            ).map_err(|e| e.to_string())?;

            if payment.payment_method == "cash" {
                cash_collected += payment.amount;
            }
        }

        conn.execute(
            "UPDATE pos_sessions SET total_sales = total_sales + ?2, sales_count = sales_count + 1,
                    expected_cash = expected_cash + ?3,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1",
            params![session_id, total, cash_collected],
        ).map_err(|e| e.to_string())?;

        Ok(sale_id)
    })();

    match result {
        Ok(sale_id) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = audit::log_action(&conn, &tenant_id, &cashier_id, "create", "sale", &sale_id, None) {
                log::warn!("audit log failed after create_sale: {}", e);
            }
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "sale_created") {
                log::warn!("cloud sync enqueue failed after create_sale: {}", e);
            }
            build_sale_out(&conn, &tenant_id, &sale_id)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}
