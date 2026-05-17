use rusqlite::{params, Connection};
use argon2::{password_hash::{SaltString, rand_core::OsRng}, Argon2, PasswordHasher};
use uuid::Uuid;

pub fn run(conn: &Connection) -> Result<(), String> {
    // Check if already seeded
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM tenants", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if count > 0 {
        log::info!("Database already seeded, skipping");
        return Ok(());
    }

    log::info!("Seeding database...");

    let tenant_id = Uuid::new_v4().to_string();
    let branch_id = Uuid::new_v4().to_string();

    // Insert tenant
    conn.execute(
        "INSERT INTO tenants (id, tenant_id, name, name_ar, currency_code, timezone)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![tenant_id, tenant_id, "PMS Pharmacy", "صيدلية PMS", "SDG", "Africa/Khartoum"],
    ).map_err(|e| format!("Seed tenant: {}", e))?;

    // Insert main branch
    conn.execute(
        "INSERT INTO branches (id, tenant_id, name, name_ar, is_main)
         VALUES (?1, ?2, ?3, ?4, 1)",
        params![branch_id, tenant_id, "Main Branch", "الفرع الرئيسي"],
    ).map_err(|e| format!("Seed branch: {}", e))?;

    // Insert roles
    let roles = [
        ("role-owner", "owner", "مالك"),
        ("role-manager", "manager", "مدير"),
        ("role-pharmacist", "pharmacist", "صيدلاني"),
        ("role-cashier", "cashier", "كاشير"),
    ];
    for (id, name, name_ar) in &roles {
        conn.execute(
            "INSERT INTO roles (id, tenant_id, name, name_ar, is_system)
             VALUES (?1, ?2, ?3, ?4, 1)",
            params![id, tenant_id, name, name_ar],
        ).map_err(|e| format!("Seed role {}: {}", name, e))?;
    }

    // Hash admin password
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(b"admin123", &salt)
        .map_err(|e| format!("Hash password: {}", e))?
        .to_string();

    // Insert admin user
    conn.execute(
        "INSERT INTO users (id, tenant_id, branch_id, role_id, username, password_hash, full_name, full_name_ar)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params!["user-admin", tenant_id, branch_id, "role-owner", "admin", password_hash, "System Administrator", "مدير النظام"],
    ).map_err(|e| format!("Seed admin user: {}", e))?;

    // Insert storage locations
    let locations = [
        ("loc-shelf", "رف المنتجات", "Products Shelf", "shelf", "SHELF-A"),
        ("loc-fridge", "الثلاجة", "Fridge", "fridge", "FRIDGE-1"),
        ("loc-store", "المخزن", "Warehouse", "warehouse", "STORE-1"),
    ];
    for (id, name_ar, name, loc_type, code) in &locations {
        conn.execute(
            "INSERT INTO storage_locations (id, tenant_id, branch_id, name, name_ar, location_type, location_code)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, tenant_id, branch_id, name, name_ar, loc_type, code],
        ).map_err(|e| format!("Seed location {}: {}", name, e))?;
    }

    // Insert default cash account
    conn.execute(
        "INSERT INTO accounts (id, tenant_id, branch_id, name, name_ar, account_type, is_default, current_balance)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 0)",
        params!["acct-main-cash", tenant_id, branch_id, "Main Cash Register", "الصندوق الرئيسي", "cash"],
    ).map_err(|e| format!("Seed account: {}", e))?;

    // Insert bank account
    conn.execute(
        "INSERT INTO accounts (id, tenant_id, branch_id, name, name_ar, account_type, current_balance, is_default, is_active, bank_provider, internal_fee, external_fee, phone_label)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, 1, 'bok', 0, 0, ?7)",
        params!["acct-main-bank", tenant_id, branch_id, "Main Bank Account", "الحساب البنكي الرئيسي", "bank", "Bnkak"],
    ).map_err(|e| format!("Seed bank account: {}", e))?;

    // Seed unit measures
    let units = [
        ("unit-box", "Box", "علبة"),
        ("unit-strip", "Strip", "شريط"),
        ("unit-ampoule", "Ampoule", "امبول"),
        ("unit-bottle", "Bottle", "زجاجة"),
        ("unit-piece", "Piece", "حبة"),
    ];
    for (id, name, name_ar) in &units {
        conn.execute(
            "INSERT INTO unit_measures (id, tenant_id, name, name_ar, is_active)
             VALUES (?1, ?2, ?3, ?4, 1)",
            params![id, tenant_id, name, name_ar],
        ).map_err(|e| format!("Seed unit {}: {}", name, e))?;
    }

    // Seed POS payment methods
    let payment_methods = [
        ("pm-cash", "Cash", "نقد", "cash", Some("acct-main-cash"), 1, 1, 0),
        ("pm-bankak", "Bankak", "بنكك", "bank_transfer", Some("acct-main-bank"), 0, 1, 10),
        ("pm-fawry", "Fawry", "فوري", "bank_transfer", Some("acct-main-bank"), 0, 1, 20),
        ("pm-credit", "Credit", "آجل", "credit", None, 0, 1, 30),
    ];
    for (id, name, name_ar, method_type, account_id, is_default, is_active, sort_order) in &payment_methods {
        conn.execute(
            "INSERT INTO payment_methods (id, tenant_id, name, name_ar, method_type, account_id, is_default, is_active, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, tenant_id, name, name_ar, method_type, account_id, is_default, is_active, sort_order],
        ).map_err(|e| format!("Seed payment method {}: {}", name, e))?;
    }

    // Insert sequence counters
    let counters = [
        ("seq-sale", "sale_number", "SAL-"),
        ("seq-purchase", "purchase_number", "PUR-"),
        ("seq-return", "return_number", "RET-"),
    ];
    for (id, name, prefix) in &counters {
        conn.execute(
            "INSERT INTO sequence_counters (id, tenant_id, counter_name, last_value, prefix)
             VALUES (?1, ?2, ?3, 0, ?4)",
            params![id, tenant_id, name, prefix],
        ).map_err(|e| format!("Seed counter {}: {}", name, e))?;
    }

    // Insert test supplier
    conn.execute(
        "INSERT INTO suppliers (id, tenant_id, name, name_ar, phone, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5, 1)",
        params!["sup-test-1", tenant_id, "Test Supplier", "مورد تجريبي", "0900000000"],
    ).map_err(|e| format!("Seed supplier: {}", e))?;

    // Insert sample products
    let products = [
        ("prod-1", "Panadol Extra", "بنادول إكسترا", "paracetamol", "باراسيتامول", "painkillers", "box", "unit-box", 15000, 12000, 0, 10, "6281001210013"),
        ("prod-2", "Amoxicillin 500mg", "أموكسيسيلين 500 مج", "amoxicillin", "أموكسيسيلين", "antibiotics", "box", "unit-box", 25000, 20000, 0, 5, "6281001210020"),
        ("prod-3", "Omeprazole 20mg", "أوميبرازول 20 مج", "omeprazole", "أوميبرازول", "stomach", "box", "unit-box", 18000, 15000, 0, 8, "6281001210037"),
        ("prod-4", "Vitamin C 1000mg", "فيتامين سي 1000 مج", "vitamin c", "فيتامين سي", "vitamins", "bottle", "unit-bottle", 12000, 10000, 0, 15, "6281001210044"),
        ("prod-5", "Ibuprofen 400mg", "إيبوبروفين 400 مج", "ibuprofen", "إيبوبروفين", "painkillers", "strip", "unit-strip", 8000, 6000, 0, 10, "6281001210051"),
    ];
    for (id, trade_name, trade_name_ar, generic_name, generic_name_ar, category, unit, unit_id, sale_price, min_sale_price, last_purchase_price, min_stock, barcode) in &products {
        conn.execute(
            "INSERT INTO products (id, tenant_id, barcode, trade_name, trade_name_ar, generic_name, generic_name_ar, category, unit, unit_id, sale_price, min_sale_price, last_purchase_price, min_stock_level)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![id, tenant_id, barcode, trade_name, trade_name_ar, generic_name, generic_name_ar, category, unit, unit_id, sale_price, min_sale_price, last_purchase_price, min_stock],
        ).map_err(|e| format!("Seed product {}: {}", trade_name, e))?;
    }

    // Seed expense categories
    let expense_cats = [
        ("cat-rent", "Rent", "إيجار", "#1A5D3E"),
        ("cat-salaries", "Salaries", "رواتب", "#237A52"),
        ("cat-utilities", "Utilities", "كهرباء ومياه", "#D97706"),
        ("cat-supplies", "Supplies", "مستلزمات", "#5E6C64"),
        ("cat-maintenance", "Maintenance", "صيانة", "#DC2626"),
        ("cat-other", "Other", "أخرى", "#9CA3AF"),
    ];
    for (id, name, name_ar, color) in &expense_cats {
        conn.execute(
            "INSERT INTO expense_categories (id, tenant_id, name, name_ar, color)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, tenant_id, name, name_ar, color],
        ).map_err(|e| format!("Seed expense category {}: {}", name, e))?;
    }

    log::info!("Database seeded successfully");
    Ok(())
}
