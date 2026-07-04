mod db;
mod commands;

use db::Database;
use std::fs;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Setup logging
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Setup database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("فشل الحصول على مجلد بيانات التطبيق");
            fs::create_dir_all(&app_data_dir)
                .expect("فشل إنشاء مجلد بيانات التطبيق");

            // Initialize database
            let db_path = app_data_dir.join("pharmacy.db");
            let database = Database::new(&db_path)
                .expect("فشل تهيئة قاعدة البيانات");
            let cloud_sync_runtime = commands::cloud_sync::CloudSyncRuntime::default();
            let auth_session = commands::session_state::AuthSessionState::new();

            commands::auth::init_token_secret(&app_data_dir);
            commands::settings_backup::init_backup_secrets(&app_data_dir);
            commands::settings_sync_config::init_cloud_config_from_db(&database);

            commands::cloud_sync_scheduler::spawn_background_scheduler(
                database.clone(),
                cloud_sync_runtime.clone(),
            );

            commands::cloud_sync_scheduler::spawn_snapshot_scheduler(database.clone());
            commands::settings_backup_scheduler::spawn_backup_scheduler(
                database.clone(),
                app_data_dir.clone(),
            );

            app.manage(database);
            app.manage(cloud_sync_runtime);
            app.manage(auth_session);

            Ok(())
        })
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::auth::login,
            commands::auth::refresh_session,
            commands::auth::get_current_user,
            commands::auth::check_permission,
            commands::auth::reset_admin_password,
            commands::auth::clear_auth_session,
            commands::products::get_products,
            commands::products::get_product,
            commands::products::create_product,
            commands::products::update_product,
            commands::products::import_products,
            commands::products::toggle_product_active,
            commands::products::get_product_categories,
            commands::products_substitutes::get_product_substitutes,
            commands::products_substitutes::add_product_substitute,
            commands::products_substitutes::remove_product_substitute,
            commands::products_images::save_product_image,
            commands::products_images::get_product_image,
            commands::products_images::delete_product_image,
            commands::users::get_users,
            commands::users::create_user,
            commands::users::update_user,
            commands::users::get_roles,
            commands::users::get_branches,
            commands::permissions::list_roles,
            commands::permissions::save_role,
            commands::permissions::delete_role,
            commands::permissions::assign_user_role,
            commands::permissions::set_user_overrides,
            commands::purchases_suppliers::get_suppliers,
            commands::purchases_suppliers::create_supplier,
            commands::purchases_suppliers::update_supplier,
            commands::purchases_invoices::get_purchase_invoices,
            commands::purchases_invoices::get_purchase_invoice,
            commands::purchases_invoices::create_purchase_draft,
            // commands::purchases::confirm_purchase, // deprecated — use confirm_purchase_with_payment
            commands::purchases::confirm_purchase_with_payment,
            commands::purchases::cancel_purchase,
            commands::purchases::delete_purchase_draft,
            commands::purchases::return_purchase_to_draft,
            commands::purchases_schedules::update_purchase_invoice,
            commands::purchases_schedules::get_payment_schedules,
            commands::purchases_schedules::create_payment_schedule,
            commands::purchases_schedules::mark_schedule_paid,
            commands::purchases_schedules::delete_payment_schedule,
            commands::purchases_returns::create_purchase_return,
            commands::purchases_returns::get_batch_sales,
            commands::pos::get_active_session,
            commands::pos::open_session,
            commands::pos::search_products_pos,
            commands::pos::get_pos_substitutes,
            commands::pos_sale_create::create_sale,
            commands::pos::close_session,
            commands::pos::get_session_history,
            commands::pos::get_accounts,
            commands::pos_session_detail::get_session_sales,
            commands::pos_session_detail::get_session_product_summary,
            commands::pos_session_detail::get_sale_detail,
            commands::pos_returns::create_return,
            commands::pos_returns::get_session_returns,
            commands::pos_returns::get_sale_by_number,
            commands::pos_invoice::get_invoice_sales,
            commands::pos_invoice::create_invoice_sale,
            commands::pos_workspace::save_pos_workspace_state,
            commands::pos_workspace::load_pos_workspace_state,
            commands::pos_workspace::clear_pos_workspace_state,
            commands::expenses::get_expense_categories,
            commands::expenses::create_expense_category,
            commands::expenses::get_expenses,
            commands::expenses::create_expense,
            commands::expenses::update_expense,
            commands::expenses::delete_expense,
            commands::expenses::get_expense_summary,
            commands::expenses::get_expense_templates,
            commands::expenses::create_expense_template,
            commands::expenses::delete_expense_template,
            commands::customers::get_customers,
            commands::customers::get_customer,
            commands::customers::create_customer,
            commands::customers::update_customer,
            commands::customers::toggle_customer_active,
            commands::customers::record_customer_payment,
            commands::customers::get_customer_statement,
            commands::suppliers::get_suppliers_full,
            commands::suppliers::get_supplier,
            commands::suppliers::create_supplier_full,
            commands::suppliers::update_supplier_full,
            commands::suppliers::toggle_supplier_active,
            commands::suppliers::record_supplier_payment,
            commands::suppliers::get_supplier_statement,
            commands::accounts::get_all_accounts,
            commands::accounts::create_account,
            commands::accounts::update_account,
            commands::accounts::get_account_ledger,
            commands::accounts::get_accounts_summary,
            commands::accounts::get_transfer_fee_preview,
            commands::accounts::manual_transfer,
            commands::reports_sales::get_dashboard_stats,
            commands::reports_sales::get_sales_report,
            commands::reports_inventory::get_inventory_report,
            commands::reports_inventory::get_expiry_report,
            commands::reports_pl::get_profit_loss_report,
            commands::reports::get_supplier_aging_report,
            commands::reports::get_customer_credit_report,
            commands::reports::get_balance_sheet_summary,
            commands::reports_tax::get_tax_report,
            commands::warehouse::get_storage_locations,
            commands::warehouse::create_storage_location,
            commands::warehouse::update_storage_location,
            commands::warehouse::toggle_storage_location_active,
            commands::warehouse::get_location_batches,
            commands::warehouse::get_stock_movements,
            commands::warehouse_stocktake::get_stock_takes,
            commands::warehouse_stocktake::start_stock_take,
            commands::warehouse_stocktake::get_stock_take_items,
            commands::warehouse_stocktake::update_stock_take_item,
            commands::warehouse_stocktake::confirm_stock_take,
            commands::warehouse_stocktake::cancel_stock_take,
            commands::warehouse::get_supplier_returns,
            commands::warehouse::create_supplier_return,
            commands::warehouse::confirm_supplier_return,
            commands::warehouse::get_invoice_batches,
            commands::warehouse_transfer::transfer_stock,
            commands::warehouse_batch::dispose_batch,
            commands::warehouse_batch::recall_batch,
            commands::warehouse_opening_stock::get_setup_mode,
            commands::warehouse_opening_stock::finalize_setup_mode,
            commands::warehouse_opening_stock::add_opening_stock_batch,
            commands::warehouse_opening_stock::import_opening_stock_bulk,
            commands::warehouse::get_low_stock_products,
            commands::pos_void::void_sale,
            commands::notifications::get_notifications,
            commands::notifications::mark_notification_read,
            commands::notifications::mark_all_notifications_read,
            commands::notifications::get_system_alerts,
            commands::notifications::check_pending_update,
            commands::notifications::dismiss_system_alert,
            commands::notifications::undismiss_all_system_alerts,
            commands::settings::get_tenant_settings,
            commands::settings::update_tenant_settings,
            commands::settings::set_usd_rate,
            commands::settings::save_pharmacy_logo,
            commands::settings::get_pharmacy_logo,
            commands::settings::get_branches_full,
            commands::settings::create_branch,
            commands::settings::update_branch,
            commands::settings::toggle_branch_active,
            commands::settings::get_notification_settings,
            commands::settings::update_notification_setting,
            commands::settings::create_backup,
            commands::settings::get_backup_history,
            commands::settings::get_cloud_config,
            commands::settings::save_cloud_config,
            commands::settings_sync_config::get_sync_config,
            commands::settings_sync_config::save_sync_config,
            commands::settings::upload_backup_to_cloud,
            commands::settings::get_cloud_backups,
            commands::settings::delete_cloud_backup,
            commands::settings::restore_from_cloud,
            commands::settings::restore_from_local,
            commands::settings_backup::get_auto_backup_status,
            commands::settings::write_audit_log,
            commands::settings::get_audit_log,
            commands::settings::get_permissions_upgrade_banner,
            commands::settings::dismiss_permissions_upgrade_banner,
            commands::settings_license::get_license_info,
            commands::settings_license::activate_license,
            commands::settings_license::get_license_history,
            commands::settings_license::check_license_online,
            commands::updater::check_for_update,
            commands::updater::install_update,
            commands::settings_onboarding::check_onboarding,
            commands::settings_onboarding::complete_onboarding,
            commands::settings_onboarding::get_db_tenant_id,
            commands::settings_onboarding::activate_license_cloud,
            commands::settings_onboarding::renew_license_cloud,
            commands::settings_sync_config::fetch_cloud_config,
            commands::settings_sync_config::get_cloud_remote_config_cached,
            commands::catalog::get_unit_measures,
            commands::catalog::create_unit_measure,
            commands::catalog::update_unit_measure,
            commands::catalog::delete_unit_measure,
            commands::catalog::get_payment_methods,
            commands::catalog::create_payment_method,
            commands::catalog::update_payment_method,
            commands::catalog::delete_payment_method,
            commands::assets::get_asset_categories,
            commands::assets::create_asset_category,
            commands::assets::get_assets,
            commands::assets::create_asset,
            commands::assets::update_asset,
            commands::assets::dispose_asset,
            commands::assets::get_depreciation_entries,
            commands::assets::run_depreciation,
            commands::assets::get_assets_summary,
            commands::cloud_sync_outbox::get_cloud_sync_status,
            commands::cloud_sync_outbox::list_cloud_sync_outbox,
            commands::cloud_sync_outbox::enqueue_cloud_sync_event,
            commands::cloud_sync_outbox::queue_owner_read_model_snapshot,
            commands::cloud_sync_outbox::run_cloud_sync_export,
            commands::cloud_sync_outbox::run_cloud_sync_cycle,
            // Table-snapshot sync (Phase 5)
            commands::cloud_sync_snapshot::sync_table_snapshot,
            commands::cloud_sync_snapshot::sync_tables_batch,
            commands::cloud_sync_snapshot::get_sync_status,
            commands::cloud_sync_snapshot::sync_all_tables_now,
            commands::cloud_sync_restore::pull_all_tables,
            commands::cloud_sync_restore::recover_cloud_credentials,
            commands::cloud_sync_restore::finalize_restore,
        ])
        .run(tauri::generate_context!())
        .expect("خطأ أثناء تشغيل التطبيق");
}

