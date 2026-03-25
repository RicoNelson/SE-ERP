import { serverTimestamp } from 'firebase/firestore';
import type { Product } from '../../types';
import { parseNumber } from '../../utils/format';

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

export const DEFAULT_PRODUCT_FORM: ProductFormData = {
  name: '',
  sku: '',
  sellPrice: '',
  costPrice: '',
  stockQty: '0',
  lowStockThreshold: '5',
};

export const toNameKey = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, ' ');

export const normalizeProductForm = (form: ProductFormData): NormalizedProductInput => ({
  name: form.name.trim(),
  nameKey: toNameKey(form.name),
  sku: form.sku.trim(),
  sellPrice: parseNumber(form.sellPrice),
  costPrice: parseNumber(form.costPrice),
  stockQty: parseNumber(form.stockQty),
  lowStockThreshold: parseNumber(form.lowStockThreshold),
});

export const validateProductForm = (form: ProductFormData): string[] => {
  const normalized = normalizeProductForm(form);
  const errors: string[] = [];

  if (!normalized.name) errors.push('Nama produk wajib diisi.');
  if (normalized.costPrice <= 0) errors.push('Harga beli produk harus lebih dari 0.');
  if (normalized.sellPrice <= 0) errors.push('Harga jual produk harus lebih dari 0.');
  if (normalized.stockQty < 0) errors.push('Stok awal tidak boleh negatif.');
  if (normalized.lowStockThreshold < 0) errors.push('Batas menipis tidak boleh negatif.');

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
