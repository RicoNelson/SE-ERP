import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
import { ArrowLeft, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { db } from '../lib/firebase';
import type { Product } from '../types';
import ProductFormFields from '../components/ProductFormFields';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_PRODUCT_FORM,
  normalizeProductForm,
  toNameKey,
  toProductDocument,
  validateProductForm,
  type ProductFormData,
} from '../features/products/productForm';
import { formatNumber, handleFormattedInputChange, parseNumber } from '../utils/format';

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

const PO_DRAFT_STORAGE_KEY = 'stockmate:po-draft:v1';
const LEGACY_DRAFT_KEYS = ['stockmate:pb-draft:v1'];

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

const hasMeaningfulDraftData = (draft: PoDraftState): boolean =>
  Boolean(
    draft.receiptCode.trim()
    || (draft.receiptDate && draft.receiptDate !== getTodayDateInput())
    || draft.supplierName.trim()
    || draft.note.trim()
    || draft.rows.some((row) =>
      row.productNameInput.trim()
      || row.selectedProductId
      || row.qty
      || row.buyPrice
      || row.sellPrice
      || row.inlineProductEnabled,
    ),
  );

const clearDraftStorage = () => {
  window.localStorage.removeItem(PO_DRAFT_STORAGE_KEY);
  LEGACY_DRAFT_KEYS.forEach((key) => window.localStorage.removeItem(key));
};

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
  onChange: (rowId: string, patch: Partial<PoDraftRow>) => void;
  onRemove: (rowId: string) => void;
}

