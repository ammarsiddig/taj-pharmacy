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
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
            let db_path = app_dir.join("pms-pharmacy.db");

            log::info!("Database path: {:?}", db_path);

            let database = Database::new(&db_path)
                .expect("Failed to initialize database");
            let cloud_sync_runtime = commands::cloud_sync::CloudSyncRuntime::default();

            commands::settings::init_cloud_config_from_db(&database);

            commands::cloud_sync::spawn_background_scheduler(
                database.clone(),
                cloud_sync_runtime.clone(),
            );

            commands::cloud_sync::spawn_snapshot_scheduler(database.clone());

            app.manage(database);
            app.manage(cloud_sync_runtime);

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
            commands::auth::get_current_user,
            commands::auth::check_permission,
            commands::auth::reset_admin_password,
            commands::products::get_products,
            commands::products::get_product,
            commands::products::create_product,
            commands::products::update_product,
            commands::products::import_products,
            commands::products::toggle_product_active,
            commands::products::get_product_categories,
            commands::products::get_product_substitutes,
            commands::products::add_product_substitute,
            commands::products::remove_product_substitute,
            commands::products::save_product_image,
            commands::products::get_product_image,
            commands::products::delete_product_image,
            commands::users::get_users,
            commands::users::create_user,
            commands::users::update_user,
            commands::users::get_roles,
            commands::users::get_branches,
            commands::purchases::get_suppliers,
            commands::purchases::create_supplier,
            commands::purchases::update_supplier,
            commands::purchases::get_purchase_invoices,
            commands::purchases::get_purchase_invoice,
            commands::purchases::create_purchase_draft,
            // commands::purchases::confirm_purchase, // deprecated — use confirm_purchase_with_payment
            commands::purchases::confirm_purchase_with_payment,
            commands::purchases::cancel_purchase,
            commands::purchases::delete_purchase_draft,
            commands::purchases::return_purchase_to_draft,
            commands::purchases::update_purchase_invoice,
            commands::purchases::get_payment_schedules,
            commands::purchases::create_payment_schedule,
            commands::purchases::mark_schedule_paid,
            commands::purchases::delete_payment_schedule,
            commands::purchases::create_purchase_return,
            commands::purchases::get_batch_sales,
            commands::pos::get_active_session,
            commands::pos::open_session,
            commands::pos::search_products_pos,
            commands::pos::get_pos_substitutes,
            commands::pos::create_sale,
            commands::pos::close_session,
            commands::pos::get_session_history,
            commands::pos::get_accounts,
            commands::pos::get_session_sales,
            commands::pos::get_session_product_summary,
            commands::pos::get_sale_detail,
            commands::pos::create_return,
            commands::pos::get_session_returns,
            commands::pos::get_sale_by_number,
            commands::pos::get_invoice_sales,
            commands::pos::create_invoice_sale,
            commands::pos::save_pos_workspace_state,
            commands::pos::load_pos_workspace_state,
            commands::pos::clear_pos_workspace_state,
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
            commands::accounts::get_account_ledger,
            commands::accounts::get_accounts_summary,
            commands::accounts::manual_transfer,
            commands::reports::get_dashboard_stats,
            commands::reports::get_sales_report,
            commands::reports::get_inventory_report,
            commands::reports::get_expiry_report,
            commands::reports::get_profit_loss_report,
            commands::reports::get_supplier_aging_report,
            commands::reports::get_customer_credit_report,
            commands::reports::get_balance_sheet_summary,
            commands::reports::get_tax_report,
            commands::warehouse::get_storage_locations,
            commands::warehouse::create_storage_location,
            commands::warehouse::update_storage_location,
            commands::warehouse::toggle_storage_location_active,
            commands::warehouse::get_location_batches,
            commands::warehouse::get_stock_movements,
            commands::warehouse::get_stock_takes,
            commands::warehouse::start_stock_take,
            commands::warehouse::get_stock_take_items,
            commands::warehouse::update_stock_take_item,
            commands::warehouse::confirm_stock_take,
            commands::warehouse::cancel_stock_take,
            commands::warehouse::get_supplier_returns,
            commands::warehouse::create_supplier_return,
            commands::warehouse::confirm_supplier_return,
            commands::warehouse::get_invoice_batches,
            commands::warehouse::transfer_stock,
            commands::warehouse::dispose_batch,
            commands::warehouse::recall_batch,
            commands::pos::void_sale,
            commands::notifications::get_notifications,
            commands::notifications::mark_notification_read,
            commands::notifications::mark_all_notifications_read,
            commands::notifications::get_system_alerts,
            commands::settings::get_tenant_settings,
            commands::settings::update_tenant_settings,
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
            commands::settings::get_sync_config,
            commands::settings::save_sync_config,
            commands::settings::upload_backup_to_cloud,
            commands::settings::get_cloud_backups,
            commands::settings::delete_cloud_backup,
            commands::settings::restore_from_cloud,
            commands::settings::restore_from_local,
            commands::settings::write_audit_log,
            commands::settings::get_audit_log,
            commands::settings::get_license_info,
            commands::settings::activate_license,
            commands::settings::get_license_history,
            commands::settings::check_license_online,
            commands::updater::check_for_update,
            commands::updater::install_update,
            commands::settings::check_onboarding,
            commands::settings::complete_onboarding,
            commands::settings::activate_license_cloud,
            commands::settings::renew_license_cloud,
            commands::settings::fetch_cloud_config,
            commands::settings::get_cloud_remote_config_cached,
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
            commands::cloud_sync::get_cloud_sync_status,
            commands::cloud_sync::list_cloud_sync_outbox,
            commands::cloud_sync::enqueue_cloud_sync_event,
            commands::cloud_sync::queue_owner_read_model_snapshot,
            commands::cloud_sync::run_cloud_sync_export,
            commands::cloud_sync::run_cloud_sync_cycle,
            // Table-snapshot sync (Phase 5)
            commands::cloud_sync::sync_table_snapshot,
            commands::cloud_sync::sync_tables_batch,
            commands::cloud_sync::get_sync_status,
            commands::cloud_sync::sync_all_tables_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

