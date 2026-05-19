use rusqlite::Connection;

pub fn run(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        -- TENANTS
        CREATE TABLE IF NOT EXISTS tenants (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            name_ar TEXT,
            license_number TEXT,
            phone TEXT,
            address TEXT,
            currency_code TEXT NOT NULL DEFAULT 'SDG',
            timezone TEXT NOT NULL DEFAULT 'Africa/Khartoum',
            receipt_header TEXT,
            receipt_footer TEXT,
            print_logo INTEGER NOT NULL DEFAULT 1,
            subscription_plan TEXT NOT NULL DEFAULT 'basic'
                CHECK(subscription_plan IN ('basic','professional','enterprise')),
            subscription_status TEXT NOT NULL DEFAULT 'active'
                CHECK(subscription_status IN ('active','expired','suspended')),
            subscription_expiry TEXT,
            max_branches INTEGER NOT NULL DEFAULT 1,
            max_users INTEGER NOT NULL DEFAULT 2,
            feature_flags INTEGER NOT NULL DEFAULT 0,
            onboarding_completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT
        );

        -- BRANCHES
        CREATE TABLE IF NOT EXISTS branches (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            name_ar TEXT,
            address TEXT,
            phone TEXT,
            is_main INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        -- ROLES
        CREATE TABLE IF NOT EXISTS roles (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            name_ar TEXT,
            is_system INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_name
            ON roles(tenant_id, name) WHERE deleted_at IS NULL;

        -- USERS
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            branch_id TEXT,
            role_id TEXT NOT NULL,
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            full_name_ar TEXT,
            phone TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_login_at TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (branch_id) REFERENCES branches(id),
            FOREIGN KEY (role_id) REFERENCES roles(id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
            ON users(tenant_id, username) WHERE deleted_at IS NULL;

        -- PERMISSIONS
        CREATE TABLE IF NOT EXISTS permissions (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            feature TEXT NOT NULL,
            allowed INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_user_feature
            ON permissions(user_id, feature) WHERE deleted_at IS NULL;

        -- STORAGE LOCATIONS
        CREATE TABLE IF NOT EXISTS storage_locations (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            branch_id TEXT NOT NULL,
            name TEXT NOT NULL,
            name_ar TEXT,
            location_type TEXT NOT NULL DEFAULT 'shelf'
                CHECK(location_type IN ('shelf','fridge','warehouse')),
            location_code TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (branch_id) REFERENCES branches(id)
        );

        -- UNIT MEASURES
        CREATE TABLE IF NOT EXISTS unit_measures (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            name_ar TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_measures_name
            ON unit_measures(tenant_id, name) WHERE deleted_at IS NULL;

        -- PAYMENT METHODS (settings-driven POS options)
        CREATE TABLE IF NOT EXISTS payment_methods (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            name_ar TEXT,
            method_type TEXT NOT NULL DEFAULT 'bank_transfer'
                CHECK(method_type IN ('cash','bank_transfer','credit')),
            account_id TEXT,
            is_default INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );
        CREATE INDEX IF NOT EXISTS idx_payment_methods_tenant
            ON payment_methods(tenant_id, method_type, is_active) WHERE deleted_at IS NULL;

        -- PRODUCTS
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            barcode TEXT,
            trade_name TEXT NOT NULL,
            trade_name_ar TEXT,
            generic_name TEXT,
            generic_name_ar TEXT,
            category TEXT,
            unit TEXT NOT NULL DEFAULT 'box',
            unit_id TEXT,
            enable_sub_units INTEGER NOT NULL DEFAULT 0,
            sub_unit_id TEXT,
            sub_unit_ratio INTEGER,
            sale_price INTEGER NOT NULL DEFAULT 0,
            min_sale_price INTEGER NOT NULL DEFAULT 0,
            last_purchase_price INTEGER NOT NULL DEFAULT 0,
            min_stock_level INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (unit_id) REFERENCES unit_measures(id),
            FOREIGN KEY (sub_unit_id) REFERENCES unit_measures(id)
        );
        CREATE INDEX IF NOT EXISTS idx_products_tenant
            ON products(tenant_id) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_products_barcode
            ON products(barcode) WHERE barcode IS NOT NULL;

        -- SUPPLIERS
        CREATE TABLE IF NOT EXISTS suppliers (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            name_ar TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            contact_person TEXT,
            opening_balance INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE INDEX IF NOT EXISTS idx_suppliers_tenant
            ON suppliers(tenant_id) WHERE deleted_at IS NULL;

        -- SUPPLIER INVOICES
        CREATE TABLE IF NOT EXISTS supplier_invoices (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            branch_id TEXT NOT NULL,
            supplier_id TEXT NOT NULL,
            invoice_number TEXT,
            invoice_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft'
                CHECK(status IN ('draft','confirmed','cancelled')),
            payment_status TEXT NOT NULL DEFAULT 'unpaid'
                CHECK(payment_status IN ('unpaid','partial','paid')),
            subtotal INTEGER NOT NULL DEFAULT 0,
            discount INTEGER NOT NULL DEFAULT 0,
            tax_amount INTEGER NOT NULL DEFAULT 0,
            total INTEGER NOT NULL DEFAULT 0,
            amount_paid INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            confirmed_at TEXT,
            confirmed_by TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (branch_id) REFERENCES branches(id),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_supplier_invoices_tenant
            ON supplier_invoices(tenant_id, status) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier
            ON supplier_invoices(supplier_id) WHERE deleted_at IS NULL;

        -- SUPPLIER INVOICE ITEMS
        CREATE TABLE IF NOT EXISTS supplier_invoice_items (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            invoice_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            batch_number TEXT,
            expiry_date TEXT,
            quantity INTEGER NOT NULL,
            unit_cost INTEGER NOT NULL,
            sale_price INTEGER NOT NULL DEFAULT 0,
            subtotal INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        );
        CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
            ON supplier_invoice_items(invoice_id);

        -- BATCHES
        CREATE TABLE IF NOT EXISTS batches (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            supplier_invoice_id TEXT,
            location_id TEXT NOT NULL,
            batch_number TEXT,
            expiry_date TEXT,
            quantity_received INTEGER NOT NULL,
            quantity_current INTEGER NOT NULL,
            unit_cost INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'active'
                CHECK(status IN ('active','depleted','expired','disposed')),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (supplier_invoice_id) REFERENCES supplier_invoices(id),
            FOREIGN KEY (location_id) REFERENCES storage_locations(id)
        );
        CREATE INDEX IF NOT EXISTS idx_batches_product
            ON batches(product_id, status) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_batches_expiry
            ON batches(tenant_id, expiry_date) WHERE deleted_at IS NULL;

        -- STOCK MOVEMENTS
        CREATE TABLE IF NOT EXISTS stock_movements (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            branch_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            batch_id TEXT NOT NULL,
            movement_type TEXT NOT NULL
                CHECK(movement_type IN (
                    'receive','sell','customer_return',
                    'supplier_return','transfer_in','transfer_out',
                    'adjust','dispose'
                )),
            quantity_change INTEGER NOT NULL,
            quantity_before INTEGER NOT NULL,
            quantity_after INTEGER NOT NULL,
            reference_type TEXT,
            reference_id TEXT,
            notes TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (batch_id) REFERENCES batches(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_movements_product
            ON stock_movements(product_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_movements_batch
            ON stock_movements(batch_id);

        -- ACCOUNTS
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            branch_id TEXT NOT NULL,
            name TEXT NOT NULL,
            name_ar TEXT,
            account_type TEXT NOT NULL DEFAULT 'cash'
                CHECK(account_type IN ('cash','bank')),
            current_balance INTEGER NOT NULL DEFAULT 0,
            is_default INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (branch_id) REFERENCES branches(id)
        );

        -- ACCOUNT TRANSACTIONS
        CREATE TABLE IF NOT EXISTS account_transactions (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            transaction_type TEXT NOT NULL
                CHECK(transaction_type IN (
                    'sale_income','purchase_payment','expense',
                    'customer_payment','supplier_payment',
                    'customer_refund','opening_balance','adjustment'
                )),
            direction TEXT NOT NULL CHECK(direction IN ('in','out')),
            amount INTEGER NOT NULL,
            balance_before INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            reference_type TEXT,
            reference_id TEXT,
            description TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );
        CREATE INDEX IF NOT EXISTS idx_acct_transactions_account
            ON account_transactions(account_id, created_at);

        -- POS SESSIONS
        CREATE TABLE IF NOT EXISTS pos_sessions (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            branch_id TEXT NOT NULL,
            cashier_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open'
                CHECK(status IN ('open','closed')),
            opening_cash INTEGER NOT NULL DEFAULT 0,
            expected_cash INTEGER NOT NULL DEFAULT 0,
            actual_cash INTEGER,
            cash_difference INTEGER,
            total_sales INTEGER NOT NULL DEFAULT 0,
            total_returns INTEGER NOT NULL DEFAULT 0,
            sales_count INTEGER NOT NULL DEFAULT 0,
            opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            closed_at TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (branch_id) REFERENCES branches(id),
            FOREIGN KEY (cashier_id) REFERENCES users(id),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_cashier
            ON pos_sessions(cashier_id, status);
        CREATE INDEX IF NOT EXISTS idx_sessions_branch
            ON pos_sessions(branch_id, status);

        -- SALES
        CREATE TABLE IF NOT EXISTS sales (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            branch_id TEXT NOT NULL,
            sale_number TEXT NOT NULL,
            sale_type TEXT NOT NULL DEFAULT 'pos'
                CHECK(sale_type IN ('pos','invoice')),
            session_id TEXT,
            cashier_id TEXT NOT NULL,
            customer_id TEXT,
            subtotal INTEGER NOT NULL DEFAULT 0,
            discount INTEGER NOT NULL DEFAULT 0,
            tax_amount INTEGER NOT NULL DEFAULT 0,
            total INTEGER NOT NULL DEFAULT 0,
            amount_paid INTEGER NOT NULL DEFAULT 0,
            change_amount INTEGER NOT NULL DEFAULT 0,
            payment_method TEXT NOT NULL DEFAULT 'cash'
                CHECK(payment_method IN ('cash','bank_transfer','credit','partial')),
            payment_method_id TEXT,
            payment_method_name TEXT,
            payment_status TEXT NOT NULL DEFAULT 'paid'
                CHECK(payment_status IN ('paid','credit','partial')),
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (branch_id) REFERENCES branches(id),
            FOREIGN KEY (session_id) REFERENCES pos_sessions(id),
            FOREIGN KEY (cashier_id) REFERENCES users(id),
            FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sales_tenant_date
            ON sales(tenant_id, created_at) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_sales_session
            ON sales(session_id) WHERE deleted_at IS NULL;

        -- SALE ITEMS
        CREATE TABLE IF NOT EXISTS sale_items (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            sale_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            batch_id TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price INTEGER NOT NULL,
            unit_cost INTEGER NOT NULL,
            subtotal INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (sale_id) REFERENCES sales(id),
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (batch_id) REFERENCES batches(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sale_items_sale
            ON sale_items(sale_id);

        CREATE TABLE IF NOT EXISTS sale_payments (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            sale_id TEXT NOT NULL,
            payment_method TEXT NOT NULL
                CHECK(payment_method IN ('cash','bank_transfer')),
            payment_method_id TEXT,
            payment_method_name TEXT,
            amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (sale_id) REFERENCES sales(id),
            FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sale_payments_sale
            ON sale_payments(sale_id);

        -- SEQUENCE COUNTERS
        CREATE TABLE IF NOT EXISTS sequence_counters (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            counter_name TEXT NOT NULL,
            last_value INTEGER NOT NULL DEFAULT 0,
            prefix TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sequence_name
            ON sequence_counters(tenant_id, counter_name);

        -- RETURNS
        CREATE TABLE IF NOT EXISTS returns (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            branch_id TEXT NOT NULL,
            return_number TEXT NOT NULL,
            sale_id TEXT,
            session_id TEXT,
            return_type TEXT NOT NULL DEFAULT 'full'
                CHECK(return_type IN ('full','partial')),
            status TEXT NOT NULL DEFAULT 'completed'
                CHECK(status IN ('completed','cancelled')),
            subtotal INTEGER NOT NULL DEFAULT 0,
            total INTEGER NOT NULL DEFAULT 0,
            refund_method TEXT NOT NULL DEFAULT 'cash'
                CHECK(refund_method IN ('cash','bank_transfer','none')),
            reason TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (branch_id) REFERENCES branches(id),
            FOREIGN KEY (sale_id) REFERENCES sales(id),
            FOREIGN KEY (session_id) REFERENCES pos_sessions(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_returns_sale
            ON returns(sale_id);
        CREATE INDEX IF NOT EXISTS idx_returns_session
            ON returns(session_id);

        -- RETURN ITEMS
        CREATE TABLE IF NOT EXISTS return_items (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            return_id TEXT NOT NULL,
            sale_item_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            batch_id TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price INTEGER NOT NULL,
            subtotal INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (return_id) REFERENCES returns(id),
            FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (batch_id) REFERENCES batches(id)
        );
        CREATE INDEX IF NOT EXISTS idx_return_items_return
            ON return_items(return_id);

        -- EXPENSE CATEGORIES
        CREATE TABLE IF NOT EXISTS expense_categories (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            name_ar TEXT,
            color TEXT NOT NULL DEFAULT '#5E6C64',
            icon TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE INDEX IF NOT EXISTS idx_expense_categories_tenant
            ON expense_categories(tenant_id) WHERE deleted_at IS NULL;

        -- EXPENSES
        CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            branch_id TEXT NOT NULL,
            category_id TEXT,
            description TEXT NOT NULL,
            amount INTEGER NOT NULL,
            payment_method TEXT NOT NULL DEFAULT 'cash'
                CHECK(payment_method IN ('cash','bank_transfer')),
            account_id TEXT NOT NULL,
            expense_date TEXT NOT NULL,
            notes TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (branch_id) REFERENCES branches(id),
            FOREIGN KEY (category_id) REFERENCES expense_categories(id),
            FOREIGN KEY (account_id) REFERENCES accounts(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date
            ON expenses(tenant_id, expense_date) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_expenses_category
            ON expenses(category_id) WHERE deleted_at IS NULL;

        -- CUSTOMERS
        CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            name_ar TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            credit_limit INTEGER NOT NULL DEFAULT 0,
            current_balance INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE INDEX IF NOT EXISTS idx_customers_tenant
            ON customers(tenant_id) WHERE deleted_at IS NULL;

        -- CUSTOMER PAYMENTS
        CREATE TABLE IF NOT EXISTS customer_payments (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            customer_id TEXT NOT NULL,
            amount INTEGER NOT NULL,
            payment_method TEXT NOT NULL DEFAULT 'cash'
                CHECK(payment_method IN ('cash','bank_transfer')),
            account_id TEXT NOT NULL,
            notes TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            FOREIGN KEY (account_id) REFERENCES accounts(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_customer_payments_customer
            ON customer_payments(customer_id);

        -- SUPPLIER PAYMENTS
        CREATE TABLE IF NOT EXISTS supplier_payments (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            supplier_id TEXT NOT NULL,
            invoice_id TEXT,
            amount INTEGER NOT NULL,
            payment_method TEXT NOT NULL DEFAULT 'cash'
                CHECK(payment_method IN ('cash','bank_transfer')),
            account_id TEXT NOT NULL,
            payment_date TEXT NOT NULL,
            notes TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
            FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id),
            FOREIGN KEY (account_id) REFERENCES accounts(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier
            ON supplier_payments(supplier_id);
        CREATE INDEX IF NOT EXISTS idx_supplier_payments_invoice
            ON supplier_payments(invoice_id) WHERE invoice_id IS NOT NULL;

        -- STOCK TAKES
        CREATE TABLE IF NOT EXISTS stock_takes (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            branch_id TEXT NOT NULL,
            started_by TEXT NOT NULL,
            confirmed_by TEXT,
            status TEXT NOT NULL DEFAULT 'in_progress'
                CHECK(status IN ('in_progress','completed','cancelled')),
            started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            completed_at TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (branch_id) REFERENCES branches(id),
            FOREIGN KEY (started_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_stock_takes_branch
            ON stock_takes(branch_id, status) WHERE deleted_at IS NULL;

        -- STOCK TAKE ITEMS
        CREATE TABLE IF NOT EXISTS stock_take_items (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            stock_take_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            batch_id TEXT NOT NULL,
            expected_quantity INTEGER NOT NULL,
            actual_quantity INTEGER NOT NULL DEFAULT 0,
            difference INTEGER NOT NULL DEFAULT 0,
            adjustment_applied INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (stock_take_id) REFERENCES stock_takes(id),
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (batch_id) REFERENCES batches(id)
        );
        CREATE INDEX IF NOT EXISTS idx_stock_take_items_take
            ON stock_take_items(stock_take_id);

        -- SUPPLIER RETURNS
        CREATE TABLE IF NOT EXISTS supplier_returns (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            supplier_id TEXT NOT NULL,
            invoice_id TEXT NOT NULL,
            branch_id TEXT NOT NULL,
            return_number TEXT NOT NULL,
            return_date TEXT NOT NULL,
            total_amount INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','confirmed','cancelled')),
            reason TEXT,
            notes TEXT,
            created_by TEXT NOT NULL,
            confirmed_by TEXT,
            confirmed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
            FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id),
            FOREIGN KEY (branch_id) REFERENCES branches(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_supplier_returns_invoice
            ON supplier_returns(invoice_id) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_supplier_returns_supplier
            ON supplier_returns(supplier_id) WHERE deleted_at IS NULL;

        -- SUPPLIER RETURN ITEMS
        CREATE TABLE IF NOT EXISTS supplier_return_items (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            supplier_return_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            batch_id TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            unit_cost INTEGER NOT NULL,
            total_price INTEGER NOT NULL,
            reason TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (supplier_return_id) REFERENCES supplier_returns(id),
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (batch_id) REFERENCES batches(id)
        );
        CREATE INDEX IF NOT EXISTS idx_supplier_return_items_return
            ON supplier_return_items(supplier_return_id);

        -- AUDIT LOG
        CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            changes_json TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE INDEX IF NOT EXISTS idx_audit_log_entity
            ON audit_log(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_audit_log_user
            ON audit_log(user_id, created_at);

        -- NOTIFICATIONS
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            branch_id TEXT,
            notification_type TEXT NOT NULL
                CHECK(notification_type IN (
                    'low_stock','out_of_stock','expiring_soon','expired',
                    'supplier_overdue','credit_limit_exceeded','large_expense',
                    'session_open_long','stock_take_overdue','backup_overdue'
                )),
            severity TEXT NOT NULL DEFAULT 'warning'
                CHECK(severity IN ('info','warning','critical')),
            title TEXT NOT NULL,
            title_ar TEXT,
            message TEXT NOT NULL,
            message_ar TEXT,
            reference_type TEXT,
            reference_id TEXT,
            is_read INTEGER NOT NULL DEFAULT 0,
            is_dismissed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_tenant
            ON notifications(tenant_id, is_dismissed, is_read) WHERE deleted_at IS NULL;

        -- NOTIFICATION SETTINGS
        CREATE TABLE IF NOT EXISTS notification_settings (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            notification_type TEXT NOT NULL,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            threshold_value INTEGER,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_settings_type
            ON notification_settings(tenant_id, notification_type);

        -- BACKUP LOG
        CREATE TABLE IF NOT EXISTS backup_log (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            backup_type TEXT NOT NULL CHECK(backup_type IN ('local','cloud')),
            file_path TEXT,
            file_size INTEGER,
            status TEXT NOT NULL DEFAULT 'completed'
                CHECK(status IN ('started','completed','failed')),
            sync_status TEXT NOT NULL DEFAULT 'pending'
                CHECK(sync_status IN ('pending','synced','failed')),
            remote_id TEXT,
            error_message TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            created_by TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE INDEX IF NOT EXISTS idx_backup_log_tenant
            ON backup_log(tenant_id, created_at);

        -- CLOUD BACKUP CONFIG
        CREATE TABLE IF NOT EXISTS cloud_config (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL UNIQUE,
            cloud_endpoint TEXT,
            cloud_token TEXT,
            cloud_enabled INTEGER NOT NULL DEFAULT 0,
            last_sync_at TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        ",
    )
    .map_err(|e| format!("Migration failed: {}", e))?;

    // License keys history table (separate batch so it runs on existing DBs safely)
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS license_keys (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            key_hash TEXT NOT NULL UNIQUE,
            plan TEXT NOT NULL,
            activated_at TEXT NOT NULL,
            expires_at TEXT,
            max_branches INTEGER NOT NULL DEFAULT 1,
            max_users INTEGER NOT NULL DEFAULT 2,
            feature_flags INTEGER NOT NULL DEFAULT 0,
            activated_by TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE INDEX IF NOT EXISTS idx_license_keys_tenant
            ON license_keys(tenant_id, activated_at);
        "
    )
    .map_err(|e| format!("License migration failed: {}", e))?;

    // Assets & Depreciation tables (additive batch, safe on existing DBs)
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS asset_categories (
            id          TEXT PRIMARY KEY,
            tenant_id   TEXT NOT NULL,
            name        TEXT NOT NULL,
            name_ar     TEXT,
            useful_life_years INTEGER NOT NULL DEFAULT 5,
            depreciation_method TEXT NOT NULL DEFAULT 'straight_line'
                CHECK(depreciation_method IN ('straight_line','declining_balance')),
            salvage_rate REAL NOT NULL DEFAULT 0.0,
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at  TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS assets (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            branch_id       TEXT NOT NULL,
            category_id     TEXT,
            name            TEXT NOT NULL,
            name_ar         TEXT,
            asset_code      TEXT,
            serial_number   TEXT,
            purchase_date   TEXT NOT NULL,
            purchase_cost   INTEGER NOT NULL,
            salvage_value   INTEGER NOT NULL DEFAULT 0,
            useful_life_years INTEGER NOT NULL DEFAULT 5,
            depreciation_method TEXT NOT NULL DEFAULT 'straight_line'
                CHECK(depreciation_method IN ('straight_line','declining_balance')),
            status          TEXT NOT NULL DEFAULT 'active'
                CHECK(status IN ('active','disposed','written_off')),
            disposal_date   TEXT,
            disposal_value  INTEGER,
            notes           TEXT,
            created_by      TEXT,
            created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at      TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (branch_id) REFERENCES branches(id),
            FOREIGN KEY (category_id) REFERENCES asset_categories(id)
        );
        CREATE INDEX IF NOT EXISTS idx_assets_tenant_branch
            ON assets(tenant_id, branch_id) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_assets_status
            ON assets(tenant_id, status) WHERE deleted_at IS NULL;

        CREATE TABLE IF NOT EXISTS depreciation_entries (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            asset_id        TEXT NOT NULL,
            period_year     INTEGER NOT NULL,
            period_month    INTEGER NOT NULL,
            opening_nbv     INTEGER NOT NULL,
            depreciation    INTEGER NOT NULL,
            closing_nbv     INTEGER NOT NULL,
            created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            UNIQUE(asset_id, period_year, period_month),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (asset_id) REFERENCES assets(id)
        );
        CREATE INDEX IF NOT EXISTS idx_depreciation_asset
            ON depreciation_entries(asset_id, period_year, period_month);
        "
    )
    .map_err(|e| format!("Assets migration failed: {}", e))?;

    // License server cache — stores server validation results for offline-tolerant revocation checks
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS license_server_cache (
            tenant_id          TEXT PRIMARY KEY,
            key_hash           TEXT NOT NULL,
            server_valid       INTEGER NOT NULL DEFAULT 1,
            revoked            INTEGER NOT NULL DEFAULT 0,
            last_checked_at    TEXT NOT NULL,
            next_check_at      TEXT,
            offline_grace_until TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        "
    )
    .map_err(|e| format!("License server cache migration failed: {}", e))?;

    // Cloud sync foundation (desktop -> cloud read model outbox)
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS cloud_sync_state (
            tenant_id        TEXT PRIMARY KEY,
            last_synced_at   TEXT,
            last_attempt_at  TEXT,
            last_error       TEXT,
            updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS cloud_sync_table_state (
            tenant_id        TEXT NOT NULL,
            table_name       TEXT NOT NULL,
            last_sync_at     TEXT,
            row_count        INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (tenant_id, table_name),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS cloud_sync_outbox (
            id               TEXT PRIMARY KEY,
            tenant_id        TEXT NOT NULL,
            event_type       TEXT NOT NULL,
            entity_type      TEXT NOT NULL,
            entity_id        TEXT NOT NULL,
            payload_json     TEXT,
            status           TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','processing','synced','failed')),
            attempt_count    INTEGER NOT NULL DEFAULT 0,
            last_attempt_at  TEXT,
            last_error       TEXT,
            created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE INDEX IF NOT EXISTS idx_cloud_sync_outbox_status
            ON cloud_sync_outbox(tenant_id, status, created_at);
        "
    )
    .map_err(|e| format!("Cloud sync migration failed: {}", e))?;

    // Backfill new columns for already-initialized databases.
    ensure_column(&conn, "supplier_invoices", "tax_amount", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(&conn, "sales", "tax_amount", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(&conn, "tenants", "onboarding_completed", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(&conn, "backup_log", "sync_status", "TEXT NOT NULL DEFAULT 'pending'")?;
    ensure_column(&conn, "backup_log", "remote_id", "TEXT")?;
    ensure_column(&conn, "products", "unit_id", "TEXT")?;
    ensure_column(&conn, "products", "enable_sub_units", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(&conn, "products", "sub_unit_id", "TEXT")?;
    ensure_column(&conn, "products", "sub_unit_ratio", "INTEGER")?;
    ensure_column(&conn, "sales", "payment_method_id", "TEXT")?;
    ensure_column(&conn, "sales", "payment_method_name", "TEXT")?;
    ensure_column(&conn, "products", "manufacturer", "TEXT")?;
    ensure_column(&conn, "products", "active_ingredient", "TEXT")?;
    ensure_column(&conn, "products", "dosage_form", "TEXT")?;
    ensure_column(&conn, "products", "storage_conditions", "TEXT")?;
    ensure_column(&conn, "products", "is_prescription", "INTEGER NOT NULL DEFAULT 0")?;

    ensure_column(&conn, "users", "email", "TEXT")?;
    ensure_column(&conn, "cloud_sync_state", "last_auto_run_at", "TEXT")?;
    ensure_column(&conn, "cloud_sync_state", "last_run_mode", "TEXT")?;
    ensure_column(&conn, "cloud_sync_state", "last_run_processed", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(&conn, "cloud_sync_state", "last_run_synced", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(&conn, "cloud_sync_state", "last_run_failed", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(&conn, "cloud_sync_state", "last_run_retried", "INTEGER NOT NULL DEFAULT 0")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS cloud_sync_config (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        );
        INSERT INTO cloud_sync_config (key, value)
        VALUES ('endpoint', 'https://pharmacy.taj.systems')
        ON CONFLICT(key) DO NOTHING;
        UPDATE cloud_sync_config
        SET value = 'https://pharmacy.taj.systems'
        WHERE key = 'endpoint'
          AND value IN (
              'http://178.104.158.147',
              'https://178.104.158.147',
              'http://taj.systems'
          );"
    ).map_err(|e| e.to_string())?;

    // Pharmacy configs for multi-pharmacy admin mode (stored in system.db)
    // This table is created in the system database, not tenant databases
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS pharmacy_configs (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL UNIQUE,
            name            TEXT NOT NULL,
            name_ar         TEXT,
            cloud_endpoint  TEXT NOT NULL,
            cloud_token     TEXT NOT NULL,
            data_dir        TEXT NOT NULL,
            is_active       INTEGER NOT NULL DEFAULT 0,
            is_default      INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE INDEX IF NOT EXISTS idx_pharmacy_configs_active
            ON pharmacy_configs(is_active);
        "
    ).map_err(|e| format!("Pharmacy configs migration failed: {}", e))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS product_substitutes (
            id           TEXT PRIMARY KEY,
            tenant_id    TEXT NOT NULL,
            product_id   TEXT NOT NULL,
            substitute_id TEXT NOT NULL,
            notes        TEXT,
            created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            UNIQUE(tenant_id, product_id, substitute_id),
            FOREIGN KEY (product_id)   REFERENCES products(id),
            FOREIGN KEY (substitute_id) REFERENCES products(id)
        );
        CREATE INDEX IF NOT EXISTS idx_product_substitutes_product
            ON product_substitutes(tenant_id, product_id);
        CREATE INDEX IF NOT EXISTS idx_product_substitutes_sub
            ON product_substitutes(tenant_id, substitute_id);
        "
    ).map_err(|e| format!("product_substitutes migration failed: {}", e))?;

    ensure_column(&conn, "products", "image_path", "TEXT")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS supplier_payment_schedules (
            id          TEXT PRIMARY KEY,
            tenant_id   TEXT NOT NULL,
            invoice_id  TEXT NOT NULL,
            due_date    TEXT NOT NULL,
            amount      INTEGER NOT NULL,
            note        TEXT,
            is_paid     INTEGER NOT NULL DEFAULT 0,
            paid_at     TEXT,
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at  TEXT,
            FOREIGN KEY (tenant_id)  REFERENCES tenants(id),
            FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id)
        );
        CREATE INDEX IF NOT EXISTS idx_payment_schedules_invoice
            ON supplier_payment_schedules(invoice_id) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_payment_schedules_due
            ON supplier_payment_schedules(tenant_id, due_date, is_paid) WHERE deleted_at IS NULL;
        "
    ).map_err(|e| format!("payment_schedules migration failed: {}", e))?;

    ensure_column(&conn, "supplier_payment_schedules", "payment_id", "TEXT")?;
    ensure_column(&conn, "supplier_payment_schedules", "account_id", "TEXT")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS expense_templates (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            name            TEXT NOT NULL,
            name_ar         TEXT,
            category_id     TEXT,
            default_amount  INTEGER NOT NULL DEFAULT 0,
            payment_method  TEXT NOT NULL DEFAULT 'cash',
            account_id      TEXT,
            is_active       INTEGER NOT NULL DEFAULT 1,
            sort_order      INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            deleted_at      TEXT,
            FOREIGN KEY (tenant_id)   REFERENCES tenants(id),
            FOREIGN KEY (category_id) REFERENCES expense_categories(id)
        );
        CREATE INDEX IF NOT EXISTS idx_expense_templates_tenant
            ON expense_templates(tenant_id, is_active) WHERE deleted_at IS NULL;
        "
    ).map_err(|e| format!("expense_templates migration failed: {}", e))?;

    ensure_column(&conn, "sales", "void_reason", "TEXT")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS pos_parked_carts (
            id           TEXT PRIMARY KEY,
            session_id   TEXT NOT NULL,
            tenant_id    TEXT NOT NULL,
            state_json   TEXT NOT NULL,
            saved_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE INDEX IF NOT EXISTS idx_pos_parked_carts_session
            ON pos_parked_carts(session_id, tenant_id);
        "
    ).map_err(|e| format!("pos_parked_carts migration failed: {}", e))?;

    // Phase 3.5: Add updated_at to tables that sync to cloud (for delta sync)
    ensure_column(&conn, "sale_items", "updated_at", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(&conn, "stock_movements", "updated_at", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(&conn, "supplier_payments", "updated_at", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(&conn, "customer_payments", "updated_at", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(&conn, "sale_payments", "updated_at", "TEXT NOT NULL DEFAULT ''")?;

    // Phase 3.5: Add missing columns to existing cloud_sync_outbox
    ensure_column(&conn, "cloud_sync_outbox", "branch_id", "TEXT NOT NULL DEFAULT 'main-branch'")?;
    ensure_column(&conn, "cloud_sync_outbox", "synced_at", "TEXT")?;

    // Phase 4.3: Pending update tracking
    ensure_column(&conn, "tenants", "pending_update_version", "TEXT")?;
    ensure_column(&conn, "tenants", "pending_update_checked_at", "TEXT")?;

    // Phase 4: System alert dismissals
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS system_alert_dismissals (
            tenant_id TEXT NOT NULL,
            alert_type TEXT NOT NULL,
            dismissed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            PRIMARY KEY (tenant_id, alert_type)
        );"
    ).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_cloud_sync_outbox_pending
            ON cloud_sync_outbox(tenant_id, branch_id, created_at) WHERE synced_at IS NULL;"
    ).ok(); // non-critical: index may already exist

    // Money Accounts Pro: bank provider + transfer fees
    ensure_column(&conn, "accounts", "bank_provider", "TEXT")?;
    ensure_column(&conn, "accounts", "internal_fee", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(&conn, "accounts", "external_fee", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(&conn, "accounts", "phone_label", "TEXT")?;

    // Sync: outbox for deleted record IDs to clear stale cloud data
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS cloud_sync_deletions (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            branch_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );"
    ).map_err(|e| e.to_string())?;

    // TASK-100: migrate customers with credit_limit=0 (old "unlimited" semantic)
    // who have outstanding balances to the sentinel value -1 (new "unlimited")
    conn.execute(
        "UPDATE customers SET credit_limit = -1 WHERE credit_limit = 0 AND current_balance > 0",
        [],
    ).map_err(|e| e.to_string())?;

    // TASK-702: missing indexes
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id) WHERE customer_id IS NOT NULL;
         CREATE INDEX IF NOT EXISTS idx_expenses_account_id ON expenses(account_id) WHERE account_id IS NOT NULL;
         CREATE INDEX IF NOT EXISTS idx_customer_payments_tenant ON customer_payments(tenant_id);
         CREATE INDEX IF NOT EXISTS idx_account_transactions_tenant ON account_transactions(tenant_id);"
    ).map_err(|e| e.to_string())?;

    log::info!("Database migrations completed successfully");
    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, column_def: &str) -> Result<(), String> {
    let pragma_sql = format!("PRAGMA table_info({})", table);
    let mut stmt = conn.prepare(&pragma_sql).map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let existing: String = row.get(1).map_err(|e| e.to_string())?;
        if existing == column {
            return Ok(());
        }
    }

    let alter_sql = format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, column_def);
    conn.execute(&alter_sql, []).map_err(|e| e.to_string())?;
    Ok(())
}
