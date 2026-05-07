import Papa from 'papaparse';
import * as XLSX from 'xlsx';

import type { ProductImportRowData } from '../types';

export type ProductImportField =
  | 'trade_name'
  | 'trade_name_ar'
  | 'generic_name'
  | 'generic_name_ar'
  | 'barcode'
  | 'category'
  | 'unit'
  | 'sale_price'
  | 'min_sale_price'
  | 'last_purchase_price'
  | 'min_stock_level'
  | 'notes';

export interface ProductImportFieldDefinition {
  field: ProductImportField;
  labelKey: string;
  required?: boolean;
}

export interface ParsedImportFile {
  headers: string[];
  rows: Record<string, string>[];
}

export interface ProductImportPreviewRow {
  rowNumber: number;
  status: 'valid' | 'warning' | 'error';
  messages: string[];
  parsed?: ProductImportRowData;
  displayName: string;
  barcode?: string;
}

export interface ProductImportPreview {
  rows: ProductImportPreviewRow[];
  validRows: ProductImportRowData[];
  summary: {
    ready: number;
    warnings: number;
    errors: number;
    duplicates: number;
  };
}

export const PRODUCT_IMPORT_FIELDS: ProductImportFieldDefinition[] = [
  { field: 'trade_name', labelKey: 'products.import.fields.trade_name', required: true },
  { field: 'trade_name_ar', labelKey: 'products.import.fields.trade_name_ar' },
  { field: 'generic_name', labelKey: 'products.import.fields.generic_name' },
  { field: 'generic_name_ar', labelKey: 'products.import.fields.generic_name_ar' },
  { field: 'barcode', labelKey: 'products.import.fields.barcode' },
  { field: 'category', labelKey: 'products.import.fields.category' },
  { field: 'unit', labelKey: 'products.import.fields.unit' },
  { field: 'sale_price', labelKey: 'products.import.fields.sale_price', required: true },
  { field: 'min_sale_price', labelKey: 'products.import.fields.min_sale_price' },
  { field: 'last_purchase_price', labelKey: 'products.import.fields.last_purchase_price' },
  { field: 'min_stock_level', labelKey: 'products.import.fields.min_stock_level' },
  { field: 'notes', labelKey: 'products.import.fields.notes' },
];

const HEADER_ALIASES: Record<ProductImportField, string[]> = {
  trade_name: ['trade_name', 'name', 'product_name', 'trade name', 'اسم الدواء', 'اسم المنتج', 'الاسم التجاري', 'الاسم'],
  trade_name_ar: ['trade_name_ar', 'name_ar', 'arabic_name', 'trade_name_arabic', 'اسم بالعربي', 'الاسم بالعربي'],
  generic_name: ['generic_name', 'generic', 'scientific_name', 'generic name', 'الاسم العلمي'],
  generic_name_ar: ['generic_name_ar', 'generic_name_arabic', 'scientific_name_ar', 'الاسم العلمي بالعربي'],
  barcode: ['barcode', 'bar_code', 'bar code', 'الباركود', 'باركود'],
  category: ['category', 'classification', 'الفئة', 'التصنيف'],
  unit: ['unit', 'uom', 'unit_name', 'الوحدة', 'وحدة البيع'],
  sale_price: ['sale_price', 'selling_price', 'retail_price', 'price', 'سعر البيع', 'السعر'],
  min_sale_price: ['min_sale_price', 'minimum_sale_price', 'اقل سعر بيع', 'أقل سعر بيع'],
  last_purchase_price: ['purchase_price', 'last_purchase_price', 'cost_price', 'سعر الشراء', 'التكلفة'],
  min_stock_level: ['min_stock_level', 'min_stock', 'minimum_stock', 'الحد الأدنى', 'الحد الأدنى للمخزون'],
  notes: ['notes', 'note', 'ملاحظات'],
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/[()]/g, '');
}

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (char) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char)));
}

function cleanString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseMoney(value: string): number | null {
  const raw = normalizeDigits(value).replace(/\s/g, '');
  if (!raw) return null;

  let normalized = raw.replace(/[£$]/g, '');
  if (normalized.includes(',') && !normalized.includes('.')) {
    normalized = /,\d{1,2}$/.test(normalized)
      ? normalized.replace(',', '.')
      : normalized.replace(/,/g, '');
  } else {
    normalized = normalized.replace(/,/g, '');
  }

  normalized = normalized.replace(/٬/g, '').replace(/٫/g, '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function parseInteger(value: string, fallback: number): number {
  const raw = normalizeDigits(value).replace(/[,\s٬]/g, '');
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed);
}

function rowsFromMatrix(matrix: unknown[][]): ParsedImportFile {
  if (!matrix.length) {
    throw new Error('الملف فارغ');
  }

  const headers = (matrix[0] ?? []).map((value, index) => {
    const text = cleanString(value);
    return text || `Column ${index + 1}`;
  });

  const rows = matrix
    .slice(1)
    .map((row) => {
      const entry: Record<string, string> = {};
      headers.forEach((header, index) => {
        entry[header] = cleanString(row[index] ?? '');
      });
      return entry;
    })
    .filter((row) => Object.values(row).some((value) => value !== ''));

  if (!rows.length) {
    throw new Error('الملف لا يحتوي على بيانات');
  }

  if (rows.length > 50000) {
    throw new Error('الحد الأقصى للاستيراد هو 50000 صف');
  }

  return { headers, rows };
}

