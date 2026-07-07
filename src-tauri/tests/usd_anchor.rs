// TASK-939 — USD/SDG anchor regression tests (integration test).
//
// Reproduces the reported bug — a confirmed purchase updates `sale_price` but not
// `price_usd_cents`, so the next USD rate change reprices the product back to its
// stale opening-stock anchor and silently discards the purchase price — and proves
// the fix (`reanchor_sale_price` on every non-owner-edit sale_price write).
//
// This lives in `tests/` (out-of-crate) on purpose: it links the normal lib and
// drives the SAME helpers the production commands call, via `app_lib::test_support`.
// All money is integer SDG piasters (1 SDG = 100 piasters); USD anchors are cents.

use app_lib::test_support::{
    anchor_all_products_at_rate, migrations, reanchor_product, reanchor_sale_price,
    reprice_all_products_to_rate,
};
use rusqlite::{params, Connection};

const T: &str = "ahsan-tenant";

// R1 = 500.00 SDG/$ (50000 piasters), R2 = 1000.00 (up 2×), R3 = 400.00 (down).
const R1: i64 = 50_000;
const R2: i64 = 100_000;
const R3: i64 = 40_000;
const OPENING: i64 = 100_000; //  1000.00 SDG opening price
const MIN: i64 = 60_000; //        600.00 SDG min sale price
const PURCHASE: i64 = 130_000; //  1300.00 SDG price set by a later purchase

fn fresh_db() -> Connection {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    migrations::run(&conn).expect("run migrations");
    conn.execute(
        "INSERT INTO tenants (id, tenant_id, name, name_ar, currency_code, timezone, usd_rate_piasters)
         VALUES (?1, ?1, 'Al-Ahsan', 'صيدلية الاحسان', 'SDG', 'Africa/Khartoum', 0)",
        params![T],
    )
    .expect("seed tenant");
    conn
}

fn add_product(conn: &Connection, id: &str, sale: i64, min: i64, last: i64) {
    conn.execute(
        "INSERT INTO products (id, tenant_id, trade_name, unit, sale_price, min_sale_price, last_purchase_price)
         VALUES (?1, ?2, ?1, 'box', ?3, ?4, ?5)",
        params![id, T, sale, min, last],
    )
    .expect("insert product");
}

fn set_rate(conn: &Connection, rate: i64) {
    conn.execute(
        "UPDATE tenants SET usd_rate_piasters = ?2 WHERE id = ?1",
        params![T, rate],
    )
    .unwrap();
}

fn get(conn: &Connection, id: &str, col: &str) -> i64 {
    conn.query_row(
        &format!("SELECT {} FROM products WHERE id = ?1", col),
        params![id],
        |r| r.get(0),
    )
    .unwrap()
}

/// The raw sale_price write a confirmed purchase performs. `fix` toggles whether
/// the TASK-939 re-anchor runs (fix on) or the old buggy path (off).
fn purchase_sets_price(conn: &Connection, id: &str, sale: i64, cost: i64, fix: bool) {
    conn.execute(
        "UPDATE products SET last_purchase_price = ?3, sale_price = ?4 WHERE tenant_id = ?1 AND id = ?2",
        params![T, id, cost, sale],
    )
    .unwrap();
    if fix {
        reanchor_sale_price(conn, T, id, sale).unwrap();
    }
}

#[test]
fn activation_derives_anchors_without_changing_prices() {
    let conn = fresh_db();
    add_product(&conn, "p", OPENING, MIN, 50_000);

    set_rate(&conn, R1);
    let n = anchor_all_products_at_rate(&conn, T, R1).unwrap();
    assert_eq!(n, 1, "one product anchored");

    // Prices are untouched by activation…
    assert_eq!(get(&conn, "p", "sale_price"), OPENING, "activation must not move sale_price");
    assert_eq!(get(&conn, "p", "min_sale_price"), MIN, "activation must not move min_sale_price");
    // …only the USD anchors are derived: round(100000*100/50000)=200, round(60000*100/50000)=120.
    assert_eq!(get(&conn, "p", "price_usd_cents"), 200);
    assert_eq!(get(&conn, "p", "min_price_usd_cents"), 120);
}

