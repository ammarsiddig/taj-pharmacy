use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PosSession {
    pub id: String,
    pub tenant_id: String,
    pub branch_id: String,
    pub cashier_id: String,
    pub account_id: String,
    pub status: String,
    pub opening_cash: i64,
    pub expected_cash: i64,
    pub actual_cash: Option<i64>,
    pub cash_difference: Option<i64>,
    pub total_sales: i64,
    pub total_returns: i64,
    pub sales_count: i64,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PosBatch {
    pub batch_id: String,
    pub batch_number: Option<String>,
    pub expiry_date: Option<String>,
    pub quantity_current: i64,
    pub unit_cost: i64,
    pub location_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PosProduct {
    pub product_id: String,
    pub product_name: String,
    pub product_name_ar: Option<String>,
    pub barcode: Option<String>,
    pub sale_price: i64,
    pub unit: String,
    pub is_prescription: bool,
    pub batches: Vec<PosBatch>,
}

#[derive(Debug, Serialize)]
pub struct SaleItemOut {
    pub id: String,
    pub product_id: String,
    pub batch_id: String,
    pub product_name: Option<String>,
    pub batch_number: Option<String>,
    pub expiry_date: Option<String>,
    pub quantity: i64,
    pub unit_price: i64,
    pub unit_cost: i64,
    pub subtotal: i64,
}

#[derive(Debug, Serialize)]
pub struct SaleOut {
    pub id: String,
    pub sale_number: String,
    pub sale_type: String,
    pub session_id: Option<String>,
    pub cashier_id: String,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub subtotal: i64,
    pub discount: i64,
    pub tax_amount: i64,
    pub total: i64,
    pub amount_paid: i64,
    pub change_amount: i64,
    pub payment_method: String,
    pub payment_method_name: Option<String>,
    pub payment_status: String,
    pub notes: Option<String>,
    pub split_payments: Vec<SalePaymentOut>,
    pub items: Vec<SaleItemOut>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct SalePaymentOut {
    pub id: String,
    pub payment_method: String,
    pub payment_method_id: Option<String>,
    pub payment_method_name: Option<String>,
    pub amount: i64,
}

#[derive(Debug, Deserialize)]
pub struct SaleItemInput {
    pub product_id: String,
    pub batch_id: Option<String>,
    pub quantity: i64,
    pub unit_price: i64,
    pub unit_cost: i64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SalePaymentInput {
    pub payment_method: String,
    pub payment_method_id: Option<String>,
    pub amount: i64,
}

#[derive(Debug, Clone)]
pub(crate) struct ResolvedSaleItem {
    pub(crate) product_id: String,
    pub(crate) batch_id: String,
    pub(crate) quantity: i64,
    pub(crate) unit_price: i64,
    pub(crate) unit_cost: i64,
}

#[derive(Debug, Serialize)]
pub struct SessionRow {
    pub id: String,
    pub cashier_name: String,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub sales_count: i64,
    pub total_sales: i64,
    pub total_returns: i64,
    pub opening_cash: i64,
    pub actual_cash: Option<i64>,
    pub cash_difference: Option<i64>,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct AccountInfo {
    pub id: String,
    pub tenant_id: String,
    pub branch_id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub account_type: String,
    pub current_balance: i64,
    pub is_default: bool,
    pub is_active: bool,
}

#[derive(Debug, Serialize)]
pub struct SessionSaleRow {
    pub id: String,
    pub sale_number: String,
    pub total: i64,
    pub payment_method: String,
    pub items_count: i64,
    pub customer_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ProductSummaryRow {
    pub product_id: String,
    pub product_name: String,
    pub total_qty: i64,
    pub total_returned: i64,
    pub net_qty: i64,
    pub unit_price: i64,
    pub unit_cost: i64,
    pub total_amount: i64,
    pub net_amount: i64,
    pub profit: i64,
}

#[derive(Debug, Serialize)]
pub struct ReturnOut {
    pub id: String,
    pub return_number: String,
    pub sale_id: Option<String>,
    pub sale_number: String,
    pub return_type: String,
    pub total: i64,
    pub refund_method: String,
    pub status: String,
    pub reason: Option<String>,
    pub items: Vec<ReturnItemOut>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ReturnItemOut {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub batch_id: String,
    pub quantity: i64,
    pub unit_price: i64,
    pub subtotal: i64,
}

#[derive(Debug, Deserialize)]
pub struct ReturnItemInput {
    pub sale_item_id: String,
    pub product_id: String,
    pub batch_id: String,
    pub quantity: i64,
    pub unit_price: i64,
}

#[derive(Debug, Serialize)]
pub struct SessionReturnRow {
    pub id: String,
    pub return_number: String,
    pub sale_number: String,
    pub return_type: String,
    pub total: i64,
    pub refund_method: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct InvoiceSaleRow {
    pub id: String,
    pub sale_number: String,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub cashier_name: String,
    pub total: i64,
    pub tax_amount: i64,
    pub amount_paid: i64,
    pub balance_due: i64,
    pub payment_method: String,
    pub payment_status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub items_count: i64,
}
