import { useEffect, useMemo, useState } from 'react';
import { useBeforeUnload, useNavigate, useSearchParams } from 'react-router-dom';
import {
  collection,
  type DocumentReference,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { ArrowLeft, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { db } from '../lib/firebase';
import type { Product } from '../types';
import ProductFormFields from '../components/ProductFormFields';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_PRODUCT_FORM,
  getProductFormFieldErrors,
  normalizeProductForm,
  toNameKey,
  toProductDocument,
  type ProductFormFieldErrors,
  type ProductFormData,
} from '../features/products/productForm';
import { formatDateId, formatNumber, formatProductName, handleFormattedInputChange, normalizeSearchQuery, parseNumber } from '../utils/format';

type StockAddTab = 'product' | 'pb';

interface PoDraftRow {
  id: string;
  productNameInput: string;
  selectedProductId: string | null;
  qty: string;
  buyPrice: string;
  sellPrice: string;
  inlineProductEnabled: boolean;
  inlineProductForm: ProductFormData;
}

interface PoDraftState {
  receiptCode: string;
  receiptDate: string;
  supplierName: string;
  note: string;
  idempotencyKey: string;
  rows: PoDraftRow[];
}

interface PoHeaderErrors {
  receiptCode?: string;
  receiptDate?: string;
  supplierName?: string;
}

interface PoRowFieldErrors {
  productNameInput?: string;
  qty?: string;
  buyPrice?: string;
  sellPrice?: string;
  inlineProductForm?: ProductFormFieldErrors;
}

const uppercaseInputValue = (value: string) => value.toLocaleUpperCase('id-ID');
const trimEdgeWhitespace = (value: string) => value.trim();
const toReceiptCodeDocId = (value: string): string =>
  normalizeSearchQuery(value)
    // Escape characters that can break Firestore document paths.
    .replace(/%/g, '%25')
    .replace(/\//g, '%2F');
const uppercaseProductFormInput = (form: ProductFormData): ProductFormData => ({
  ...form,
  name: uppercaseInputValue(form.name),
  sku: uppercaseInputValue(form.sku),
});

const getTodayDateInput = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const makeRow = (): PoDraftRow => ({
  id: crypto.randomUUID(),
  productNameInput: '',
  selectedProductId: null,
  qty: '',
  buyPrice: '',
  sellPrice: '',
  inlineProductEnabled: false,
  inlineProductForm: { ...DEFAULT_PRODUCT_FORM },
});

const makePoDraft = (): PoDraftState => ({
  receiptCode: '',
  receiptDate: getTodayDateInput(),
  supplierName: '',
  note: '',
  idempotencyKey: crypto.randomUUID(),
  rows: [makeRow()],
});

const hasProductFormChanges = (form: ProductFormData): boolean =>
  Object.entries(form).some(([key, value]) => {
    const initialValue = DEFAULT_PRODUCT_FORM[key as keyof ProductFormData];
    if (typeof value === 'string' && typeof initialValue === 'string') {
      return value.trim() !== initialValue.trim();
    }
    return value !== initialValue;
  });

const hasMeaningfulPbData = (draft: PoDraftState): boolean =>
  Boolean(
    draft.receiptCode.trim()
    || (draft.receiptDate && draft.receiptDate !== getTodayDateInput())
    || draft.supplierName.trim()
    || draft.note.trim()
    || draft.rows.some((row) =>
      row.productNameInput.trim()
      || row.selectedProductId
      || row.qty.trim()
      || row.buyPrice.trim()
      || row.sellPrice.trim()
      || row.inlineProductEnabled,
    ),
  );

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

interface PoRowEditorProps {
  row: PoDraftRow;
  products: Product[];
  rowIndex: number;
  errors?: PoRowFieldErrors;
  onChange: (rowId: string, patch: Partial<PoDraftRow>) => void;
  onRemove: (rowId: string) => void;
}

function PoRowEditor({ row, products, rowIndex, errors, onChange, onRemove }: PoRowEditorProps) {
  const [isFocusOpen, setIsFocusOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(row.productNameInput, 280);
  const getInputClassName = (hasError?: boolean) =>
    `ai-input w-full px-4 py-3 transition-colors duration-200 ${hasError ? 'ai-input-error' : ''}`;

  const suggestions = useMemo(() => {
    const queryText = normalizeSearchQuery(debouncedQuery);
    if (!queryText) return products.slice(0, 8);
    return products
      .filter((item) => normalizeSearchQuery(item.name).includes(queryText) || normalizeSearchQuery(item.sku).includes(queryText))
      .slice(0, 8);
  }, [debouncedQuery, products]);

  const selectedProduct = products.find((item) => item.id === row.selectedProductId) || null;
  const queryHasNoMatch = debouncedQuery.trim().length > 0 && suggestions.length === 0;
  const isInlineMode = row.inlineProductEnabled;

  const handleSelectProduct = (product: Product) => {
    onChange(row.id, {
      selectedProductId: product.id || null,
      productNameInput: formatProductName(product.name),
      inlineProductEnabled: false,
      sellPrice: formatNumber(product.sellPrice),
      buyPrice: row.buyPrice || formatNumber(product.costPrice),
      inlineProductForm: {
        ...DEFAULT_PRODUCT_FORM,
        name: formatProductName(product.name),
        sku: product.sku,
        sellPrice: formatNumber(product.sellPrice),
        costPrice: formatNumber(product.costPrice),
      },
    });
    setIsFocusOpen(false);
  };

  return (
    <div className="ai-card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Item PB</p>
        <button
          type="button"
          onClick={() => onRemove(row.id)}
          className="ai-button-ghost inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-600"
        >
          <Trash2 className="h-4 w-4" />
          Hapus
        </button>
      </div>

      {!isInlineMode ? (
        <>
          <div className="relative">
            <label className="mb-1 block text-sm font-medium text-slate-700">Nama Produk *</label>
            <input
              type="text"
              className={getInputClassName(Boolean(errors?.productNameInput))}
              placeholder="Cari produk..."
              value={row.productNameInput}
              onFocus={() => setIsFocusOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setIsFocusOpen(false), 120);
              }}
              onChange={(e) =>
                onChange(row.id, {
                  productNameInput: e.target.value,
                  selectedProductId: null,
                })
              }
              aria-invalid={Boolean(errors?.productNameInput)}
              aria-describedby={errors?.productNameInput ? `po-row-${row.id}-product-error` : undefined}
            />
            {errors?.productNameInput && (
              <p id={`po-row-${row.id}-product-error`} className="ai-field-error mt-1 text-xs">
                {errors.productNameInput}
              </p>
            )}
            {isFocusOpen && (
              <div className="absolute z-10 mt-2 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                {suggestions.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelectProduct(product)}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-sky-50"
                  >
                    <p className="font-medium text-slate-900">{formatProductName(product.name)}</p>
                    <p className="text-xs text-slate-500">
                      SKU: {product.sku || '-'} • Stok tersisa: {formatNumber(product.stockQty)} • PB terakhir: {formatDateId(product.latestPbDate)}
                    </p>
                  </button>
                ))}
                {queryHasNoMatch && (
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      onChange(row.id, {
                        inlineProductEnabled: true,
                        selectedProductId: null,
                        inlineProductForm: {
                          ...row.inlineProductForm,
                          name: uppercaseInputValue(trimEdgeWhitespace(row.productNameInput)),
                          costPrice: row.buyPrice,
                          sellPrice: row.sellPrice,
                          stockQty: '0',
                        },
                      })
                    }
                    className="w-full rounded-xl border border-dashed border-sky-300 bg-sky-50 px-3 py-2 text-left text-sm font-medium text-sky-700"
                  >
                    + Tambah produk baru "{formatProductName(row.productNameInput)}"
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Jumlah *</label>
              <input
                type="text"
                inputMode="numeric"
                className={getInputClassName(Boolean(errors?.qty))}
                value={row.qty}
                onChange={(e) => {
                  const { formatted } = handleFormattedInputChange(e.target.value);
                  onChange(row.id, { qty: formatted });
                }}
                aria-invalid={Boolean(errors?.qty)}
                aria-describedby={errors?.qty ? `po-row-${row.id}-qty-error` : undefined}
              />
              {errors?.qty && (
                <p id={`po-row-${row.id}-qty-error`} className="ai-field-error mt-1 text-xs">
                  {errors.qty}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Harga Beli *</label>
              <input
                type="text"
                inputMode="numeric"
                className={getInputClassName(Boolean(errors?.buyPrice))}
                value={row.buyPrice}
                onChange={(e) => {
                  const { formatted } = handleFormattedInputChange(e.target.value);
                  onChange(row.id, {
                    buyPrice: formatted,
                    inlineProductForm: { ...row.inlineProductForm, costPrice: formatted },
                  });
                }}
                aria-invalid={Boolean(errors?.buyPrice)}
                aria-describedby={errors?.buyPrice ? `po-row-${row.id}-buy-error` : undefined}
              />
              {errors?.buyPrice && (
                <p id={`po-row-${row.id}-buy-error`} className="ai-field-error mt-1 text-xs">
                  {errors.buyPrice}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Harga Jual *</label>
              <input
                type="text"
                inputMode="numeric"
                className={getInputClassName(Boolean(errors?.sellPrice))}
                value={row.sellPrice}
                onChange={(e) => {
                  const { formatted } = handleFormattedInputChange(e.target.value);
                  onChange(row.id, {
                    sellPrice: formatted,
                    inlineProductForm: { ...row.inlineProductForm, sellPrice: formatted },
                  });
                }}
                aria-invalid={Boolean(errors?.sellPrice)}
                aria-describedby={errors?.sellPrice ? `po-row-${row.id}-sell-error` : undefined}
              />
              {errors?.sellPrice && (
                <p id={`po-row-${row.id}-sell-error`} className="ai-field-error mt-1 text-xs">
                  {errors.sellPrice}
                </p>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">Tambah Produk Baru</p>
            <button
              type="button"
              onClick={() =>
                onChange(row.id, {
                  inlineProductEnabled: false,
                  productNameInput: trimEdgeWhitespace(row.inlineProductForm.name),
                })
              }
              className="text-xs font-medium text-slate-600 hover:text-slate-800"
            >
              Gunakan Produk Existing
            </button>
          </div>
          <ProductFormFields
            value={row.inlineProductForm}
            errors={errors?.inlineProductForm}
            onChange={(next) =>
              {
                const normalizedInlineProductForm = uppercaseProductFormInput(next);
                onChange(row.id, {
                  inlineProductForm: normalizedInlineProductForm,
                  productNameInput: trimEdgeWhitespace(normalizedInlineProductForm.name),
                  buyPrice: normalizedInlineProductForm.costPrice,
                  sellPrice: normalizedInlineProductForm.sellPrice,
                });
              }
            }
            idPrefix={`po-inline-${row.id}`}
          />
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">Jumlah PB *</label>
            <input
              type="text"
              inputMode="numeric"
              className={getInputClassName(Boolean(errors?.qty))}
              value={row.qty}
              onChange={(e) => {
                const { formatted } = handleFormattedInputChange(e.target.value);
                onChange(row.id, { qty: formatted });
              }}
              aria-invalid={Boolean(errors?.qty)}
              aria-describedby={errors?.qty ? `po-row-${row.id}-qty-error-inline` : undefined}
            />
            {errors?.qty && (
              <p id={`po-row-${row.id}-qty-error-inline`} className="ai-field-error mt-1 text-xs">
                {errors.qty}
              </p>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-500">Stok akhir produk baru = Stok Awal + Jumlah PB pada baris ini.</p>
        </div>
      )}

      {selectedProduct && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          Produk dipilih: {formatProductName(selectedProduct.name)} • Stok tersisa: {formatNumber(selectedProduct.stockQty)}
        </p>
      )}
      {errors?.productNameInput && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          Item {rowIndex + 1}: {errors.productNameInput}
        </p>
      )}

    </div>
  );
}

export default function StockAdd() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<StockAddTab>(
    searchParams.get('tab') === 'pb' || searchParams.get('tab') === 'po' ? 'pb' : 'product',
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [productForm, setProductForm] = useState<ProductFormData>({ ...DEFAULT_PRODUCT_FORM });
  const [poDraft, setPoDraft] = useState<PoDraftState>(() => makePoDraft());
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isSavingPo, setIsSavingPo] = useState(false);
  const [productFormErrors, setProductFormErrors] = useState<ProductFormFieldErrors>({});
  const [poFormError, setPoFormError] = useState('');
  const [poHeaderErrors, setPoHeaderErrors] = useState<PoHeaderErrors>({});
  const [poRowErrors, setPoRowErrors] = useState<Record<string, PoRowFieldErrors>>({});
  const [hasAppliedProductPrefill, setHasAppliedProductPrefill] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const { currentUser } = useAuth();
  const hasUnsavedChanges = hasProductFormChanges(productForm) || hasMeaningfulPbData(poDraft);

  useBeforeUnload((event) => {
    if (!hasUnsavedChanges || isSavingPo || isSavingProduct) return;
    event.preventDefault();
    event.returnValue = '';
  });

  const handleBack = () => {
    if (hasUnsavedChanges && !isSavingPo && !isSavingProduct) {
      setShowLeaveConfirm(true);
      return;
    }
    navigate('/stock');
  };

  const handleCancelLeave = () => {
    setShowLeaveConfirm(false);
  };

  const handleConfirmLeave = () => {
    setShowLeaveConfirm(false);
    navigate('/stock');
  };

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const next: Product[] = [];
      snapshot.forEach((item) => next.push({ id: item.id, ...item.data() } as Product));
      setProducts(next);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  }, [tab, setSearchParams]);

  useEffect(() => {
    const preselectProductId = searchParams.get('productId');
    if (!preselectProductId || !products.length || hasAppliedProductPrefill) return;
    const hasEmptyDraft = poDraft.rows.length === 1
      && !poDraft.rows[0].selectedProductId
      && !poDraft.rows[0].productNameInput
      && !poDraft.rows[0].qty
      && !poDraft.rows[0].buyPrice
      && !poDraft.rows[0].sellPrice;

    if (!hasEmptyDraft) {
      setHasAppliedProductPrefill(true);
      return;
    }
    const found = products.find((item) => item.id === preselectProductId);
    if (!found) {
      setHasAppliedProductPrefill(true);
      return;
    }
    setTab('pb');
    setPoDraft((prev) => ({
      ...prev,
      rows: [{
        ...prev.rows[0],
        selectedProductId: found.id || null,
        productNameInput: formatProductName(found.name),
        buyPrice: formatNumber(found.costPrice),
        sellPrice: formatNumber(found.sellPrice),
      }],
    }));
    setHasAppliedProductPrefill(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('productId');
      return next;
    });
  }, [searchParams, products, poDraft.rows, hasAppliedProductPrefill, setSearchParams]);

  const setPoRow = (rowId: string, patch: Partial<PoDraftRow>) => {
    setPoFormError('');
    setPoHeaderErrors({});
    setPoRowErrors((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    const normalizedPatch: Partial<PoDraftRow> = {
      ...patch,
      ...(typeof patch.productNameInput === 'string'
        ? { productNameInput: uppercaseInputValue(trimEdgeWhitespace(patch.productNameInput)) }
        : {}),
      ...(patch.inlineProductForm
        ? { inlineProductForm: uppercaseProductFormInput(patch.inlineProductForm) }
        : {}),
    };
    setPoDraft((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === rowId ? { ...row, ...normalizedPatch } : row)),
    }));
  };

  const removePoRow = (rowId: string) => {
    setPoFormError('');
    setPoHeaderErrors({});
    setPoRowErrors((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setPoDraft((prev) => ({
      ...prev,
      rows: prev.rows.filter((row) => row.id !== rowId).length > 0
        ? prev.rows.filter((row) => row.id !== rowId)
        : [makeRow()],
    }));
  };

  const addPoRow = () => {
    setPoFormError('');
    setPoHeaderErrors({});
    setPoDraft((prev) => ({
      ...prev,
      rows: [...prev.rows, makeRow()],
    }));
  };

  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSavingProduct) return;

    setProductFormErrors({});
    const nextProductErrors = getProductFormFieldErrors(productForm);
    if (Object.keys(nextProductErrors).length > 0) {
      setProductFormErrors(nextProductErrors);
      return;
    }

    const normalized = normalizeProductForm(productForm);
    const duplicate = products.some((item) => toNameKey(item.name) === normalized.nameKey);
    if (duplicate) {
      setProductFormErrors({ name: 'Nama produk sudah ada. Gunakan nama lain.' });
      return;
    }

    setIsSavingProduct(true);
    try {
      await runTransaction(db, async (transaction) => {
        const nameKeyRef = doc(db, 'product_name_keys', normalized.nameKey);
        const existingNameKey = await transaction.get(nameKeyRef);
        if (existingNameKey.exists()) {
          throw new Error('DUPLICATE_PRODUCT_NAME');
        }

        const productRef = doc(collection(db, 'products'));
        transaction.set(productRef, toProductDocument(normalized));
        transaction.set(nameKeyRef, {
          productId: productRef.id,
          name: normalized.name,
          createdAt: serverTimestamp(),
        });

        if (normalized.stockQty > 0) {
          const layerRef = doc(collection(db, 'inventory_layers'));
          const movementRef = doc(collection(db, 'stock_movements'));

          transaction.set(layerRef, {
            productId: productRef.id,
            quantityReceived: normalized.stockQty,
            quantityRemaining: normalized.stockQty,
            unitCost: normalized.costPrice,
            sellPriceSnapshot: normalized.sellPrice,
            sourceType: 'initial_stock',
            sourceId: productRef.id,
            receivedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          transaction.set(movementRef, {
            productId: productRef.id,
            type: 'stock_in',
            quantityChange: normalized.stockQty,
            unitCost: normalized.costPrice,
            layerId: layerRef.id,
            referenceId: productRef.id,
            referenceType: 'initial_stock',
            performedBy: currentUser?.uid || 'unknown',
            performedAt: serverTimestamp(),
          });
        }
      });

      setProductForm({ ...DEFAULT_PRODUCT_FORM });
      setProductFormErrors({});
      alert('Produk berhasil dibuat.');
    } catch (error) {
      if (error instanceof Error && error.message === 'DUPLICATE_PRODUCT_NAME') {
        setProductFormErrors({ name: 'Nama produk sudah terdaftar.' });
      } else {
        console.error(error);
        setProductFormErrors({ name: 'Gagal menyimpan produk.' });
      }
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleSavePurchaseOrder = async () => {
    if (isSavingPo) return;
    setPoFormError('');
    setPoHeaderErrors({});
    setPoRowErrors({});

    const nextHeaderErrors: PoHeaderErrors = {};
    if (!poDraft.receiptCode.trim()) nextHeaderErrors.receiptCode = 'Kode Struk wajib diisi.';
    if (!poDraft.receiptDate) nextHeaderErrors.receiptDate = 'Tanggal Struk wajib diisi.';
    if (!poDraft.supplierName.trim()) nextHeaderErrors.supplierName = 'Nama Supplier wajib diisi.';
    if (Object.keys(nextHeaderErrors).length > 0) {
      setPoHeaderErrors(nextHeaderErrors);
    }

    if (poDraft.rows.length === 0 && Object.keys(nextHeaderErrors).length === 0) {
      setPoFormError('Minimal satu item PB wajib diisi.');
      return;
    }

    const existingNameKeys = new Set(products.map((item) => toNameKey(item.name)));
    const inlineNameKeysByRow = new Map<string, string>();
    const duplicateInlineNameRows = new Set<string>();
    const nextPoRowErrors: Record<string, PoRowFieldErrors> = {};

    for (const row of poDraft.rows) {
      const rowError: PoRowFieldErrors = {};
      const qty = parseNumber(row.qty);
      const buyPrice = parseNumber(row.inlineProductEnabled ? row.inlineProductForm.costPrice : row.buyPrice);
      const sellPrice = parseNumber(row.inlineProductEnabled ? row.inlineProductForm.sellPrice : row.sellPrice);

      if (!row.qty.trim()) rowError.qty = 'Jumlah item PB wajib diisi.';
      else if (qty <= 0) rowError.qty = 'Jumlah item PB harus lebih dari 0.';
      if (!(row.inlineProductEnabled ? row.inlineProductForm.costPrice : row.buyPrice).trim()) rowError.buyPrice = 'Harga Beli item PB wajib diisi.';
      else if (buyPrice <= 0) rowError.buyPrice = 'Harga Beli item PB harus lebih dari 0.';
      if (!(row.inlineProductEnabled ? row.inlineProductForm.sellPrice : row.sellPrice).trim()) rowError.sellPrice = 'Harga Jual item PB wajib diisi.';
      else if (sellPrice <= 0) rowError.sellPrice = 'Harga Jual item PB harus lebih dari 0.';

      if (!row.selectedProductId && !row.inlineProductEnabled) {
        rowError.productNameInput = 'Pilih produk yang ada atau buat produk baru inline.';
      }

      if (row.inlineProductEnabled) {
        const inlineErrors = getProductFormFieldErrors(row.inlineProductForm);
        if (Object.keys(inlineErrors).length > 0) {
          rowError.inlineProductForm = inlineErrors;
        }

        const inlineNameKey = toNameKey(row.inlineProductForm.name);
        if (inlineNameKey) {
          const existingRowId = inlineNameKeysByRow.get(inlineNameKey);
          if (existingNameKeys.has(inlineNameKey)) {
            rowError.inlineProductForm = {
              ...rowError.inlineProductForm,
              name: `Produk "${row.inlineProductForm.name}" sudah ada. Pilih produk existing untuk baris ini.`,
            };
          } else if (existingRowId) {
            duplicateInlineNameRows.add(existingRowId);
            duplicateInlineNameRows.add(row.id);
          } else {
            inlineNameKeysByRow.set(inlineNameKey, row.id);
          }
        }
      }

      if (Object.keys(rowError).length > 0) {
        nextPoRowErrors[row.id] = rowError;
      }
    }

    duplicateInlineNameRows.forEach((rowId) => {
      const row = poDraft.rows.find((item) => item.id === rowId);
      if (!row) return;
      const existingRowError = nextPoRowErrors[rowId] || {};
      nextPoRowErrors[rowId] = {
        ...existingRowError,
        inlineProductForm: {
          ...existingRowError.inlineProductForm,
          name: `Produk "${row.inlineProductForm.name}" terduplikasi di item PB lain. Gunakan nama berbeda.`,
        },
      };
    });

    if (Object.keys(nextHeaderErrors).length > 0 || Object.keys(nextPoRowErrors).length > 0) {
      setPoHeaderErrors(nextHeaderErrors);
      setPoRowErrors(nextPoRowErrors);
      return;
    }

    setIsSavingPo(true);
    try {
      const response = await runTransaction(db, async (transaction) => {
        const idempotencyRef = doc(db, 'purchase_idempotency', poDraft.idempotencyKey);
        const idemSnap = await transaction.get(idempotencyRef);
        if (idemSnap.exists()) {
          return {
            status: 'duplicate' as const,
            purchaseId: idemSnap.data().purchaseId as string,
          };
        }

        const receiptCodeValue = poDraft.receiptCode.trim();
        const receiptCodeKey = toReceiptCodeDocId(receiptCodeValue);
        const receiptCodeRef = doc(db, 'purchase_receipt_keys', receiptCodeKey);
        const existingReceiptCode = await transaction.get(receiptCodeRef);
        if (existingReceiptCode.exists()) {
          throw new Error('DUPLICATE_RECEIPT_CODE');
        }

        const purchaseRef = doc(collection(db, 'purchases'));
        const receiptDate = Timestamp.fromDate(new Date(`${poDraft.receiptDate}T00:00:00`));
        const items: Array<{
          productId: string;
          productNameSnapshot: string;
          quantity: number;
          unitCost: number;
          sellPrice: number;
          subtotal: number;
        }> = [];

        const productStockCache = new Map<string, number>();
        const preparedRows: Array<{
          quantity: number;
          unitCost: number;
          sellPrice: number;
          productId: string;
          productName: string;
          productRef: DocumentReference;
          createProductPayload: ReturnType<typeof toProductDocument> | null;
          nameKeyRef: DocumentReference | null;
          initialStockQty: number;
        }> = [];

        for (const row of poDraft.rows) {
          const quantity = parseNumber(row.qty);
          const unitCost = parseNumber(row.inlineProductEnabled ? row.inlineProductForm.costPrice : row.buyPrice);
          const sellPrice = parseNumber(row.inlineProductEnabled ? row.inlineProductForm.sellPrice : row.sellPrice);

          let productId = row.selectedProductId || '';
          let productName = row.productNameInput.trim();
          let productRef: DocumentReference;
          let createProductPayload: ReturnType<typeof toProductDocument> | null = null;
          let nameKeyRef: DocumentReference | null = null;
          let initialStockQty = 0;

          if (row.inlineProductEnabled) {
            const normalized = normalizeProductForm(row.inlineProductForm);
            nameKeyRef = doc(db, 'product_name_keys', normalized.nameKey);
            const existingName = await transaction.get(nameKeyRef);

            if (existingName.exists()) {
              productId = existingName.data().productId;
              productRef = doc(db, 'products', productId);
            } else {
              productRef = doc(collection(db, 'products'));
              productId = productRef.id;
              productName = normalized.name;
              initialStockQty = normalized.stockQty;
              createProductPayload = toProductDocument(normalized);
              productStockCache.set(productId, normalized.stockQty);
            }
          } else {
            productRef = doc(db, 'products', productId);
          }

          if (!productStockCache.has(productId)) {
            const productSnap = await transaction.get(productRef);
            if (!productSnap.exists()) {
              throw new Error(`Produk ${productName || productId} tidak ditemukan.`);
            }
            const productData = productSnap.data() as Product;
            productStockCache.set(productId, productData.stockQty || 0);
            if (!productName) {
              productName = formatProductName(productData.name);
            }
          }

          preparedRows.push({
            quantity,
            unitCost,
            sellPrice,
            productId,
            productName,
            productRef,
            createProductPayload,
            nameKeyRef,
            initialStockQty,
          });
        }

        for (const row of preparedRows) {
          const {
            quantity,
            unitCost,
            sellPrice,
            productId,
            productName,
            productRef,
            createProductPayload,
            nameKeyRef,
            initialStockQty,
          } = row;

          if (createProductPayload) {
            transaction.set(productRef, createProductPayload);
          }
          if (createProductPayload && nameKeyRef) {
            transaction.set(nameKeyRef, {
              productId,
              name: productName,
              createdAt: serverTimestamp(),
            });
          }

          if (createProductPayload && initialStockQty > 0) {
            const initialLayerRef = doc(collection(db, 'inventory_layers'));
            const initialMovementRef = doc(collection(db, 'stock_movements'));

            transaction.set(initialLayerRef, {
              productId,
              quantityReceived: initialStockQty,
              quantityRemaining: initialStockQty,
              unitCost,
              sellPriceSnapshot: sellPrice,
              sourceType: 'initial_stock',
              sourceId: productId,
              receivedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            transaction.set(initialMovementRef, {
              productId,
              type: 'stock_in',
              quantityChange: initialStockQty,
              unitCost,
              layerId: initialLayerRef.id,
              referenceId: productId,
              referenceType: 'initial_stock',
              performedBy: currentUser?.uid || 'unknown',
              performedAt: serverTimestamp(),
            });
          }

          const nextStock = (productStockCache.get(productId) || 0) + quantity;
          productStockCache.set(productId, nextStock);

          const layerRef = doc(collection(db, 'inventory_layers'));
          const movementRef = doc(collection(db, 'stock_movements'));
          const purchaseItemRef = doc(collection(db, 'purchase_items'));

          transaction.set(layerRef, {
            productId,
            quantityReceived: quantity,
            quantityRemaining: quantity,
            unitCost,
            sellPriceSnapshot: sellPrice,
            sourceType: 'purchase_receipt',
            sourceId: purchaseRef.id,
            receivedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          transaction.set(movementRef, {
            productId,
            type: 'stock_in',
            quantityChange: quantity,
            unitCost,
            layerId: layerRef.id,
            referenceId: purchaseRef.id,
            referenceType: 'purchase_order',
            performedBy: currentUser?.uid || 'unknown',
            performedAt: serverTimestamp(),
            note: poDraft.note.trim(),
            receiptCode: poDraft.receiptCode.trim(),
            receiptDate,
            supplierName: poDraft.supplierName.trim(),
          });

          transaction.set(purchaseItemRef, {
            purchaseId: purchaseRef.id,
            productId,
            productNameSnapshot: formatProductName(productName),
            quantity,
            unitCost,
            sellPrice,
            subtotal: quantity * unitCost,
            createdAt: serverTimestamp(),
          });

          transaction.update(productRef, {
            stockQty: nextStock,
            costPrice: unitCost,
            sellPrice,
            latestPbDate: receiptDate,
            updatedAt: serverTimestamp(),
          });

          items.push({
            productId,
            productNameSnapshot: formatProductName(productName),
            quantity,
            unitCost,
            sellPrice,
            subtotal: quantity * unitCost,
          });
        }

        const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

        transaction.set(purchaseRef, {
          receiptCode: poDraft.receiptCode.trim(),
          receiptDate,
          supplierName: poDraft.supplierName.trim(),
          note: poDraft.note.trim(),
          items,
          totalAmount,
          receivedBy: currentUser?.uid || 'unknown',
          purchaseType: 'purchase_order',
          idempotencyKey: poDraft.idempotencyKey,
          receivedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        transaction.set(idempotencyRef, {
          purchaseId: purchaseRef.id,
          createdAt: serverTimestamp(),
          receivedBy: currentUser?.uid || 'unknown',
        });

        transaction.set(receiptCodeRef, {
          purchaseId: purchaseRef.id,
          receiptCode: receiptCodeValue,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.uid || 'unknown',
        });

        return {
          status: 'created' as const,
          purchaseId: purchaseRef.id,
        };
      });

      if (response.status === 'duplicate') {
        setPoDraft(makePoDraft());
        alert(`Request ini sudah pernah diproses (PB: ${response.purchaseId}).`);
        navigate('/stock');
        return;
      }

      setPoDraft(makePoDraft());
      alert('Pembelian Barang berhasil disimpan.');
      navigate('/stock');
    } catch (error) {
      console.error(error);
      if (error instanceof Error && error.message === 'DUPLICATE_RECEIPT_CODE') {
        setPoHeaderErrors((prev) => ({ ...prev, receiptCode: 'Kode Struk sudah digunakan. Gunakan kode lain.' }));
        alert('Kode Struk sudah digunakan. Gunakan kode lain.');
      } else if (error instanceof FirebaseError) {
        alert(`Gagal menyimpan Pembelian Barang (${error.code}). ${error.message}`);
      } else if (error instanceof Error) {
        alert(`Gagal menyimpan Pembelian Barang. ${error.message}`);
      } else {
        alert('Gagal menyimpan Pembelian Barang.');
      }
    } finally {
      setIsSavingPo(false);
    }
  };

  return (
    <div className="ai-page page-enter">
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Yakin ingin kembali?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Input yang sedang kamu isi belum disimpan. Jika lanjut, semua perubahan di halaman ini akan hilang.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleCancelLeave}
                className="ai-button-ghost flex-1 px-4 py-2.5 font-semibold text-slate-700"
              >
                Tetap di Halaman
              </button>
              <button
                type="button"
                onClick={handleConfirmLeave}
                className="ai-button flex-1 px-4 py-2.5 font-semibold"
              >
                Ya, Kembali
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="ai-card space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleBack} className="ai-button-ghost inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700">
              <ArrowLeft className="h-4 w-4" />
              Kembali
            </button>
            <div>
              <p className="ai-kicker mb-1">Inventaris</p>
              <h2 className="ai-heading text-2xl font-bold text-slate-900">Tambah Data Stok</h2>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab('product')}
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === 'product' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            Tambah Produk Baru
          </button>
          <button
            type="button"
            onClick={() => setTab('pb')}
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === 'pb' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            Tambah PB
          </button>
        </div>
      </section>

      {tab === 'product' && (
        <section className="ai-card mt-4 p-5">
          <form onSubmit={handleSaveProduct} className="space-y-4">
            <ProductFormFields
              value={productForm}
              errors={productFormErrors}
              onChange={(next) => {
                setProductFormErrors({});
                setProductForm(uppercaseProductFormInput(next));
              }}
              idPrefix="new-product"
            />
            <button
              type="submit"
              disabled={isSavingProduct}
              className="ai-button w-full px-4 py-3.5 font-bold disabled:opacity-50"
            >
              {isSavingProduct ? 'MENYIMPAN...' : 'SIMPAN PRODUK'}
            </button>
          </form>
        </section>
      )}

      {tab === 'pb' && (
        <section className="mt-4 space-y-4 pb-24">
          <div className="ai-card space-y-4 p-5">
            <h3 className="text-base font-semibold text-slate-900">Header Pembelian Barang</h3>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Kode Struk *</label>
              <input
                type="text"
                className={`ai-input w-full px-4 py-3 transition-colors duration-200 ${poHeaderErrors.receiptCode ? 'ai-input-error' : ''}`}
                value={poDraft.receiptCode}
                onChange={(e) => {
                  setPoFormError('');
                  setPoHeaderErrors((prev) => ({ ...prev, receiptCode: undefined }));
                  setPoDraft((prev) => ({ ...prev, receiptCode: uppercaseInputValue(e.target.value) }));
                }}
                placeholder="Contoh: STRUK-PB-001"
                aria-invalid={Boolean(poHeaderErrors.receiptCode)}
                aria-describedby={poHeaderErrors.receiptCode ? 'pb-receipt-code-error' : undefined}
              />
              {poHeaderErrors.receiptCode && (
                <p id="pb-receipt-code-error" className="ai-field-error mt-1 text-xs">
                  {poHeaderErrors.receiptCode}
                </p>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tanggal Struk *</label>
                <input
                  type="date"
                  className={`ai-input w-full px-4 py-3 transition-colors duration-200 ${poHeaderErrors.receiptDate ? 'ai-input-error' : ''}`}
                  value={poDraft.receiptDate}
                  onChange={(e) => {
                    setPoFormError('');
                    setPoHeaderErrors((prev) => ({ ...prev, receiptDate: undefined }));
                    setPoDraft((prev) => ({ ...prev, receiptDate: e.target.value }));
                  }}
                  aria-invalid={Boolean(poHeaderErrors.receiptDate)}
                  aria-describedby={poHeaderErrors.receiptDate ? 'pb-receipt-date-error' : undefined}
                />
                {poHeaderErrors.receiptDate && (
                  <p id="pb-receipt-date-error" className="ai-field-error mt-1 text-xs">
                    {poHeaderErrors.receiptDate}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Nama Supplier *</label>
                <input
                  type="text"
                  className={`ai-input w-full px-4 py-3 transition-colors duration-200 ${poHeaderErrors.supplierName ? 'ai-input-error' : ''}`}
                  value={poDraft.supplierName}
                  onChange={(e) => {
                    setPoFormError('');
                    setPoHeaderErrors((prev) => ({ ...prev, supplierName: undefined }));
                  setPoDraft((prev) => ({ ...prev, supplierName: uppercaseInputValue(e.target.value) }));
                  }}
                  placeholder="Contoh: PT Sumber Jaya"
                  aria-invalid={Boolean(poHeaderErrors.supplierName)}
                  aria-describedby={poHeaderErrors.supplierName ? 'pb-supplier-name-error' : undefined}
                />
                {poHeaderErrors.supplierName && (
                  <p id="pb-supplier-name-error" className="ai-field-error mt-1 text-xs">
                    {poHeaderErrors.supplierName}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
              <textarea
                className="ai-input min-h-24 w-full px-4 py-3"
                value={poDraft.note}
                onChange={(e) => setPoDraft((prev) => ({ ...prev, note: uppercaseInputValue(e.target.value) }))}
                placeholder="Opsional"
              />
            </div>
          </div>

          {poDraft.rows.map((row, index) => (
            <PoRowEditor
              key={row.id}
              row={row}
              rowIndex={index}
              errors={poRowErrors[row.id]}
              products={products}
              onChange={setPoRow}
              onRemove={removePoRow}
            />
          ))}
          {poFormError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {poFormError}
            </p>
          )}

          <button
            type="button"
            onClick={addPoRow}
            className="ai-button-ghost inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-medium text-sky-700"
          >
            <Plus className="h-4 w-4" />
            Tambah Baris Produk
          </button>

          <button
            type="button"
            onClick={handleSavePurchaseOrder}
            disabled={isSavingPo}
            className="ai-button inline-flex w-full items-center justify-center gap-2 px-4 py-3.5 font-bold disabled:opacity-50"
          >
            <PackagePlus className="h-4 w-4" />
            {isSavingPo ? 'MENYIMPAN...' : 'SIMPAN PB'}
          </button>
        </section>
      )}
    </div>
  );
}
