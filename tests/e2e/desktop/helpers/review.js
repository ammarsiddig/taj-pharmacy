// Review harness for the day-in-the-life scenario.
// Records every step's PASS/FAIL (never aborts the whole run on one failure),
// keeps an "expected" ledger to reconcile against the DB at the end, and writes
// a detailed REPORT.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const REPORT_PATH = path.join(E2E_ROOT, 'REPORT.md');

export class Review {
  constructor() {
    this.steps = [];        // { phase, name, status, detail }
    this.bugs = [];         // { title, expected, actual, repro, screen }
    this.recon = [];        // { name, expected, actual, ok }
    this.created = [];      // { kind, tag, id, reversed } for cleanup tracking
    this.coverage = [];     // { area, status, note } explicit coverage checklist
    this.phase = '';
    this.money = (p) => (p == null ? 'n/a' : (p / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' SDG');
    this.title = 'Day-in-the-Life E2E Review';
  }

  setPhase(p) { this.phase = p; console.log(`\n===== PHASE: ${p} =====`); }

  // Run one step; record PASS/FAIL; return the fn's result (or undefined on fail).
  async step(name, fn) {
    const rec = { phase: this.phase, name, status: 'PASS', detail: '' };
    try {
      const r = await fn();
      if (r && typeof r === 'object' && r.__detail) rec.detail = r.__detail;
      console.log(`  [PASS] ${name}${rec.detail ? ' — ' + rec.detail : ''}`);
      this.steps.push(rec);
      return r;
    } catch (e) {
      rec.status = 'FAIL';
      rec.detail = (e && e.message) ? e.message : String(e);
      console.log(`  [FAIL] ${name} — ${rec.detail}`);
      this.steps.push(rec);
      return undefined;
    }
  }

  // Assertion that records into the current step (throw to fail the step).
  assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); return true; }

  bug(title, { expected, actual, repro, screen } = {}) {
    this.bugs.push({ title, expected, actual, repro, screen });
    console.log(`  [BUG] ${title} | expected=${expected} actual=${actual}`);
  }

  // Record a reconciliation check (expected vs actual, both in piasters or raw).
  reconcile(name, expected, actual, { money = true } = {}) {
    const ok = Number(expected) === Number(actual);
    this.recon.push({ name, expected, actual, ok, money });
    console.log(`  [RECON ${ok ? 'OK ' : 'MISMATCH'}] ${name}: expected=${expected} actual=${actual}`);
    if (!ok) {
      this.bug(`Reconciliation mismatch: ${name}`, {
        expected: money ? this.money(expected) : expected,
        actual: money ? this.money(actual) : actual,
        repro: 'day-in-the-life scenario',
        screen: name,
      });
    }
    return ok;
  }

  // Explicit coverage record. status: 'covered' | 'partial' | 'not-covered'.
  cover(area, status, note = '') { this.coverage.push({ area, status, note }); }

  track(kind, tag, id) { this.created.push({ kind, tag, id, reversed: false }); }
  markReversed(id, note = '') {
    const c = this.created.find((x) => x.id === id);
    if (c) { c.reversed = true; c.note = note; }
  }

  summary() {
    const pass = this.steps.filter((s) => s.status === 'PASS').length;
    const fail = this.steps.filter((s) => s.status === 'FAIL').length;
    return { pass, fail, total: this.steps.length, bugs: this.bugs.length,
             reconOk: this.recon.filter((r) => r.ok).length, reconBad: this.recon.filter((r) => !r.ok).length };
  }

  writeReport() {
    const s = this.summary();
    const L = [];
    L.push(`# TAJ Pharmacy — ${this.title}`);
    L.push('');
    L.push(`_Generated ${new Date().toISOString()} — driven against the installed \`C:\\Program Files\\TAJ Pharmacy\\app.exe\` + Owner PWA._`);
    L.push('');
    L.push('## Summary');
    L.push('');
    L.push('| Metric | Value |');
    L.push('| --- | --- |');
    L.push(`| Steps passed | ${s.pass} / ${s.total} |`);
    L.push(`| Steps failed | ${s.fail} |`);
    L.push(`| Reconciliation checks OK | ${s.reconOk} |`);
    L.push(`| Reconciliation mismatches | ${s.reconBad} |`);
    L.push(`| Bugs / discrepancies found | ${s.bugs} |`);
    L.push('');

    // Steps by phase
    L.push('## Steps (in order)');
    L.push('');
    L.push('| # | Phase | Step | Result | Detail |');
    L.push('| --- | --- | --- | --- | --- |');
    this.steps.forEach((st, i) => {
      L.push(`| ${i + 1} | ${st.phase} | ${esc(st.name)} | ${st.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} | ${esc(st.detail)} |`);
    });
    L.push('');

    // Reconciliation
    L.push('## Reconciliation');
    L.push('');
    if (this.recon.length === 0) L.push('_No reconciliation checks recorded._');
    else {
      L.push('| Check | Expected | Actual | Result |');
      L.push('| --- | --- | --- | --- |');
      this.recon.forEach((r) => {
        const ev = r.money ? this.money(r.expected) : r.expected;
        const av = r.money ? this.money(r.actual) : r.actual;
        L.push(`| ${esc(r.name)} | ${ev} | ${av} | ${r.ok ? '✅' : '❌ MISMATCH'} |`);
      });
    }
    L.push('');

    // Bugs
    L.push('## Bugs & discrepancies');
    L.push('');
    if (this.bugs.length === 0) L.push('_None found._');
    else this.bugs.forEach((b, i) => {
      L.push(`### ${i + 1}. ${b.title}`);
      if (b.expected !== undefined) L.push(`- **Expected:** ${b.expected}`);
      if (b.actual !== undefined) L.push(`- **Actual:** ${b.actual}`);
      if (b.screen) L.push(`- **Screen:** ${b.screen}`);
      if (b.repro) L.push(`- **Repro:** ${b.repro}`);
      L.push('');
    });

    // Coverage checklist
    if (this.coverage.length) {
      L.push('## Coverage checklist');
      L.push('');
      L.push('| Area | Status | Note |');
      L.push('| --- | --- | --- |');
      const icon = (s) => (s === 'covered' ? '✅ covered' : s === 'partial' ? '🟡 partial' : '⚪ not covered');
      this.coverage.forEach((c) => L.push(`| ${esc(c.area)} | ${icon(c.status)} | ${esc(c.note)} |`));
      L.push('');
    }

    // Cleanup status
    L.push('## Cleanup status');
    L.push('');
    L.push('| Kind | Tag / id | Reversed? | Note |');
    L.push('| --- | --- | --- | --- |');
    this.created.forEach((c) => {
      L.push(`| ${c.kind} | ${esc(c.tag || c.id)} | ${c.reversed ? '✅ yes' : '⚠️ NO'} | ${esc(c.note || '')} |`);
    });
    L.push('');
    const residual = this.created.filter((c) => !c.reversed);
    if (residual.length) L.push(`> ⚠️ **${residual.length} created entities were not confirmed removed** — see the app and the sweep log.`);
    else L.push('> ✅ All created E2E_TEST_ entities were reversed/removed.');
    L.push('');

    fs.writeFileSync(REPORT_PATH, L.join('\n'));
    console.log(`\n[review] REPORT.md written → ${REPORT_PATH}`);
    return REPORT_PATH;
  }
}

function esc(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' '); }
