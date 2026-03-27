import { serverTimestamp } from 'firebase/firestore';
import type { Product } from '../../types';
import { formatProductName, normalizeSearchQuery, parseNumber } from '../../utils/format';

export interface ProductFormData {
  name: string;
  sku: string;
  sellPrice: string;
  costPrice: string;
  stockQty: string;
  lowStockThreshold: string;
}

export interface NormalizedProductInput {
  name: string;
  nameKey: string;
  sku: string;
  sellPrice: number;
  costPrice: number;
  stockQty: number;
  lowStockThreshold: number;
}

export interface ProductFormFieldErrors {
  name?: string;
  costPrice?: string;
  sellPrice?: string;
  stockQty?: string;
  lowStockThreshold?: string;
}

export const DEFAULT_PRODUCT_FORM: ProductFormData = {
  name: '',
  sku: '',
  sellPrice: '',
  costPrice: '',
  stockQty: '0',
  lowStockThreshold: '5',
};

export const toNameKey = (name: string): string =>
  normalizeSearchQuery(name);

export const normalizeProductForm = (form: ProductFormData): NormalizedProductInput => ({
  name: formatProductName(form.name),
  nameKey: toNameKey(form.name),
  sku: form.sku.trim(),
  sellPrice: parseNumber(form.sellPrice),
  costPrice: parseNumber(form.costPrice),
  stockQty: parseNumber(form.stockQty),
  lowStockThreshold: parseNumber(form.lowStockThreshold),
});

export const validateProductForm = (form: ProductFormData): string[] => {
  const fieldErrors = getProductFormFieldErrors(form);
  return Object.values(fieldErrors);
};

export const getProductFormFieldErrors = (form: ProductFormData): ProductFormFieldErrors => {
  const normalized = normalizeProductForm(form);
  const errors: ProductFormFieldErrors = {};

  if (!normalized.name) errors.name = 'Nama produk wajib diisi.';
  if (normalized.costPrice <= 0) errors.costPrice = 'Harga beli produk harus lebih dari 0.';
  if (normalized.sellPrice <= 0) errors.sellPrice = 'Harga jual produk harus lebih dari 0.';
  if (normalized.stockQty < 0) errors.stockQty = 'Stok awal tidak boleh negatif.';
  if (normalized.lowStockThreshold < 0) errors.lowStockThreshold = 'Batas menipis tidak boleh negatif.';

  return errors;
};

export const toProductDocument = (normalized: NormalizedProductInput): Product & { nameKey: string } => ({
  name: normalized.name,
  nameKey: normalized.nameKey,
  sku: normalized.sku,
  sellPrice: normalized.sellPrice,
  costPrice: normalized.costPrice,
  stockQty: normalized.stockQty,
  lowStockThreshold: normalized.lowStockThreshold,
  isActive: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
