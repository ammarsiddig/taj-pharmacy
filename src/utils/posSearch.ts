import type { PosBatch, PosProduct } from '../types';

const PRODUCT_CART_KEY_PREFIX = '__product__:';

export function getSellableProductBatches(product: PosProduct): PosBatch[] {
  return product.batches.filter(batch => batch.quantity_current > 0);
}

export function getProductAvailableQuantity(product: PosProduct): number {
  return getSellableProductBatches(product).reduce((sum, batch) => sum + batch.quantity_current, 0);
}

export function getProductFefoPreviewBatch(product: PosProduct): PosBatch | undefined {
  return getSellableProductBatches(product)[0];
}

export function buildProductCartKey(productId: string): string {
  return `${PRODUCT_CART_KEY_PREFIX}${productId}`;
}

export function isProductCartKey(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith(PRODUCT_CART_KEY_PREFIX);
}
