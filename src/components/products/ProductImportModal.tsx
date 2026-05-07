import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../../api';
import { useAuth } from '../../hooks/useAuth';
import Button from '../ui/Button';
import type { ProductImportResult } from '../../types';
import { exportToCsv } from '../../utils/csv';
import {
  buildImportPreview,
  parseImportFile,
  PRODUCT_IMPORT_FIELDS,
  suggestColumnMapping,
  type ParsedImportFile,
  type ProductImportField,
  type ProductImportPreview,
} from '../../utils/productImport';

interface ProductImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (result: ProductImportResult) => Promise<void> | void;
}

type Step = 1 | 2 | 3;

const REQUIRED_FIELDS: ProductImportField[] = ['trade_name', 'sale_price'];

export default function ProductImportModal({ open, onClose, onImported }: ProductImportModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState('');
  const [parsedFile, setParsedFile] = useState<ParsedImportFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, ProductImportField | ''>>({});
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [existingBarcodes, setExistingBarcodes] = useState<Set<string>>(new Set());
  const [updateExisting, setUpdateExisting] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setStep(1);
      setFileName('');
      setParsedFile(null);
      setMapping({});
      setPreview(null);
      setUpdateExisting(true);
      setError('');
      return;
    }

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !importing) onClose();
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, importing, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setLoadingProducts(true);
    api.getProducts()
      .then((products) => {
        if (cancelled) return;
        setExistingBarcodes(new Set(products.map((product) => product.barcode).filter(Boolean) as string[]));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });

    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!parsedFile) {
      setPreview(null);
      return;
    }
    setPreview(buildImportPreview(parsedFile.rows, mapping, existingBarcodes));
  }, [parsedFile, mapping, existingBarcodes]);

  if (!open) return null;

  const canContinueFromMapping = REQUIRED_FIELDS.every((field) => Object.values(mapping).includes(field));
  const importableRows = preview?.rows.filter((row) => row.status !== 'error' && row.parsed).map((row) => row.parsed!) || [];

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setParsing(true);

    try {
      const result = await parseImportFile(file);
      setFileName(file.name);
      setParsedFile(result);
      setMapping(suggestColumnMapping(result.headers));
      setStep(1);
    } catch (err) {
      setParsedFile(null);
      setMapping({});
      setPreview(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleMappingChange = (header: string, field: ProductImportField | '') => {
    setMapping((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (key !== header && next[key] === field) {
          next[key] = '';
        }
      });
      next[header] = field;
      return next;
    });
  };

  const handleImport = async () => {
    if (!importableRows.length) {
      setError(t('products.import.noValidRows'));
      return;
    }

    setImporting(true);
    setError('');

    try {
      const result = await api.importProducts(importableRows, updateExisting, user?.id);
      await onImported(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    exportToCsv('pms-products-import-template', [
      {
        barcode: '6281001210017',
        trade_name: 'Panadol Extra',
        trade_name_ar: 'بنادول إكسترا',
        generic_name: 'Paracetamol',
        generic_name_ar: 'باراسيتامول',
        category: 'Pain Relief',
        unit: 'box',
        sale_price: '15.00',
        min_sale_price: '14.00',
        last_purchase_price: '12.00',
        min_stock_level: 20,
        notes: 'Template row',
      },
    ], [
      'barcode',
      'trade_name',
      'trade_name_ar',
      'generic_name',
      'generic_name_ar',
      'category',
      'unit',
      'sale_price',
      'min_sale_price',
      'last_purchase_price',
      'min_stock_level',
      'notes',
    ]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !importing && onClose()}>
      <div className="w-full max-w-6xl max-h-[92vh] bg-ivory-surface border border-ivory-border rounded-sm shadow-lg flex flex-col overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="px-5 py-4 border-b border-ivory-border flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-ink-main">{t('products.import.title')}</h3>
            <p className="text-sm text-ink-muted">{t('products.import.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={downloadTemplate}>
              {t('products.import.downloadTemplate')}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={importing}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-ivory-border bg-ivory-muted">
          <div className="grid grid-cols-3 gap-3">
            <StepCard active={step === 1} done={!!parsedFile} label={t('products.import.steps.upload')} />
            <StepCard active={step === 2} done={canContinueFromMapping} label={t('products.import.steps.mapping')} />
            <StepCard active={step === 3} done={false} label={t('products.import.steps.preview')} />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          {error && (
            <div className="border border-status-danger/20 bg-status-danger-bg text-status-danger rounded-sm px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="border border-dashed border-ivory-border rounded-sm p-8 text-center bg-ivory-muted">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <p className="text-base font-bold text-ink-main mb-2">{t('products.import.selectFile')}</p>
                <p className="text-sm text-ink-muted mb-4">{t('products.import.fileHint')}</p>
                <div className="flex items-center justify-center gap-2">
                  <Button onClick={() => inputRef.current?.click()} disabled={parsing}>
                    {parsing ? t('products.import.parsing') : t('products.import.chooseFile')}
                  </Button>
                  {fileName && <span className="text-sm text-ink-muted">{fileName}</span>}
                </div>
              </div>

              {parsedFile && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-ink-main">{t('products.import.previewRows')}</h4>
                      <p className="text-xs text-ink-muted">
                        {parsedFile.rows.length} {t('products.import.rowsDetected')}
                      </p>
                    </div>
                    <Button onClick={() => setStep(2)} disabled={parsing || loadingProducts}>
                      {t('products.import.nextMapping')}
                    </Button>
                  </div>

                  <div className="overflow-auto border border-ivory-border rounded-sm">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-ivory-muted border-b border-ivory-border">
                          {parsedFile.headers.map((header) => (
                            <th key={header} className="px-3 py-2 text-right font-medium text-ink-muted whitespace-nowrap">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedFile.rows.slice(0, 5).map((row, index) => (
                          <tr key={index} className="border-b border-ivory-border last:border-0">
                            {parsedFile.headers.map((header) => (
                              <td key={header} className="px-3 py-2 text-ink-main whitespace-nowrap">
                                {row[header] || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && parsedFile && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-ink-main">{t('products.import.mappingTitle')}</h4>
                  <p className="text-xs text-ink-muted">{t('products.import.mappingHint')}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep(1)}>
                    {t('products.import.backUpload')}
                  </Button>
                  <Button onClick={() => setStep(3)} disabled={!canContinueFromMapping || loadingProducts}>
                    {t('products.import.nextPreview')}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {parsedFile.headers.map((header) => (
                  <div key={header} className="border border-ivory-border rounded-sm p-4 bg-ivory-surface">
                    <div className="text-sm font-medium text-ink-main mb-2">{header}</div>
                    <select
                      value={mapping[header] || ''}
                      onChange={(event) => handleMappingChange(header, event.target.value as ProductImportField | '')}
                      className="w-full px-3 py-2 text-sm bg-ivory-surface border border-ivory-border rounded-sm text-ink-main"
                    >
                      <option value="">{t('products.import.ignoreColumn')}</option>
                      {PRODUCT_IMPORT_FIELDS.map((field) => (
                        <option key={field.field} value={field.field}>
                          {t(field.labelKey)}{field.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && preview && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-3">
                <SummaryCard label={t('products.import.summary.ready')} value={preview.summary.ready} tone="success" />
                <SummaryCard label={t('products.import.summary.warnings')} value={preview.summary.warnings} tone="warning" />
                <SummaryCard label={t('products.import.summary.errors')} value={preview.summary.errors} tone="danger" />
                <SummaryCard label={t('products.import.summary.duplicates')} value={preview.summary.duplicates} tone="warning" />
              </div>

              <label className="flex items-center gap-2 text-sm text-ink-main">
                <input
                  type="checkbox"
                  checked={updateExisting}
                  onChange={(event) => setUpdateExisting(event.target.checked)}
                />
                <span>{t('products.import.updateExisting')}</span>
              </label>

              {importing && (
                <div className="border border-primary-500/20 bg-primary-100 rounded-sm p-4">
                  <div className="w-full h-2 bg-ivory-border rounded-sm overflow-hidden mb-2">
                    <div className="h-full w-2/3 bg-primary-600 animate-pulse" />
                  </div>
                  <p className="text-sm text-ink-main">{t('products.import.importing')}</p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-ink-main">{t('products.import.validationTitle')}</h4>
                  <p className="text-xs text-ink-muted">{t('products.import.validationHint')}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep(2)} disabled={importing}>
                    {t('products.import.backMapping')}
                  </Button>
                  <Button onClick={handleImport} disabled={importing || !importableRows.length}>
                    {t('products.import.importButton', { count: importableRows.length })}
                  </Button>
                </div>
              </div>

              <div className="overflow-auto border border-ivory-border rounded-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ivory-muted border-b border-ivory-border">
                      <th className="px-3 py-2 text-right font-medium text-ink-muted">#</th>
                      <th className="px-3 py-2 text-right font-medium text-ink-muted">{t('products.tradeName')}</th>
                      <th className="px-3 py-2 text-right font-medium text-ink-muted">{t('products.barcode')}</th>
                      <th className="px-3 py-2 text-right font-medium text-ink-muted">{t('products.import.status')}</th>
                      <th className="px-3 py-2 text-right font-medium text-ink-muted">{t('products.import.messages')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 100).map((row) => (
                      <tr key={row.rowNumber} className="border-b border-ivory-border last:border-0">
                        <td className="px-3 py-2 text-ink-muted tabular-nums">{row.rowNumber}</td>
                        <td className="px-3 py-2 text-ink-main">{row.displayName}</td>
                        <td className="px-3 py-2 text-ink-muted tabular-nums">{row.barcode || '—'}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={row.status} label={t(`products.import.rowStatus.${row.status}`)} />
                        </td>
                        <td className="px-3 py-2 text-ink-muted">{row.messages.join('، ') || t('products.import.readyLabel')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepCard({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`rounded-sm border px-3 py-2 text-sm ${active ? 'border-primary-600 bg-primary-100 text-primary-900' : done ? 'border-status-success/20 bg-status-success-bg text-status-success' : 'border-ivory-border bg-ivory-surface text-ink-muted'}`}>
      {label}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' | 'danger' }) {
  const toneClasses = tone === 'success'
    ? 'border-status-success/20 bg-status-success-bg'
    : tone === 'warning'
      ? 'border-status-warning/20 bg-status-warning-bg'
      : 'border-status-danger/20 bg-status-danger-bg';

  return (
    <div className={`min-w-[140px] border rounded-sm px-4 py-3 ${toneClasses}`}>
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="text-lg font-bold text-ink-main tabular-nums">{value}</div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: 'valid' | 'warning' | 'error'; label: string }) {
  const classes = status === 'valid'
    ? 'bg-status-success-bg text-status-success'
    : status === 'warning'
      ? 'bg-status-warning-bg text-status-warning'
      : 'bg-status-danger-bg text-status-danger';

  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-1 text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}