function PoRowEditor({ row, products, onChange, onRemove }: PoRowEditorProps) {
  const [isFocusOpen, setIsFocusOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(row.productNameInput, 280);

  const suggestions = useMemo(() => {
    const queryText = debouncedQuery.trim().toLowerCase();
    if (!queryText) return products.slice(0, 8);
    return products
      .filter((item) => item.name.toLowerCase().includes(queryText) || item.sku.toLowerCase().includes(queryText))
      .slice(0, 8);
  }, [debouncedQuery, products]);

  const selectedProduct = products.find((item) => item.id === row.selectedProductId) || null;
  const queryHasNoMatch = debouncedQuery.trim().length > 0 && suggestions.length === 0;

  const handleSelectProduct = (product: Product) => {
    onChange(row.id, {
      selectedProductId: product.id || null,
      productNameInput: product.name,
      inlineProductEnabled: false,
      sellPrice: formatNumber(product.sellPrice),
      buyPrice: row.buyPrice || formatNumber(product.costPrice),
      inlineProductForm: {
        ...DEFAULT_PRODUCT_FORM,
        name: product.name,
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

      <div className="relative">
        <label className="mb-1 block text-sm font-medium text-slate-700">Nama Produk *</label>
        <input
          type="text"
          className="ai-input w-full px-4 py-3"
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
        />
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
                <p className="font-medium text-slate-900">{product.name}</p>
                <p className="text-xs text-slate-500">
                  SKU: {product.sku || '-'} • Stok tersisa: {formatNumber(product.stockQty)}
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
                      name: row.productNameInput.trim(),
                      costPrice: row.buyPrice,
                      sellPrice: row.sellPrice,
                    },
                  })
                }
                className="w-full rounded-xl border border-dashed border-sky-300 bg-sky-50 px-3 py-2 text-left text-sm font-medium text-sky-700"
              >
                + Tambah produk baru "{row.productNameInput.trim()}"
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
            className="ai-input w-full px-4 py-3"
            value={row.qty}
            onChange={(e) => {
              const { formatted } = handleFormattedInputChange(e.target.value);
              onChange(row.id, { qty: formatted });
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Harga Beli *</label>
          <input
            type="text"
            inputMode="numeric"
            className="ai-input w-full px-4 py-3"
            value={row.buyPrice}
            onChange={(e) => {
              const { formatted } = handleFormattedInputChange(e.target.value);
              onChange(row.id, {
                buyPrice: formatted,
                inlineProductForm: { ...row.inlineProductForm, costPrice: formatted },
              });
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Harga Jual *</label>
          <input
            type="text"
            inputMode="numeric"
            className="ai-input w-full px-4 py-3"
            value={row.sellPrice}
            onChange={(e) => {
              const { formatted } = handleFormattedInputChange(e.target.value);
              onChange(row.id, {
                sellPrice: formatted,
                inlineProductForm: { ...row.inlineProductForm, sellPrice: formatted },
              });
            }}
          />
        </div>
      </div>

      {selectedProduct && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          Produk dipilih: {selectedProduct.name} • Stok tersisa: {formatNumber(selectedProduct.stockQty)}
        </p>
      )}

      {row.inlineProductEnabled && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">Tambah Produk Baru (Inline)</p>
            <button
              type="button"
              onClick={() => onChange(row.id, { inlineProductEnabled: false })}
              className="text-xs font-medium text-slate-600 hover:text-slate-800"
            >
              Tutup
            </button>
          </div>
          <ProductFormFields
            value={row.inlineProductForm}
            onChange={(next) => onChange(row.id, { inlineProductForm: next })}
            idPrefix={`po-inline-${row.id}`}
          />
          <p className="mt-3 text-xs text-slate-500">
            Catatan: Stok awal produk baru akan diatur 0, lalu stok ditambah lewat baris PB ini saat disimpan.
          </p>
        </div>
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
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [hasAppliedProductPrefill, setHasAppliedProductPrefill] = useState(false);
  const { currentUser } = useAuth();

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
    const raw = window.localStorage.getItem(PO_DRAFT_STORAGE_KEY);
    if (!raw) {
      setDraftHydrated(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PoDraftState;
      if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length === 0 || !hasMeaningfulDraftData(parsed)) {
        clearDraftStorage();
        setDraftHydrated(true);
        return;
      }

      const shouldRestore = window.confirm('Lanjutkan draft sebelumnya?');
      if (!shouldRestore) {
        clearDraftStorage();
        setDraftHydrated(true);
        return;
      }

      setPoDraft({
        ...parsed,
        idempotencyKey: parsed.idempotencyKey || crypto.randomUUID(),
        rows: parsed.rows.map((row) => ({
          ...row,
          id: row.id || crypto.randomUUID(),
          inlineProductForm: row.inlineProductForm || { ...DEFAULT_PRODUCT_FORM },
        })),
      });
    } catch {
      clearDraftStorage();
    } finally {
      setDraftHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    const hasMeaningfulData = hasMeaningfulDraftData(poDraft);

    if (!hasMeaningfulData) {
      clearDraftStorage();
      return;
    }
    window.localStorage.setItem(PO_DRAFT_STORAGE_KEY, JSON.stringify(poDraft));
  }, [poDraft, draftHydrated]);

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  }, [tab, setSearchParams]);

  useEffect(() => {
    const preselectProductId = searchParams.get('productId');
    if (!preselectProductId || !products.length || !draftHydrated || hasAppliedProductPrefill) return;
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
        productNameInput: found.name,
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
  }, [searchParams, products, poDraft.rows, draftHydrated, hasAppliedProductPrefill, setSearchParams]);

  const setPoRow = (rowId: string, patch: Partial<PoDraftRow>) => {
    setPoDraft((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    }));
  };

  const removePoRow = (rowId: string) => {
    setPoDraft((prev) => ({
      ...prev,
      rows: prev.rows.filter((row) => row.id !== rowId).length > 0
        ? prev.rows.filter((row) => row.id !== rowId)
        : [makeRow()],
    }));
  };

  const addPoRow = () => {
    setPoDraft((prev) => ({
      ...prev,
      rows: [...prev.rows, makeRow()],
    }));
  };

  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSavingProduct) return;

    const validationErrors = validateProductForm(productForm);
    if (validationErrors.length > 0) {
      alert(validationErrors[0]);
      return;
    }

    const normalized = normalizeProductForm(productForm);
    const duplicate = products.some((item) => toNameKey(item.name) === normalized.nameKey);
    if (duplicate) {
      alert('Nama produk sudah ada. Gunakan nama lain.');
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
      alert('Produk berhasil dibuat.');
    } catch (error) {
      if (error instanceof Error && error.message === 'DUPLICATE_PRODUCT_NAME') {
        alert('Nama produk sudah terdaftar.');
      } else {
        console.error(error);
        alert('Gagal menyimpan produk.');
      }
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleSavePurchaseOrder = async () => {
    if (isSavingPo) return;

    if (!poDraft.receiptCode.trim()) {
      alert('Kode Struk wajib diisi.');
      return;
    }

    if (!poDraft.receiptDate) {
      alert('Tanggal Struk wajib diisi.');
      return;
    }

    if (!poDraft.supplierName.trim()) {
      alert('Nama Supplier wajib diisi.');
      return;
    }

    if (poDraft.rows.length === 0) {
      alert('Minimal satu item PB wajib diisi.');
      return;
    }

    const existingNameKeys = new Set(products.map((item) => toNameKey(item.name)));
    const inlineNameKeys = new Set<string>();

    for (const row of poDraft.rows) {
      const qty = parseNumber(row.qty);
      const buyPrice = parseNumber(row.buyPrice);
      const sellPrice = parseNumber(row.sellPrice);

      if (qty <= 0) {
        alert('Jumlah item PB harus lebih dari 0.');
        return;
      }
      if (buyPrice <= 0) {
        alert('Harga Beli item PB harus lebih dari 0.');
        return;
      }
      if (sellPrice <= 0) {
        alert('Harga Jual item PB harus lebih dari 0.');
        return;
      }

      if (!row.selectedProductId && !row.inlineProductEnabled) {
        alert('Pilih produk yang ada atau buat produk baru inline.');
        return;
      }

      if (row.inlineProductEnabled) {
        const inlineErrors = validateProductForm(row.inlineProductForm);
        if (inlineErrors.length > 0) {
          alert(inlineErrors[0]);
          return;
        }

        const inlineNameKey = toNameKey(row.inlineProductForm.name);
        if (existingNameKeys.has(inlineNameKey) || inlineNameKeys.has(inlineNameKey)) {
          alert(`Produk "${row.inlineProductForm.name}" sudah ada. Pilih produk existing untuk baris ini.`);
          return;
        }
        inlineNameKeys.add(inlineNameKey);
      }
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

        for (const row of poDraft.rows) {
          const quantity = parseNumber(row.qty);
          const unitCost = parseNumber(row.buyPrice);
          const sellPrice = parseNumber(row.sellPrice);

          let productId = row.selectedProductId || '';
          let productName = row.productNameInput.trim();
          let productRef: DocumentReference;

          if (row.inlineProductEnabled) {
            const normalized = normalizeProductForm({
              ...row.inlineProductForm,
              stockQty: '0',
            });
            const nameKeyRef = doc(db, 'product_name_keys', normalized.nameKey);
            const existingName = await transaction.get(nameKeyRef);

            if (existingName.exists()) {
              productId = existingName.data().productId;
              productRef = doc(db, 'products', productId);
            } else {
              productRef = doc(collection(db, 'products'));
              productId = productRef.id;
              productName = normalized.name;
              transaction.set(productRef, toProductDocument({
                ...normalized,
                stockQty: 0,
              }));
              transaction.set(nameKeyRef, {
                productId,
                name: normalized.name,
                createdAt: serverTimestamp(),
              });
              productStockCache.set(productId, 0);
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
              productName = productData.name;
            }
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
            productNameSnapshot: productName,
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
            updatedAt: serverTimestamp(),
          });

          items.push({
            productId,
            productNameSnapshot: productName,
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

        return {
          status: 'created' as const,
          purchaseId: purchaseRef.id,
        };
      });

      if (response.status === 'duplicate') {
        setPoDraft(makePoDraft());
        clearDraftStorage();
        alert(`Request ini sudah pernah diproses (PB: ${response.purchaseId}).`);
        navigate('/stock');
        return;
      }

      setPoDraft(makePoDraft());
      clearDraftStorage();
      alert('Pembelian Barang berhasil disimpan.');
      navigate('/stock');
    } catch (error) {
      console.error(error);
      alert('Gagal menyimpan Pembelian Barang.');
    } finally {
      setIsSavingPo(false);
    }
  };

  return (
    <div className="ai-page page-enter">
      <section className="ai-card space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/stock" className="ai-button-ghost inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700">
              <ArrowLeft className="h-4 w-4" />
              Kembali
            </Link>
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
            <ProductFormFields value={productForm} onChange={setProductForm} idPrefix="new-product" />
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
                className="ai-input w-full px-4 py-3"
                value={poDraft.receiptCode}
                onChange={(e) => setPoDraft((prev) => ({ ...prev, receiptCode: e.target.value }))}
                placeholder="Contoh: STRUK-PB-001"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tanggal Struk *</label>
                <input
                  type="date"
                  className="ai-input w-full px-4 py-3"
                  value={poDraft.receiptDate}
                  onChange={(e) => setPoDraft((prev) => ({ ...prev, receiptDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Nama Supplier *</label>
                <input
                  type="text"
                  className="ai-input w-full px-4 py-3"
                  value={poDraft.supplierName}
                  onChange={(e) => setPoDraft((prev) => ({ ...prev, supplierName: e.target.value }))}
                  placeholder="Contoh: PT Sumber Jaya"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
              <textarea
                className="ai-input min-h-24 w-full px-4 py-3"
                value={poDraft.note}
                onChange={(e) => setPoDraft((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Opsional"
              />
            </div>
          </div>

          {poDraft.rows.map((row) => (
            <PoRowEditor
              key={row.id}
              row={row}
              products={products}
              onChange={setPoRow}
              onRemove={removePoRow}
            />
          ))}

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
