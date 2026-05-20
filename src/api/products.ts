import { invoke } from '../lib/tauri';
import type {
  Product, ProductFormData, ProductImportRowData, ProductImportResult,
  ProductSubstitute,
  User, UserFormData, Role, Branch,
  UnitMeasure, UnitMeasureData, PaymentMethodSetting, PaymentMethodData,
  Supplier, SupplierFormData,
} from '../types';
import { getTenantId } from './core';

// ---

export async function getCurrentUser(token: string): Promise<User> {
  return invoke('get_current_user', { token });
}

// ---

export async function getProducts(
  search?: string,
  category?: string,
  isActive?: boolean | null,
): Promise<Product[]> {
  return invoke('get_products', {
    tenantId: getTenantId(),
    search: search || null,
    category: category || null,
    isActive: isActive ?? null,
  });
}

export async function getProduct(productId: string): Promise<Product> {
  return invoke('get_product', { tenantId: getTenantId(), productId });
}

export async function createProduct(data: ProductFormData): Promise<Product> {
  return invoke('create_product', { tenantId: getTenantId(), data });
}

export async function updateProduct(productId: string, data: ProductFormData): Promise<Product> {
  return invoke('update_product', { tenantId: getTenantId(), productId, data });
}

export async function importProducts(
  rows: ProductImportRowData[],
  updateExisting: boolean,
  userId?: string,
): Promise<ProductImportResult> {
  return invoke('import_products', {
    tenantId: getTenantId(),
    data: { rows, update_existing: updateExisting, user_id: userId || null },
  });
}

export async function toggleProductActive(productId: string): Promise<Product> {
  return invoke('toggle_product_active', { tenantId: getTenantId(), productId });
}

export async function getProductCategories(): Promise<string[]> {
  return invoke('get_product_categories', { tenantId: getTenantId() });
}

// ---

export async function getProductSubstitutes(productId: string): Promise<ProductSubstitute[]> {
  return invoke('get_product_substitutes', { tenantId: getTenantId(), productId });
}

export async function addProductSubstitute(
  productId: string,
  substituteId: string,
  notes?: string,
): Promise<void> {
  return invoke('add_product_substitute', {
    tenantId: getTenantId(),
    productId,
    substituteId,
    notes: notes || null,
  });
}

export async function removeProductSubstitute(
  productId: string,
  substituteId: string,
): Promise<void> {
  return invoke('remove_product_substitute', { tenantId: getTenantId(), productId, substituteId });
}

export async function saveProductImage(productId: string, base64Data: string): Promise<string> {
  return invoke('save_product_image', { tenantId: getTenantId(), productId, base64Data });
}

export async function getProductImage(productId: string): Promise<string | null> {
  return invoke('get_product_image', { tenantId: getTenantId(), productId });
}

export async function deleteProductImage(productId: string): Promise<void> {
  return invoke('delete_product_image', { tenantId: getTenantId(), productId });
}

// ---

export async function getUnitMeasures(activeOnly?: boolean): Promise<UnitMeasure[]> {
  return invoke('get_unit_measures', { tenantId: getTenantId(), activeOnly: activeOnly ?? null });
}

export async function createUnitMeasure(data: UnitMeasureData): Promise<UnitMeasure> {
  return invoke('create_unit_measure', { tenantId: getTenantId(), data });
}

export async function updateUnitMeasure(unitId: string, data: UnitMeasureData): Promise<void> {
  return invoke('update_unit_measure', { tenantId: getTenantId(), unitId, data });
}

export async function deleteUnitMeasure(unitId: string): Promise<void> {
  return invoke('delete_unit_measure', { tenantId: getTenantId(), unitId });
}

export async function getPaymentMethods(activeOnly?: boolean): Promise<PaymentMethodSetting[]> {
  return invoke('get_payment_methods', { tenantId: getTenantId(), activeOnly: activeOnly ?? null });
}

export async function createPaymentMethod(data: PaymentMethodData): Promise<PaymentMethodSetting> {
  return invoke('create_payment_method', { tenantId: getTenantId(), data });
}

export async function updatePaymentMethod(paymentMethodId: string, data: PaymentMethodData): Promise<void> {
  return invoke('update_payment_method', { tenantId: getTenantId(), paymentMethodId, data });
}

export async function deletePaymentMethod(paymentMethodId: string): Promise<void> {
  return invoke('delete_payment_method', { tenantId: getTenantId(), paymentMethodId });
}

// ---

export async function getUsers(): Promise<User[]> {
  return invoke('get_users', { tenantId: getTenantId() });
}

export async function createUser(actorId: string, data: UserFormData): Promise<User> {
  return invoke('create_user', { tenantId: getTenantId(), actorId, data });
}

export async function updateUser(actorId: string, userId: string, data: UserFormData): Promise<User> {
  return invoke('update_user', { tenantId: getTenantId(), actorId, userId, data });
}

export async function getRoles(): Promise<Role[]> {
  return invoke('get_roles', { tenantId: getTenantId() });
}

export async function getBranches(): Promise<Branch[]> {
  return invoke('get_branches', { tenantId: getTenantId() });
}

export async function getSuppliers(search?: string): Promise<Supplier[]> {
  return invoke('get_suppliers', { tenantId: getTenantId(), search: search || null });
}

export async function createSupplier(data: SupplierFormData): Promise<Supplier> {
  return invoke('create_supplier', { tenantId: getTenantId(), data });
}