#[test]
fn bug_repro_purchase_price_snaps_back_on_rate_change_without_fix() {
    let conn = fresh_db();
    add_product(&conn, "buggy", OPENING, MIN, 50_000);

    set_rate(&conn, R1);
    anchor_all_products_at_rate(&conn, T, R1).unwrap(); // anchor = 200 ($2.00)

    // A purchase raises the shelf price to 1300.00 — OLD path: no re-anchor.
    purchase_sets_price(&conn, "buggy", PURCHASE, 90_000, /*fix=*/ false);
    assert_eq!(get(&conn, "buggy", "sale_price"), PURCHASE);
    assert_eq!(get(&conn, "buggy", "price_usd_cents"), 200, "BUG: anchor still reflects the opening price, not the purchase price");

    // Owner doubles the USD rate (R1→R2). Reprice from the (stale) anchor.
    set_rate(&conn, R2);
    reprice_all_products_to_rate(&conn, T, R2).unwrap();

    let priced = get(&conn, "buggy", "sale_price");
    // Correct would be PURCHASE*2 = 260000. The bug yields OPENING*2 = 200000:
    // the 1300.00 purchase price is silently discarded.
    assert_eq!(priced, 200_000, "bug: product snapped back to the opening-derived price");
    assert_ne!(priced, 260_000, "bug: purchase price (1300.00) was lost");
}

#[test]
fn fix_purchase_price_is_preserved_and_scales_both_directions() {
    let conn = fresh_db();
    add_product(&conn, "fixed", OPENING, MIN, 50_000);

    set_rate(&conn, R1);
    anchor_all_products_at_rate(&conn, T, R1).unwrap();

    // Purchase raises the price to 1300.00 — FIXED path re-anchors: 130000*100/50000 = 260 ($2.60).
    purchase_sets_price(&conn, "fixed", PURCHASE, 90_000, /*fix=*/ true);
    assert_eq!(get(&conn, "fixed", "price_usd_cents"), 260, "anchor re-derived from the purchase price");
    assert_eq!(get(&conn, "fixed", "min_price_usd_cents"), 120, "min anchor untouched by a purchase");

    // Rate UP (R1→R2, ×2): price must move UP and preserve the purchase basis.
    set_rate(&conn, R2);
    reprice_all_products_to_rate(&conn, T, R2).unwrap();
    assert_eq!(get(&conn, "fixed", "sale_price"), 260_000, "rate up → purchase 1300.00 scales to 2600.00");
    assert_eq!(get(&conn, "fixed", "min_sale_price"), 120_000, "min scales 600.00 → 1200.00");

    // Rate DOWN (R2→R3, 400.00/$): price must move DOWN, still from the purchase anchor.
    set_rate(&conn, R3);
    reprice_all_products_to_rate(&conn, T, R3).unwrap();
    assert_eq!(get(&conn, "fixed", "sale_price"), 104_000, "rate down → 2.60$ × 400 = 1040.00");
    assert_eq!(get(&conn, "fixed", "min_sale_price"), 48_000, "min 1.20$ × 400 = 480.00");
    assert!(get(&conn, "fixed", "sale_price") > get(&conn, "fixed", "min_sale_price"), "sale stays above the min floor");
}

#[test]
fn reprice_never_writes_a_zero_price_from_a_positive_anchor() {
    let conn = fresh_db();
    add_product(&conn, "cheap", 100, 0, 50); // 1.00 SDG
    conn.execute("UPDATE products SET price_usd_cents = 1 WHERE id = 'cheap'", []).unwrap();
    set_rate(&conn, 40);
    reprice_all_products_to_rate(&conn, T, 40).unwrap();
    assert_eq!(get(&conn, "cheap", "sale_price"), 1, "MAX(1) floor: a positive anchor never yields a 0 price");
}

#[test]
fn opening_stock_fix_anchors_products_created_after_the_rate_is_set() {
    let conn = fresh_db();
    // Feature already active before this product is created via opening stock.
    set_rate(&conn, R1);
    add_product(&conn, "late", OPENING, MIN, 50_000); // raw insert = anchor 0

    // Without an anchor the reprice skips it (WHERE price_usd_cents > 0).
    set_rate(&conn, R2);
    assert_eq!(reprice_all_products_to_rate(&conn, T, R2).unwrap(), 0, "unanchored product is skipped");
    assert_eq!(get(&conn, "late", "sale_price"), OPENING, "…and never reprices");

    // The fix: opening stock calls reanchor_product right after creating it.
    set_rate(&conn, R1);
    reanchor_product(&conn, T, "late", OPENING, MIN).unwrap();
    assert_eq!(get(&conn, "late", "price_usd_cents"), 200);

    // Now a rate change correctly reprices it.
    set_rate(&conn, R2);
    assert_eq!(reprice_all_products_to_rate(&conn, T, R2).unwrap(), 1, "anchored product now reprices");
    assert_eq!(get(&conn, "late", "sale_price"), 200_000, "1000.00 × 2 = 2000.00");
}