export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('الحد الأقصى لحجم الملف هو 10MB');
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (extension === 'csv') {
    let text = '';
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      text = new TextDecoder('windows-1256').decode(buffer);
    }

    const parsed = Papa.parse<string[]>(text, {
      skipEmptyLines: 'greedy',
    });

    if (parsed.errors.length) {
      throw new Error(parsed.errors[0]?.message || 'تعذر قراءة ملف CSV');
    }

    return rowsFromMatrix(parsed.data as unknown[][]);
  }

  if (extension === 'xlsx' || extension === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('ملف Excel لا يحتوي على أوراق');
    }
    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];

    return rowsFromMatrix(matrix);
  }

  throw new Error('نوع الملف غير مدعوم');
}

export function suggestColumnMapping(headers: string[]): Record<string, ProductImportField | ''> {
  const mapping: Record<string, ProductImportField | ''> = {};

  headers.forEach((header) => {
    const normalizedHeader = normalizeHeader(header);
    const matched = PRODUCT_IMPORT_FIELDS.find(({ field }) =>
      HEADER_ALIASES[field].some((alias) => normalizeHeader(alias) === normalizedHeader),
    );
    mapping[header] = matched?.field || '';
  });

  return mapping;
}

export function buildImportPreview(
  rows: Record<string, string>[],
  mapping: Record<string, ProductImportField | ''>,
  existingBarcodes: Set<string>,
): ProductImportPreview {
  const fieldToHeader = new Map<ProductImportField, string>();

  Object.entries(mapping).forEach(([header, field]) => {
    if (field) fieldToHeader.set(field, header);
  });

  const seenBarcodes = new Set<string>();
  const previewRows: ProductImportPreviewRow[] = [];
  const validRows: ProductImportRowData[] = [];

  rows.forEach((sourceRow, index) => {
    const messages: string[] = [];
    const getValue = (field: ProductImportField) => cleanString(sourceRow[fieldToHeader.get(field) || '']);

    const tradeName = getValue('trade_name');
    const tradeNameAr = getValue('trade_name_ar');
    const genericName = getValue('generic_name');
    const genericNameAr = getValue('generic_name_ar');
    const barcode = getValue('barcode');
    const salePrice = parseMoney(getValue('sale_price'));
    const minSalePrice = parseMoney(getValue('min_sale_price'));
    const lastPurchasePrice = parseMoney(getValue('last_purchase_price'));

    if (!tradeName) {
      messages.push('اسم المنتج مطلوب');
    }

    if (salePrice === null) {
      messages.push('سعر البيع غير صالح');
    }

    if (getValue('min_sale_price') && minSalePrice === null) {
      messages.push('أقل سعر بيع غير صالح');
    }

    if (getValue('last_purchase_price') && lastPurchasePrice === null) {
      messages.push('سعر الشراء غير صالح');
    }

    const parsed: ProductImportRowData | undefined = messages.length
      ? undefined
      : {
          trade_name: tradeName,
          trade_name_ar: tradeNameAr || undefined,
          generic_name: genericName || undefined,
          generic_name_ar: genericNameAr || undefined,
          barcode: barcode || undefined,
          category: getValue('category') || undefined,
          unit: getValue('unit') || 'box',
          sale_price: salePrice!,
          min_sale_price: minSalePrice ?? 0,
          last_purchase_price: lastPurchasePrice ?? 0,
          min_stock_level: parseInteger(getValue('min_stock_level'), 0),
          notes: getValue('notes') || undefined,
        };

    if (barcode) {
      if (existingBarcodes.has(barcode)) {
        messages.push('باركود موجود مسبقاً وسيتم تحديثه أو تخطيه');
      }
      if (seenBarcodes.has(barcode)) {
        messages.push('الباركود مكرر داخل الملف');
      }
      seenBarcodes.add(barcode);
    }

    const hasErrors = messages.some((message) => message.includes('غير صالح') || message.includes('مطلوب'));
    const hasWarnings = !hasErrors && messages.length > 0;
    const status: ProductImportPreviewRow['status'] = hasErrors ? 'error' : hasWarnings ? 'warning' : 'valid';

    if (parsed && !hasErrors) {
      validRows.push(parsed);
    }

    previewRows.push({
      rowNumber: index + 2,
      status,
      messages,
      parsed,
      displayName: tradeNameAr || tradeName || '—',
      barcode: barcode || undefined,
    });
  });

  return {
    rows: previewRows,
    validRows,
    summary: {
      ready: previewRows.filter((row) => row.status === 'valid').length,
      warnings: previewRows.filter((row) => row.status === 'warning').length,
      errors: previewRows.filter((row) => row.status === 'error').length,
      duplicates: previewRows.filter((row) => row.messages.some((message) => message.includes('باركود'))).length,
    },
  };
}
