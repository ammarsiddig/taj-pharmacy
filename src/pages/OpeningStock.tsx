import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Upload, Download, Plus, Trash2, CheckCircle2, AlertCircle, ChevronLeft, FileSpreadsheet, Package } from 'lucide-react';
import * as api from '../api';
import { useAuth } from '../hooks/useAuth';
import type { Product } from '../types';
import type { StorageLocationFull } from '../types/warehouse';
import type { BulkOpeningStockRow, BulkOpeningStockResult } from '../api/warehouse';
import Button from '../components/ui/Button';

type Mode = 'menu' | 'single' | 'bulk';

interface SingleEntryRow {
  id: string;
  productId: string;
  quantity: string;
  unitCost: string;
  batchNumber: string;
  expiryDate: string;
  locationId: string;
}

const newRow = (locationId = ''): SingleEntryRow => ({
  id: Math.random().toString(36).slice(2),
  productId: '',
  quantity: '',
  unitCost: '',
  batchNumber: '',
  expiryDate: '',
  locationId,
});

export default function OpeningStock() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const branchId = user?.home_branch_id || user?.branch_id || '';

  const [mode, setMode] = useState<Mode>('menu');
  const [setupMode, setSetupMode] = useState<boolean | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<StorageLocationFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const showToast = (type: 'success' | 'danger', msg: string) => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 5000);
  };

  // Single-product entry
  const [rows, setRows] = useState<SingleEntryRow[]>([newRow()]);
  const [savingSingle, setSavingSingle] = useState(false);

  // Bulk import
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<BulkOpeningStockRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<BulkOpeningStockResult | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, prods, locs] = await Promise.all([
          api.getSetupMode(),
          api.getProducts(),
          branchId ? api.getStorageLocations(branchId) : Promise.resolve([]),
        ]);
        setSetupMode(s.setup_mode);
        setProducts(prods);
        setLocations(locs);
        const defaultLoc = locs.find(l => l.location_type === 'shelf')?.id || locs[0]?.id || '';
        if (defaultLoc) setRows([newRow(defaultLoc)]);
      } catch (err) {
        showToast('danger', String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [branchId]);

  const defaultLocation = useMemo(
    () => locations.find(l => l.location_type === 'shelf')?.id || locations[0]?.id || '',
    [locations],
  );

  // ─── Single entry handlers ────────────────────────────────────────────────

  const updateRow = (id: string, patch: Partial<SingleEntryRow>) =>
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));

  const removeRow = (id: string) =>
    setRows(rs => rs.length > 1 ? rs.filter(r => r.id !== id) : rs);

  const addRow = () => setRows(rs => [...rs, newRow(defaultLocation)]);

  const saveSingle = async () => {
    if (!user?.id || !branchId) {
      showToast('danger', 'لا يمكن تحديد الفرع');
      return;
    }
    const valid = rows.filter(r => r.productId && Number(r.quantity) > 0);
    if (valid.length === 0) {
      showToast('danger', 'أضف صفاً واحداً على الأقل بكمية صحيحة');
      return;
    }
    setSavingSingle(true);
    let ok = 0;
    let fail = 0;
    for (const r of valid) {
      try {
        await api.addOpeningStockBatch(branchId, user.id, {
          product_id: r.productId,
          location_id: r.locationId || defaultLocation,
          quantity: Number(r.quantity),
          unit_cost: r.unitCost ? Number(r.unitCost) : null,
          batch_number: r.batchNumber || null,
          expiry_date: r.expiryDate || null,
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setSavingSingle(false);
    if (fail === 0) {
      showToast('success', `تم إدخال ${ok} دفعة بنجاح`);
      setRows([newRow(defaultLocation)]);
    } else {
      showToast('danger', `نجح ${ok}، فشل ${fail}`);
    }
  };

  // ─── Bulk import handlers ─────────────────────────────────────────────────

  const downloadTemplate = () => {
    const headers = [
      'barcode', 'trade_name', 'trade_name_ar', 'generic_name', 'category',
      'unit', 'sale_price', 'quantity', 'unit_cost', 'batch_number', 'expiry_date',
    ];
    const sample = [{
      barcode: '6281001210013',
      trade_name: 'Panadol Extra',
      trade_name_ar: 'بنادول إكسترا',
      generic_name: 'paracetamol',
      category: 'painkillers',
      unit: 'box',
      sale_price: 15000,
      quantity: 47,
      unit_cost: 12000,
      batch_number: 'B2026-001',
      expiry_date: '2027-03-15',
    }];
    const ws = XLSX.utils.json_to_sheet(sample, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'OpeningStock');
    XLSX.writeFile(wb, 'opening-stock-template.xlsx');
  };

  const handleFile = (file: File) => {
    setParsed([]);
    setParseErrors([]);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        const errs: string[] = [];
        const rows: BulkOpeningStockRow[] = json.map((raw, idx) => {
          const row: BulkOpeningStockRow = {
            barcode: String(raw.barcode ?? '').trim() || null,
            trade_name: String(raw.trade_name ?? '').trim() || null,
            trade_name_ar: String(raw.trade_name_ar ?? '').trim() || null,
            generic_name: String(raw.generic_name ?? '').trim() || null,
            category: String(raw.category ?? '').trim() || null,
            unit: String(raw.unit ?? '').trim() || null,
            sale_price: raw.sale_price ? Number(raw.sale_price) : null,
            quantity: Number(raw.quantity || 0),
            unit_cost: raw.unit_cost ? Number(raw.unit_cost) : null,
            batch_number: String(raw.batch_number ?? '').trim() || null,
            expiry_date: String(raw.expiry_date ?? '').trim() || null,
            location_id: null,
          };
          if (!row.barcode && !row.trade_name && !row.trade_name_ar) {
            errs.push(`الصف ${idx + 2}: اسم المنتج أو الباركود مطلوب`);
          }
          if (!row.quantity || row.quantity <= 0) {
            errs.push(`الصف ${idx + 2}: الكمية يجب أن تكون أكبر من صفر`);
          }
          return row;
        });
        setParsed(rows);
        setParseErrors(errs);
      } catch (err) {
        showToast('danger', `فشل قراءة الملف: ${err}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const runBulkImport = async () => {
    if (!user?.id || !branchId || parsed.length === 0) return;
    setImporting(true);
    try {
      const res = await api.importOpeningStockBulk(branchId, user.id, parsed);
      setResult(res);
      if (res.error_count === 0) {
        showToast('success', `تم استيراد ${res.success_count} صف بنجاح (${res.created_products} منتج جديد)`);
      } else {
        showToast('danger', `نجح ${res.success_count}، فشل ${res.error_count}`);
      }
    } catch (err) {
      showToast('danger', String(err));
    } finally {
      setImporting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="text-center py-12 text-ink-muted">جاري التحميل...</div>;
  }

  if (setupMode === false) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-card border border-ivory-border p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-status-success-bg flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-status-success" />
        </div>
        <h2 className="text-xl font-bold text-ink-main mb-2">وضع الإعداد منتهي</h2>
        <p className="text-sm text-ink-muted mb-5">
          لا يمكن إضافة كميات افتتاحية بعد بدء البيع. لإضافة مخزون جديد، استخدم فاتورة شراء حقيقية.
        </p>
        <Button onClick={() => navigate('/purchases/new')}>إنشاء فاتورة شراء</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-main">الجرد الافتتاحي</h1>
          <p className="text-sm text-ink-muted mt-1">
            إدخال الكميات الموجودة حالياً في صيدليتك بدون فاتورة شراء
          </p>
        </div>
        {mode !== 'menu' && (
          <button
            onClick={() => { setMode('menu'); setResult(null); setParsed([]); setParseErrors([]); }}
            className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink-main"
          >
            <ChevronLeft size={16} />
            رجوع
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Menu ─────────────────────────────────────────────────────── */}
      {mode === 'menu' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => setMode('single')}
            className="bg-white rounded-2xl shadow-card border border-ivory-border p-6 text-right hover:border-primary-400 hover:bg-primary-50/30 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center mb-3">
              <Package size={24} className="text-primary-600" />
            </div>
            <h3 className="text-lg font-bold text-ink-main mb-1">إدخال يدوي (منتج واحد أو أكثر)</h3>
            <p className="text-sm text-ink-muted leading-relaxed">
              أدخل الكميات الافتتاحية لمنتجاتك الموجودة في الصيدلية يدوياً. مناسب للعدد المحدود من الأصناف.
            </p>
          </button>

          <button
            onClick={() => setMode('bulk')}
            className="bg-white rounded-2xl shadow-card border border-ivory-border p-6 text-right hover:border-teal-400 hover:bg-teal-50/30 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center mb-3">
              <FileSpreadsheet size={24} className="text-teal-600" />
            </div>
            <h3 className="text-lg font-bold text-ink-main mb-1">استيراد ملف Excel</h3>
            <p className="text-sm text-ink-muted leading-relaxed">
              ارفع ملف Excel يحتوي على آلاف المنتجات والكميات دفعة واحدة. مناسب للصيدليات الكبيرة المهاجرة من نظام آخر.
            </p>
          </button>
        </div>
      )}

      {/* ── Single entry ─────────────────────────────────────────────── */}
      {mode === 'single' && (
        <div className="bg-white rounded-2xl shadow-card border border-ivory-border p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ivory-border">
                <th className="text-right py-2 px-2 text-xs font-medium text-ink-muted">المنتج</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-ink-muted">الكمية المتوفرة *</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-ink-muted">سعر التكلفة</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-ink-muted">رقم الدفعة</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-ink-muted">تاريخ الانتهاء</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-ink-muted">الموقع</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ivory-border/50">
                  <td className="py-1.5 px-1">
                    <select
                      value={r.productId}
                      onChange={(e) => updateRow(r.id, { productId: e.target.value })}
                      className="w-full rounded-lg border border-ivory-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500"
                    >
                      <option value="">— اختر منتج —</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.trade_name_ar || p.trade_name} {p.barcode ? `· ${p.barcode}` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="number"
                      min={1}
                      value={r.quantity}
                      onChange={(e) => updateRow(r.id, { quantity: e.target.value })}
                      className="w-24 rounded-lg border border-ivory-border px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:border-primary-500"
                      placeholder="0"
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="number"
                      min={0}
                      value={r.unitCost}
                      onChange={(e) => updateRow(r.id, { unitCost: e.target.value })}
                      className="w-28 rounded-lg border border-ivory-border px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:border-primary-500"
                      placeholder="اختياري"
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="text"
                      value={r.batchNumber}
                      onChange={(e) => updateRow(r.id, { batchNumber: e.target.value })}
                      className="w-28 rounded-lg border border-ivory-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500"
                      placeholder="اختياري"
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="date"
                      value={r.expiryDate}
                      onChange={(e) => updateRow(r.id, { expiryDate: e.target.value })}
                      className="w-36 rounded-lg border border-ivory-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500"
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <select
                      value={r.locationId || defaultLocation}
                      onChange={(e) => updateRow(r.id, { locationId: e.target.value })}
                      className="w-32 rounded-lg border border-ivory-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500"
                    >
                      {locations.map(l => (
                        <option key={l.id} value={l.id}>{l.name_ar || l.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 px-1 text-center">
                    <button
                      onClick={() => removeRow(r.id)}
                      disabled={rows.length === 1}
                      className="text-red-500 hover:bg-red-50 rounded-lg p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between mt-4">
            <button
              onClick={addRow}
              className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              <Plus size={16} />
              إضافة صف
            </button>
            <Button onClick={saveSingle} disabled={savingSingle}>
              {savingSingle ? 'جاري الحفظ...' : 'حفظ الكميات الافتتاحية'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Bulk import ──────────────────────────────────────────────── */}
      {mode === 'bulk' && (
        <div className="space-y-4">
          {/* Step 1: template */}
          <div className="bg-white rounded-2xl shadow-card border border-ivory-border p-6">
            <h3 className="font-bold text-ink-main mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs flex items-center justify-center font-bold">1</span>
              تحميل القالب
            </h3>
            <p className="text-sm text-ink-muted mb-3">
              حمّل ملف Excel جاهز فيه الأعمدة المطلوبة. املأ بياناتك ثم ارفعه في الخطوة التالية.
              لكل دفعة (batch) من المنتج صف منفصل — لو عندك منتج بدفعتين مختلفتين، كرّر اسم المنتج في صفين.
            </p>
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download size={16} />
              تحميل قالب Excel
            </Button>
          </div>

          {/* Step 2: upload */}
          <div className="bg-white rounded-2xl shadow-card border border-ivory-border p-6">
            <h3 className="font-bold text-ink-main mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs flex items-center justify-center font-bold">2</span>
              رفع الملف
            </h3>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="hidden"
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload size={16} />
              اختر ملف Excel
            </Button>
            {parsed.length > 0 && (
              <p className="text-sm text-ink-muted mt-3">
                تم قراءة <span className="font-bold text-ink-main">{parsed.length}</span> صف من الملف
                {parseErrors.length > 0 && (
                  <span className="text-status-danger"> · {parseErrors.length} تحذير</span>
                )}
              </p>
            )}
            {parseErrors.length > 0 && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 max-h-40 overflow-y-auto">
                <ul className="text-xs text-red-700 space-y-1">
                  {parseErrors.slice(0, 20).map((e, i) => <li key={i}>• {e}</li>)}
                  {parseErrors.length > 20 && <li>... و {parseErrors.length - 20} تحذير آخر</li>}
                </ul>
              </div>
            )}
          </div>

          {/* Step 3: preview + confirm */}
          {parsed.length > 0 && !result && (
            <div className="bg-white rounded-2xl shadow-card border border-ivory-border p-6">
              <h3 className="font-bold text-ink-main mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs flex items-center justify-center font-bold">3</span>
                معاينة وتأكيد
              </h3>
              <div className="max-h-80 overflow-auto border border-ivory-border rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-surface-secondary sticky top-0">
                    <tr>
                      <th className="text-right p-2">#</th>
                      <th className="text-right p-2">الباركود</th>
                      <th className="text-right p-2">الاسم</th>
                      <th className="text-right p-2">الكمية</th>
                      <th className="text-right p-2">التكلفة</th>
                      <th className="text-right p-2">الدفعة</th>
                      <th className="text-right p-2">الانتهاء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 100).map((r, i) => (
                      <tr key={i} className="border-t border-ivory-border/50">
                        <td className="p-2 text-ink-muted">{i + 2}</td>
                        <td className="p-2 tabular-nums">{r.barcode}</td>
                        <td className="p-2">{r.trade_name_ar || r.trade_name}</td>
                        <td className="p-2 tabular-nums">{r.quantity}</td>
                        <td className="p-2 tabular-nums">{r.unit_cost ?? '—'}</td>
                        <td className="p-2">{r.batch_number || '—'}</td>
                        <td className="p-2">{r.expiry_date || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.length > 100 && (
                  <div className="p-2 text-center text-xs text-ink-muted bg-surface-secondary border-t border-ivory-border">
                    معاينة أول 100 صف فقط — سيتم استيراد جميع الصفوف ({parsed.length})
                  </div>
                )}
              </div>
              <div className="flex justify-end mt-4">
                <Button onClick={runBulkImport} disabled={importing}>
                  {importing ? 'جاري الاستيراد...' : `استيراد ${parsed.length} صف`}
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: result */}
          {result && (
            <div className="bg-white rounded-2xl shadow-card border border-ivory-border p-6">
              <div className="flex items-center gap-3 mb-4">
                {result.error_count === 0
                  ? <CheckCircle2 size={28} className="text-status-success" />
                  : <AlertCircle size={28} className="text-status-warning" />}
                <div>
                  <h3 className="font-bold text-ink-main">نتيجة الاستيراد</h3>
                  <p className="text-sm text-ink-muted">
                    نجح {result.success_count} من {result.total} ·
                    {' '}{result.created_products} منتج جديد ·
                    {' '}{result.error_count} خطأ
                  </p>
                </div>
              </div>
              {result.error_count > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 max-h-60 overflow-y-auto">
                  <h4 className="text-xs font-bold text-red-900 mb-2">الأخطاء:</h4>
                  <ul className="text-xs text-red-700 space-y-1">
                    {result.rows.filter(r => !r.success).slice(0, 50).map(r => (
                      <li key={r.row_index}>• الصف {r.row_index + 2}: {r.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
