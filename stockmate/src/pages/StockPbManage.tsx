import { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { ArrowLeft, PackagePlus, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import type { Product } from '../types';
import ProductFormFields from '../components/ProductFormFields';
import {
  DEFAULT_PRODUCT_FORM,
  getProductFormFieldErrors,
  normalizeProductForm,
  toNameKey,
  toProductDocument,
  type NormalizedProductInput,
  type ProductFormData,
  type ProductFormFieldErrors,
} from '../features/products/productForm';
import { formatNumber, formatProductName, handleFormattedInputChange, matchesFuzzySearch, normalizeSearchQuery, parseNumber } from '../utils/format';

interface PurchaseSummaryItem {
  purchaseItemId?: string;
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  unitCost: number;
  sellPrice: number;
}

interface PurchaseSummary {
  id: string;
  receiptCode?: string;
  supplierName?: string;
  receiptDate?: Date | null;
  receivedAt?: Date | null;
  totalAmount: number;
  items: PurchaseSummaryItem[];
  purchaseType?: string;
  receivedBy?: string;
}

interface EditablePbItem extends PurchaseSummaryItem {
  draftQuantity: string;
  draftUnitCost: string;
  draftSellPrice: string;
  originalQuantity: number;
  isNew?: boolean;
  pendingNewProduct?: NormalizedProductInput;
  layerQuantityRemaining?: number;
  layerQuantityReceived?: number;
  soldFromLayer?: number;
}

export default function StockPbManage() {
  const { currentUser, userProfile } = useAuth();
  const userRole = userProfile?.role || 'staff';
  const [products, setProducts] = useState<Product[]>([]);
  const [pbList, setPbList] = useState<PurchaseSummary[]>([]);
  const [isPbListLoading, setIsPbListLoading] = useState(false);
  const [pbSearchQuery, setPbSearchQuery] = useState('');
  const [pbDateFrom, setPbDateFrom] = useState('');
  const [pbDateTo, setPbDateTo] = useState('');
  const [showHiddenPb, setShowHiddenPb] = useState(false);
  const [fullySoldPbIds, setFullySoldPbIds] = useState<Set<string>>(new Set());
  const [pbCurrentPage, setPbCurrentPage] = useState(1);
  const [selectedPb, setSelectedPb] = useState<PurchaseSummary | null>(null);
  const [pbEditableItems, setPbEditableItems] = useState<EditablePbItem[]>([]);
  const [pbPendingMissingItems, setPbPendingMissingItems] = useState<EditablePbItem[]>([]);
  const [removedPbItems, setRemovedPbItems] = useState<EditablePbItem[]>([]);
  const [isPbDetailLoading, setIsPbDetailLoading] = useState(false);
  const [isPbSaving, setIsPbSaving] = useState(false);
  const [pbFieldError, setPbFieldError] = useState<string | null>(null);
  const [addProductMode, setAddProductMode] = useState<'existing' | 'new'>('existing');
  const [pbAddProductQuery, setPbAddProductQuery] = useState('');
  const [pbAddProductId, setPbAddProductId] = useState<string | null>(null);
  const [isAddProductFocusOpen, setIsAddProductFocusOpen] = useState(false);
  const [pbAddQty, setPbAddQty] = useState('1');
  const [pbAddBuyPrice, setPbAddBuyPrice] = useState('');
  const [pbAddSellPrice, setPbAddSellPrice] = useState('');
  const [pbAddProductForm, setPbAddProductForm] = useState<ProductFormData>({ ...DEFAULT_PRODUCT_FORM });
  const [pbAddProductFormErrors, setPbAddProductFormErrors] = useState<ProductFormFieldErrors>({});

  const normalizedPbSearchQuery = normalizeSearchQuery(pbSearchQuery);

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((document) => {
        prods.push({ id: document.id, ...document.data() } as Product);
      });
      setProducts(prods);
    });
    return () => unsubscribe();
  }, []);

  const toDateValue = (value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
      return ((value as { toDate: () => Date }).toDate());
    }
    return null;
  };

  const loadPbList = useCallback(async () => {
    if (!currentUser?.uid) return [] as PurchaseSummary[];
    setIsPbListLoading(true);
    try {
      const purchaseQuery = query(collection(db, 'purchases'), limit(400));
      const layerQuery = query(
        collection(db, 'inventory_layers'),
        where('sourceType', '==', 'purchase_receipt'),
        limit(4000),
      );
      const [purchaseSnap, layerSnap] = await Promise.all([
        getDocs(purchaseQuery),
        getDocs(layerQuery),
      ]);
      const docs = purchaseSnap.docs;
      const purchases: PurchaseSummary[] = docs
        .map((purchaseDoc) => {
          const data = purchaseDoc.data();
          const docItems = Array.isArray(data.items) ? data.items : [];
          const items: PurchaseSummaryItem[] = docItems.map((item: Record<string, unknown>) => ({
            productId: String(item.productId || ''),
            productNameSnapshot: String(item.productNameSnapshot || '-'),
            quantity: Number(item.quantity || 0),
            unitCost: Number(item.unitCost || 0),
            sellPrice: Number(item.sellPrice || 0),
          }));
          return {
            id: purchaseDoc.id,
            receiptCode: data.receiptCode || '',
            supplierName: data.supplierName || '',
            receiptDate: toDateValue(data.receiptDate),
            receivedAt: toDateValue(data.receivedAt),
            totalAmount: data.totalAmount || 0,
            items,
            purchaseType: data.purchaseType || '',
            receivedBy: data.receivedBy || '',
          };
        })
        .filter((item) => {
          const isPbType = item.purchaseType === 'purchase_order';
          const isLegacyPb = !item.purchaseType && (Boolean(item.receiptCode) || item.items.length > 0);
          return isPbType || isLegacyPb;
        })
        .sort((a, b) => {
          const aTime = a.receivedAt?.getTime() || a.receiptDate?.getTime() || 0;
          const bTime = b.receivedAt?.getTime() || b.receiptDate?.getTime() || 0;
          return bTime - aTime;
        });

      const layerStatusByPbId = new Map<string, { hasLayer: boolean; hasRemainingStock: boolean }>();
      layerSnap.forEach((layerDoc) => {
        const layerData = layerDoc.data();
        const pbId = typeof layerData.sourceId === 'string' ? layerData.sourceId : '';
        if (!pbId) return;
        const currentStatus = layerStatusByPbId.get(pbId) || { hasLayer: false, hasRemainingStock: false };
        const remainingQty = Number(layerData.quantityRemaining || 0);
        layerStatusByPbId.set(pbId, {
          hasLayer: true,
          hasRemainingStock: currentStatus.hasRemainingStock || remainingQty > 0,
        });
      });

      const nextFullySoldPbIds = new Set<string>();
      const activeProductIds = new Set<string>();
      products.forEach((product) => {
        if (!product.id) return;
        const isSoftDeleted = product.isActive === false;
        if (!isSoftDeleted) activeProductIds.add(product.id);
      });

      purchases.forEach((purchase) => {
        const status = layerStatusByPbId.get(purchase.id);
        const itemProductIds = purchase.items.map((item) => item.productId).filter(Boolean);
        const hasDeletedProductRef = itemProductIds.some((productId) => !activeProductIds.has(productId));

        if ((status?.hasLayer && !status.hasRemainingStock) || hasDeletedProductRef) {
          nextFullySoldPbIds.add(purchase.id);
        }
      });

      setFullySoldPbIds(nextFullySoldPbIds);
      setPbList(purchases);
      return purchases;
    } catch (error) {
      console.error('Error loading PB list:', error);
      setFullySoldPbIds(new Set());
      alert('Gagal memuat daftar PB.');
      return [] as PurchaseSummary[];
    } finally {
      setIsPbListLoading(false);
    }
  }, [currentUser?.uid, products]);

  useEffect(() => {
    void loadPbList();
  }, [loadPbList]);

  useEffect(() => {
    setPbCurrentPage(1);
  }, [pbSearchQuery, pbDateFrom, pbDateTo, showHiddenPb]);

  const searchFilteredPbList = pbList.filter((purchase) => {
    const keywordMatch = (() => {
      if (!normalizedPbSearchQuery) return true;
      return matchesFuzzySearch(normalizedPbSearchQuery, [purchase.receiptCode, purchase.supplierName]);
    })();

    const dateMatch = (() => {
      if (!pbDateFrom && !pbDateTo) return true;
      if (!purchase.receiptDate) return false;
      const purchaseDateIso = purchase.receiptDate.toISOString().slice(0, 10);

      if (pbDateFrom && pbDateTo) {
        const minDate = pbDateFrom <= pbDateTo ? pbDateFrom : pbDateTo;
        const maxDate = pbDateFrom <= pbDateTo ? pbDateTo : pbDateFrom;
        return purchaseDateIso >= minDate && purchaseDateIso <= maxDate;
      }
      if (pbDateFrom) return purchaseDateIso >= pbDateFrom;
      return purchaseDateIso <= pbDateTo;
    })();

    return keywordMatch && dateMatch;
  });
  const hiddenPbCount = searchFilteredPbList.filter((purchase) => fullySoldPbIds.has(purchase.id)).length;
  const filteredPbList = showHiddenPb
    ? searchFilteredPbList
    : searchFilteredPbList.filter((purchase) => !fullySoldPbIds.has(purchase.id));
  const orderedPbList = showHiddenPb
    ? [...filteredPbList].sort((a, b) => {
      const aIsSold = fullySoldPbIds.has(a.id);
      const bIsSold = fullySoldPbIds.has(b.id);
      if (aIsSold !== bIsSold) return aIsSold ? -1 : 1;
      const aTime = a.receivedAt?.getTime() || a.receiptDate?.getTime() || 0;
      const bTime = b.receivedAt?.getTime() || b.receiptDate?.getTime() || 0;
      return bTime - aTime;
    })
    : filteredPbList;
  const pbItemsPerPage = 8;
  const pbTotalPages = Math.max(1, Math.ceil(orderedPbList.length / pbItemsPerPage));
  const pbStartIndex = (pbCurrentPage - 1) * pbItemsPerPage;
  const paginatedPbList = orderedPbList.slice(pbStartIndex, pbStartIndex + pbItemsPerPage);

  useEffect(() => {
    if (pbCurrentPage > pbTotalPages) setPbCurrentPage(pbTotalPages);
  }, [pbCurrentPage, pbTotalPages]);

  const availableProductsForPb = products
    .filter((product): product is Product & { id: string } => Boolean(product.id))
    .filter((product) => (
      !pbEditableItems.some((item) => item.productId === product.id)
      && !pbPendingMissingItems.some((item) => item.productId === product.id)
    ))
    .sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));

  const filteredAddProductSuggestions = availableProductsForPb
    .filter((item) => {
      return matchesFuzzySearch(pbAddProductQuery, [item.name, item.sku]);
    })
    .slice(0, 8);
  const hasIdenticalNameMatch = pbAddProductQuery.trim().length > 0
    && products.some((item) => toNameKey(item.name) === toNameKey(pbAddProductQuery));
  const canShowAddNewOption = pbAddProductQuery.trim().length > 0 && !hasIdenticalNameMatch;

  const handleSelectAddProduct = (product: Product) => {
    setPbAddProductId(product.id || null);
    setPbAddProductQuery(formatProductName(product.name));
    setPbAddBuyPrice(formatNumber(product.costPrice || 0));
    setPbAddSellPrice(formatNumber(product.sellPrice || 0));
    setIsAddProductFocusOpen(false);
    setPbFieldError(null);
  };

  const loadPbDetail = async (purchase: PurchaseSummary) => {
    setSelectedPb(purchase);
    setPbFieldError(null);
    setRemovedPbItems([]);
    setPbPendingMissingItems([]);
    setAddProductMode('existing');
    setPbAddProductQuery('');
    setPbAddProductId(null);
    setPbAddProductForm({ ...DEFAULT_PRODUCT_FORM });
    setPbAddProductFormErrors({});
    setPbAddQty('1');
    setPbAddBuyPrice('');
    setPbAddSellPrice('');
    setIsPbDetailLoading(true);
    try {
      const itemsQuery = query(
        collection(db, 'purchase_items'),
        where('purchaseId', '==', purchase.id),
        limit(500),
      );
      const layersQuery = query(
        collection(db, 'inventory_layers'),
        where('sourceId', '==', purchase.id),
        limit(500),
      );
      const [itemSnap, layersSnap] = await Promise.all([
        getDocs(itemsQuery),
        getDocs(layersQuery),
      ]);
      const purchaseItemOrder = new Map<string, number>();
      purchase.items.forEach((item, index) => {
        if (!item.productId) return;
        purchaseItemOrder.set(item.productId, index);
      });

      const layerMap = new Map<string, { quantityReceived: number; quantityRemaining: number; soldQty: number }>();
      layersSnap.forEach((layerDoc) => {
        const data = layerDoc.data();
        if (data.sourceType !== 'purchase_receipt' || !data.productId) return;
        const quantityReceived = Number(data.quantityReceived || 0);
        const quantityRemaining = Number(data.quantityRemaining || 0);
        layerMap.set(data.productId, {
          quantityReceived,
          quantityRemaining,
          soldQty: Math.max(quantityReceived - quantityRemaining, 0),
        });
      });

      const itemsFromRows: EditablePbItem[] = itemSnap.docs.map((itemDoc) => {
        const data = itemDoc.data();
        const quantity = Number(data.quantity || 0);
        const layer = layerMap.get(data.productId || '');
        return {
          purchaseItemId: itemDoc.id,
          productId: data.productId || '',
          productNameSnapshot: data.productNameSnapshot || '-',
          quantity,
          unitCost: Number(data.unitCost || 0),
          sellPrice: Number(data.sellPrice || 0),
          draftQuantity: quantity.toString(),
          draftUnitCost: formatNumber(Number(data.unitCost || 0)),
          draftSellPrice: formatNumber(Number(data.sellPrice || 0)),
          originalQuantity: quantity,
          isNew: false,
          layerQuantityRemaining: layer?.quantityRemaining || 0,
          layerQuantityReceived: layer?.quantityReceived || quantity,
          soldFromLayer: layer?.soldQty || 0,
        };
      }).sort((a, b) => {
        const aOrder = purchaseItemOrder.get(a.productId);
        const bOrder = purchaseItemOrder.get(b.productId);
        const aHasOrder = typeof aOrder === 'number';
        const bHasOrder = typeof bOrder === 'number';
        if (aHasOrder && bHasOrder) return (aOrder as number) - (bOrder as number);
        if (aHasOrder) return -1;
        if (bHasOrder) return 1;
        return 0;
      });

      if (itemsFromRows.length > 0) {
        setPbEditableItems(itemsFromRows);
        return;
      }

      const fallbackItems: EditablePbItem[] = purchase.items.map((item) => ({
        ...item,
        draftQuantity: item.quantity.toString(),
        draftUnitCost: formatNumber(item.unitCost),
        draftSellPrice: formatNumber(item.sellPrice),
        originalQuantity: item.quantity,
        isNew: false,
        layerQuantityRemaining: item.quantity,
        layerQuantityReceived: item.quantity,
        soldFromLayer: 0,
      }));
      setPbEditableItems(fallbackItems);
    } catch (error) {
      console.error('Error loading PB detail:', error);
      setPbEditableItems([]);
      alert('Gagal memuat detail PB.');
    } finally {
      setIsPbDetailLoading(false);
    }
  };

  const handleAddMissingPbProduct = () => {
    const quantity = parseNumber(pbAddQty);
    if (!pbAddQty.trim() || quantity <= 0) {
      setPbFieldError('Jumlah produk tambahan harus lebih dari 0.');
      return;
    }
    if (addProductMode === 'existing') {
      if (!pbAddProductId) {
        setPbFieldError('Pilih produk yang ingin ditambahkan.');
        return;
      }
      const unitCost = parseNumber(pbAddBuyPrice);
      const sellPrice = parseNumber(pbAddSellPrice);
      if (!pbAddBuyPrice.trim() || unitCost <= 0) {
        setPbFieldError('Harga Beli wajib diisi dan lebih dari 0.');
        return;
      }
      if (!pbAddSellPrice.trim() || sellPrice <= 0) {
        setPbFieldError('Harga Jual wajib diisi dan lebih dari 0.');
        return;
      }
      const product = products.find((item) => item.id === pbAddProductId);
      const productId = product?.id;
      if (!productId || !product) {
        setPbFieldError('Produk tidak ditemukan.');
        return;
      }
      if (
        pbEditableItems.some((item) => item.productId === productId)
        || pbPendingMissingItems.some((item) => item.productId === productId)
      ) {
        setPbFieldError('Produk sudah ada di PB ini.');
        return;
      }
      setPbPendingMissingItems((prev) => ([
        ...prev,
        {
          productId,
          productNameSnapshot: formatProductName(product.name),
          quantity,
          draftQuantity: quantity.toString(),
          draftUnitCost: formatNumber(unitCost),
          draftSellPrice: formatNumber(sellPrice),
          originalQuantity: 0,
          unitCost,
          sellPrice,
          isNew: true,
        },
      ]));
      setPbAddProductQuery('');
      setPbAddProductId(null);
      setPbAddQty('1');
      setPbAddBuyPrice('');
      setPbAddSellPrice('');
      setPbFieldError(null);
      return;
    }

    const nextProductErrors = getProductFormFieldErrors(pbAddProductForm);
    if (Object.keys(nextProductErrors).length > 0) {
      setPbAddProductFormErrors(nextProductErrors);
      return;
    }
    const normalizedProduct = normalizeProductForm(pbAddProductForm);
    const duplicate = products.some((item) => toNameKey(item.name) === normalizedProduct.nameKey);
    if (duplicate) {
      setPbAddProductFormErrors({ name: 'Nama produk sudah ada. Gunakan produk existing.' });
      return;
    }
    const duplicatePending = pbEditableItems.some((item) => (
      toNameKey(item.productNameSnapshot) === normalizedProduct.nameKey
      || item.pendingNewProduct?.nameKey === normalizedProduct.nameKey
    )) || pbPendingMissingItems.some((item) => (
      toNameKey(item.productNameSnapshot) === normalizedProduct.nameKey
      || item.pendingNewProduct?.nameKey === normalizedProduct.nameKey
    ));
    if (duplicatePending) {
      setPbAddProductFormErrors({ name: 'Produk dengan nama yang sama sudah ada di PB ini.' });
      return;
    }
    const temporaryProductId = `new-${crypto.randomUUID()}`;
    setPbPendingMissingItems((prev) => ([
      ...prev,
      {
        productId: temporaryProductId,
        productNameSnapshot: normalizedProduct.name,
        quantity,
        draftQuantity: quantity.toString(),
        draftUnitCost: formatNumber(normalizedProduct.costPrice),
        draftSellPrice: formatNumber(normalizedProduct.sellPrice),
        originalQuantity: 0,
        unitCost: normalizedProduct.costPrice,
        sellPrice: normalizedProduct.sellPrice,
        isNew: true,
        pendingNewProduct: normalizedProduct,
      },
    ]));
    setPbAddProductForm({ ...DEFAULT_PRODUCT_FORM });
    setPbAddProductFormErrors({});
    setPbAddQty('1');
    setPbAddBuyPrice('');
    setPbAddSellPrice('');
    setPbFieldError(null);
  };

  const handleRemovePendingMissingItem = (productId: string) => {
    setPbPendingMissingItems((prev) => prev.filter((item) => item.productId !== productId));
    setPbFieldError(null);
  };

  const handleApplyPendingMissingItems = () => {
    if (pbPendingMissingItems.length === 0) {
      setPbFieldError('Belum ada produk terlewat yang ditambahkan.');
      return;
    }
    setPbEditableItems((prev) => [...prev, ...pbPendingMissingItems]);
    setPbPendingMissingItems([]);
    setPbFieldError(null);
  };

  const handleRemovePbItem = (item: EditablePbItem) => {
    setPbEditableItems((prev) => prev.filter((row) => row.productId !== item.productId));
    setRemovedPbItems((prev) => (
      prev.some((row) => row.productId === item.productId)
        ? prev
        : [...prev, item]
    ));
    setPbFieldError(null);
  };

  const handleRestoreRemovedPbItem = (item: EditablePbItem) => {
    setRemovedPbItems((prev) => prev.filter((row) => row.productId !== item.productId));
    setPbEditableItems((prev) => {
      if (prev.some((row) => row.productId === item.productId)) return prev;
      return [...prev, item];
    });
    setPbFieldError(null);
  };

  const handleSavePbAdjustments = async () => {
    if (userRole !== 'owner') {
      setPbFieldError('Hanya owner yang dapat memperbarui PB.');
      return;
    }
    if (!selectedPb?.id || isPbSaving) return;
    const combinedEditableItems = [...pbEditableItems, ...pbPendingMissingItems];
    const invalidItem = combinedEditableItems.find((item) => !item.draftQuantity.trim() || parseNumber(item.draftQuantity) <= 0);
    if (invalidItem) {
      setPbFieldError(`Jumlah item untuk produk "${invalidItem.productNameSnapshot}" wajib lebih dari 0.`);
      return;
    }
    const invalidBuyPriceItem = combinedEditableItems.find((item) => !item.draftUnitCost.trim() || parseNumber(item.draftUnitCost) <= 0);
    if (invalidBuyPriceItem) {
      setPbFieldError(`Harga beli untuk produk "${invalidBuyPriceItem.productNameSnapshot}" wajib lebih dari 0.`);
      return;
    }
    const invalidSellPriceItem = combinedEditableItems.find((item) => !item.draftSellPrice.trim() || parseNumber(item.draftSellPrice) <= 0);
    if (invalidSellPriceItem) {
      setPbFieldError(`Harga jual untuk produk "${invalidSellPriceItem.productNameSnapshot}" wajib lebih dari 0.`);
      return;
    }
    setPbFieldError(null);
    setIsPbSaving(true);

    try {
      const purchaseRef = doc(db, 'purchases', selectedPb.id);
      const receiptCode = selectedPb.receiptCode || '-';
      const supplierName = selectedPb.supplierName || '';
      const receiptDate = selectedPb.receiptDate || null;
      const preparedItems = combinedEditableItems.map((item) => {
        const nextQuantity = parseNumber(item.draftQuantity);
        const nextUnitCost = parseNumber(item.draftUnitCost);
        const nextSellPrice = parseNumber(item.draftSellPrice);
        return {
          ...item,
          nextQuantity,
          unitCost: nextUnitCost,
          sellPrice: nextSellPrice,
        };
      });
      const preparedRemovedItems = removedPbItems.filter((item) => !item.isNew);

      const purchaseItemQuery = query(
        collection(db, 'purchase_items'),
        where('purchaseId', '==', selectedPb.id),
        limit(500),
      );
      const layerQuery = query(
        collection(db, 'inventory_layers'),
        where('sourceId', '==', selectedPb.id),
        limit(500),
      );

      const [purchaseItemSnap, layerSnap] = await Promise.all([
        getDocs(purchaseItemQuery),
        getDocs(layerQuery),
      ]);

      const purchaseItemByProduct = new Map<string, string>();
      purchaseItemSnap.forEach((itemDoc) => {
        const data = itemDoc.data();
        if (data.productId) purchaseItemByProduct.set(data.productId, itemDoc.id);
      });

      const layerByProduct = new Map<string, string>();
      layerSnap.forEach((layerDoc) => {
        const data = layerDoc.data();
        if (data.productId && data.sourceType === 'purchase_receipt') layerByProduct.set(data.productId, layerDoc.id);
      });

      await runTransaction(db, async (transaction) => {
        const purchaseSnap = await transaction.get(purchaseRef);
        if (!purchaseSnap.exists()) throw new Error('PB tidak ditemukan.');

        const preparedContexts: Array<{
          item: (typeof preparedItems)[number];
          productId: string;
          productRef: ReturnType<typeof doc>;
          currentStockQty: number;
          pendingNewProduct: NormalizedProductInput | null;
          nameKeyRef: ReturnType<typeof doc> | null;
          layerId: string | null;
          previousReceived: number;
          soldQty: number;
        }> = [];
        const removedContexts: Array<{
          removedItem: (typeof preparedRemovedItems)[number];
          layerId: string;
          layerRef: ReturnType<typeof doc>;
          previousReceived: number;
          productRef: ReturnType<typeof doc>;
          nextStockQty: number | null;
        }> = [];

        // Firestore transactions require every read to happen before any write.
        for (const item of preparedItems) {
          let productId = item.productId;
          let productRef = doc(db, 'products', productId);
          let currentStockQty = 0;
          let pendingNewProduct: NormalizedProductInput | null = null;
          let nameKeyRef: ReturnType<typeof doc> | null = null;
          let layerId: string | null = null;
          let previousReceived = 0;
          let soldQty = 0;

          if (item.pendingNewProduct) {
            pendingNewProduct = item.pendingNewProduct;
            nameKeyRef = doc(db, 'product_name_keys', pendingNewProduct.nameKey);
            const nameKeySnap = await transaction.get(nameKeyRef);
            if (nameKeySnap.exists()) {
              throw new Error(`Produk "${pendingNewProduct.name}" sudah terdaftar. Gunakan produk existing.`);
            }

            productRef = doc(collection(db, 'products'));
            productId = productRef.id;
            currentStockQty = pendingNewProduct.stockQty;
          } else {
            const productSnap = await transaction.get(productRef);
            if (!productSnap.exists()) throw new Error(`Produk ${item.productNameSnapshot} tidak ditemukan.`);
            const productData = productSnap.data() as Product;
            currentStockQty = productData.stockQty || 0;
          }

          if (!item.isNew) {
            layerId = layerByProduct.get(item.productId) || null;
            if (!layerId) throw new Error(`Layer FIFO PB untuk ${item.productNameSnapshot} tidak ditemukan.`);
            const layerRef = doc(db, 'inventory_layers', layerId);
            const layerSnapInside = await transaction.get(layerRef);
            if (!layerSnapInside.exists()) throw new Error(`Layer FIFO PB untuk ${item.productNameSnapshot} tidak ditemukan.`);
            const layerData = layerSnapInside.data();
            previousReceived = Number(layerData.quantityReceived || item.originalQuantity || 0);
            const previousRemaining = Number(layerData.quantityRemaining || 0);
            soldQty = Math.max(previousReceived - previousRemaining, 0);

            if (item.nextQuantity < soldQty) {
              throw new Error(`Jumlah baru ${item.productNameSnapshot} tidak boleh kurang dari yang sudah terjual (${formatNumber(soldQty)}).`);
            }
          }

          preparedContexts.push({
            item,
            productId,
            productRef,
            currentStockQty,
            pendingNewProduct,
            nameKeyRef,
            layerId,
            previousReceived,
            soldQty,
          });
        }

        for (const removedItem of preparedRemovedItems) {
          const layerId = layerByProduct.get(removedItem.productId);
          if (!layerId) continue;

          const layerRef = doc(db, 'inventory_layers', layerId);
          const layerSnapInside = await transaction.get(layerRef);
          if (!layerSnapInside.exists()) continue;
          const layerData = layerSnapInside.data();
          const previousReceived = Number(layerData.quantityReceived || removedItem.originalQuantity || 0);
          const previousRemaining = Number(layerData.quantityRemaining || 0);
          const soldQty = Math.max(previousReceived - previousRemaining, 0);

          if (soldQty > 0) {
            throw new Error(`Produk ${removedItem.productNameSnapshot} tidak bisa dihapus dari PB karena sudah terjual ${formatNumber(soldQty)}.`);
          }

          const productRef = doc(db, 'products', removedItem.productId);
          const productSnap = await transaction.get(productRef);
          const nextStockQty = productSnap.exists()
            ? Math.max(0, (((productSnap.data() as Product).stockQty) || 0) - previousReceived)
            : null;

          removedContexts.push({
            removedItem,
            layerId,
            layerRef,
            previousReceived,
            productRef,
            nextStockQty,
          });
        }

        const nextPurchaseItems: PurchaseSummaryItem[] = [];

        for (const context of preparedContexts) {
          const {
            item,
            productId,
            productRef,
            pendingNewProduct,
            nameKeyRef,
            layerId,
            previousReceived,
            soldQty,
          } = context;
          let currentStockQty = context.currentStockQty;

          if (pendingNewProduct) {
            transaction.set(productRef, toProductDocument(pendingNewProduct));
            if (!nameKeyRef) throw new Error('Gagal menyiapkan key produk baru.');
            transaction.set(nameKeyRef, {
              productId,
              name: pendingNewProduct.name,
              createdAt: serverTimestamp(),
            });

            if (pendingNewProduct.stockQty > 0) {
              const initialLayerRef = doc(collection(db, 'inventory_layers'));
              const initialMovementRef = doc(collection(db, 'stock_movements'));
              transaction.set(initialLayerRef, {
                productId,
                quantityReceived: pendingNewProduct.stockQty,
                quantityRemaining: pendingNewProduct.stockQty,
                unitCost: pendingNewProduct.costPrice,
                sellPriceSnapshot: pendingNewProduct.sellPrice,
                sourceType: 'initial_stock',
                sourceId: productId,
                receivedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              transaction.set(initialMovementRef, {
                productId,
                type: 'stock_in',
                quantityChange: pendingNewProduct.stockQty,
                unitCost: pendingNewProduct.costPrice,
                layerId: initialLayerRef.id,
                referenceId: productId,
                referenceType: 'initial_stock',
                performedBy: currentUser?.uid || 'unknown',
                performedAt: serverTimestamp(),
              });
            }
          }
          if (!item.isNew) {
            if (!layerId) throw new Error(`Layer FIFO PB untuk ${item.productNameSnapshot} tidak ditemukan.`);
            const layerRef = doc(db, 'inventory_layers', layerId);
            const quantityDiff = item.nextQuantity - previousReceived;
            const nextRemaining = item.nextQuantity - soldQty;

            transaction.update(layerRef, {
              quantityReceived: item.nextQuantity,
              quantityRemaining: nextRemaining,
              unitCost: item.unitCost,
              sellPriceSnapshot: item.sellPrice,
              updatedAt: serverTimestamp(),
            });

            if (quantityDiff !== 0) {
              const movementRef = doc(collection(db, 'stock_movements'));
              transaction.set(movementRef, {
                productId,
                type: 'adjustment',
                quantityChange: quantityDiff,
                unitCost: item.unitCost,
                layerId,
                referenceId: selectedPb.id,
                referenceType: 'purchase_order',
                performedBy: currentUser?.uid || 'unknown',
                performedAt: serverTimestamp(),
                note: `Penyesuaian kuantitas PB ${receiptCode}`,
                receiptCode,
                receiptDate,
                supplierName,
              });
            }

            const purchaseItemId = item.purchaseItemId || purchaseItemByProduct.get(productId);
            if (purchaseItemId) {
              const purchaseItemRef = doc(db, 'purchase_items', purchaseItemId);
              transaction.update(purchaseItemRef, {
                quantity: item.nextQuantity,
                unitCost: item.unitCost,
                sellPrice: item.sellPrice,
                subtotal: item.nextQuantity * item.unitCost,
                updatedAt: serverTimestamp(),
              });
            }

            transaction.update(productRef, {
              stockQty: currentStockQty + quantityDiff,
              costPrice: item.unitCost,
              sellPrice: item.sellPrice,
              updatedAt: serverTimestamp(),
            });
            currentStockQty += quantityDiff;
          }

          if (item.isNew) {
            const layerRef = doc(collection(db, 'inventory_layers'));
            const movementRef = doc(collection(db, 'stock_movements'));
            const purchaseItemRef = doc(collection(db, 'purchase_items'));

            transaction.set(layerRef, {
              productId,
              quantityReceived: item.nextQuantity,
              quantityRemaining: item.nextQuantity,
              unitCost: item.unitCost,
              sellPriceSnapshot: item.sellPrice,
              sourceType: 'purchase_receipt',
              sourceId: selectedPb.id,
              receivedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            transaction.set(movementRef, {
              productId,
              type: 'stock_in',
              quantityChange: item.nextQuantity,
              unitCost: item.unitCost,
              layerId: layerRef.id,
              referenceId: selectedPb.id,
              referenceType: 'purchase_order',
              performedBy: currentUser?.uid || 'unknown',
              performedAt: serverTimestamp(),
              note: `Tambah item baru ke PB ${receiptCode}`,
              receiptCode,
              receiptDate,
              supplierName,
            });

            transaction.set(purchaseItemRef, {
              purchaseId: selectedPb.id,
              productId,
              productNameSnapshot: formatProductName(item.productNameSnapshot),
              quantity: item.nextQuantity,
              unitCost: item.unitCost,
              sellPrice: item.sellPrice,
              subtotal: item.nextQuantity * item.unitCost,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            transaction.update(productRef, {
              stockQty: currentStockQty + item.nextQuantity,
              costPrice: item.unitCost,
              sellPrice: item.sellPrice,
              latestPbDate: receiptDate || serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            currentStockQty += item.nextQuantity;
          }

          nextPurchaseItems.push({
            productId,
            productNameSnapshot: formatProductName(item.productNameSnapshot),
            quantity: item.nextQuantity,
            unitCost: item.unitCost,
            sellPrice: item.sellPrice,
          });
        }

        for (const context of removedContexts) {
          const { removedItem, layerId, layerRef, previousReceived, productRef, nextStockQty } = context;
          if (nextStockQty !== null) {
            transaction.update(productRef, {
              stockQty: nextStockQty,
              updatedAt: serverTimestamp(),
            });
          }

          transaction.delete(layerRef);

          const purchaseItemId = removedItem.purchaseItemId || purchaseItemByProduct.get(removedItem.productId);
          if (purchaseItemId) {
            transaction.delete(doc(db, 'purchase_items', purchaseItemId));
          }

          const movementRef = doc(collection(db, 'stock_movements'));
          transaction.set(movementRef, {
            productId: removedItem.productId,
            type: 'adjustment',
            quantityChange: -previousReceived,
            unitCost: removedItem.unitCost,
            layerId,
            referenceId: selectedPb.id,
            referenceType: 'purchase_order',
            performedBy: currentUser?.uid || 'unknown',
            performedAt: serverTimestamp(),
            note: `Hapus item PB ${receiptCode}`,
            receiptCode,
            receiptDate,
            supplierName,
          });
        }

        const nextTotal = nextPurchaseItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);

        transaction.update(purchaseRef, {
          items: nextPurchaseItems.map((item) => ({
            ...item,
            subtotal: item.quantity * item.unitCost,
          })),
          totalAmount: nextTotal,
          updatedAt: serverTimestamp(),
        });
      });

      alert('Perubahan PB berhasil disimpan.');
      setPbPendingMissingItems([]);
      const refreshedList = await loadPbList();
      const refreshedSelected = refreshedList.find((item) => item.id === selectedPb.id) || selectedPb;
      await loadPbDetail(refreshedSelected);
    } catch (error) {
      console.error('Error saving PB adjustments:', error);
      const message = error instanceof Error ? error.message : 'Gagal menyimpan perubahan PB.';
      setPbFieldError(message);
    } finally {
      setIsPbSaving(false);
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
              <h2 className="ai-heading text-2xl font-bold text-slate-900">Kelola Permintaan Barang (PB)</h2>
            </div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={pbSearchQuery}
            onChange={(event) => setPbSearchQuery(event.target.value)}
            placeholder="Cari supplier atau kode struk..."
            className="ai-input w-full py-2.5 pl-11 pr-4 text-sm"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tanggal Dari</label>
            <input
              type="date"
              value={pbDateFrom}
              onChange={(event) => setPbDateFrom(event.target.value)}
              className="ai-input w-full px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tanggal Sampai</label>
            <input
              type="date"
              value={pbDateTo}
              onChange={(event) => setPbDateTo(event.target.value)}
              className="ai-input w-full px-3 py-2.5 text-sm"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowHiddenPb((prev) => !prev)}
          className="ai-button-ghost inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
        >
          {showHiddenPb ? 'Sembunyikan PB Sudah Habis' : `Tampilkan PB Sudah Habis (${formatNumber(hiddenPbCount)})`}
        </button>

        {isPbListLoading ? (
          <p className="text-sm text-slate-500">Memuat daftar PB...</p>
        ) : filteredPbList.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
            {showHiddenPb
              ? 'Belum ada PB yang cocok dengan pencarian.'
              : 'Belum ada PB yang cocok. PB yang sudah habis tersembunyi, gunakan tombol di atas untuk menampilkannya.'}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {paginatedPbList.map((purchase) => {
                const isActive = selectedPb?.id === purchase.id;
                const isFullySold = fullySoldPbIds.has(purchase.id);
                return (
                  <div key={purchase.id} className={`relative space-y-2 ${isActive ? 'z-30' : 'z-0'}`}>
                    <button
                      onClick={() => {
                        if (isActive) {
                          setSelectedPb(null);
                          setPbFieldError(null);
                          return;
                        }
                        void loadPbDetail(purchase);
                      }}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        isFullySold
                          ? (isActive ? 'border-amber-300 bg-amber-50/80' : 'border-amber-200 bg-amber-50/60 hover:border-amber-300')
                          : (isActive ? 'border-sky-300 bg-sky-50/60' : 'border-slate-200 bg-white hover:border-sky-200')
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">PB {purchase.receiptCode || purchase.id}</p>
                            {isFullySold && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                Habis
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{purchase.supplierName || '-'}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {purchase.receiptDate ? purchase.receiptDate.toLocaleDateString('id-ID') : '-'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-slate-700">Rp {formatNumber(purchase.totalAmount || 0)}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">{formatNumber(purchase.items.length)} Produk</p>
                        </div>
                      </div>
                    </button>

                    {isActive && (
                      <div className="relative z-20 mt-2">
                        <section className="ai-card pb-inline-reveal space-y-3 overflow-visible p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Detail PB</p>
                            <h3 className="text-base font-bold text-slate-900">PB {purchase.receiptCode || purchase.id}</h3>
                            <p className="text-xs text-slate-500">{purchase.supplierName || '-'}</p>
                          </div>
                          <p className="text-xs text-slate-500">
                            {purchase.receiptDate ? purchase.receiptDate.toLocaleDateString('id-ID') : '-'}
                          </p>
                        </div>

                        {isPbDetailLoading ? (
                          <p className="text-sm text-slate-500">Memuat item PB...</p>
                        ) : pbEditableItems.length === 0 ? (
                          <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                            PB ini belum memiliki item.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {pbEditableItems.map((item) => (
                              <div key={`${item.productId}-${item.purchaseItemId || 'new'}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-semibold text-slate-900">{formatProductName(item.productNameSnapshot)}</p>
                                      {userRole === 'owner' && (
                                        <button
                                          type="button"
                                          onClick={() => handleRemovePbItem(item)}
                                          className="ai-button-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-600"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          Hapus
                                        </button>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-500">Modal Rp {formatNumber(item.unitCost)} • Jual Rp {formatNumber(item.sellPrice)}</p>
                                    {!item.isNew && (
                                      <p className="text-xs text-slate-500">
                                        Sisa layer PB: {formatNumber(item.layerQuantityRemaining || 0)}
                                        {' • '}Terjual dari layer ini: {formatNumber(item.soldFromLayer || 0)}
                                      </p>
                                    )}
                                    {item.isNew && <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-600">Item baru</p>}
                                  </div>
                                  <div className="w-full max-w-sm">
                                    <div className="grid grid-cols-3 gap-2">
                                      <div>
                                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Jumlah</label>
                                        {userRole === 'owner' ? (
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={item.draftQuantity}
                                            onChange={(event) => {
                                              const { formatted } = handleFormattedInputChange(event.target.value);
                                              setPbEditableItems((prev) => prev.map((row) => (
                                                row.productId === item.productId
                                                  ? { ...row, draftQuantity: formatted }
                                                  : row
                                              )));
                                              setPbFieldError(null);
                                            }}
                                            className="ai-input w-full px-3 py-2 text-right text-sm font-semibold"
                                          />
                                        ) : (
                                          <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-800">
                                            {formatNumber(parseNumber(item.draftQuantity))}
                                          </p>
                                        )}
                                      </div>
                                      <div>
                                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Beli</label>
                                        {userRole === 'owner' ? (
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={item.draftUnitCost}
                                            onChange={(event) => {
                                              const { formatted } = handleFormattedInputChange(event.target.value);
                                              setPbEditableItems((prev) => prev.map((row) => (
                                                row.productId === item.productId
                                                  ? { ...row, draftUnitCost: formatted }
                                                  : row
                                              )));
                                              setPbFieldError(null);
                                            }}
                                            className="ai-input w-full px-3 py-2 text-right text-sm font-semibold"
                                          />
                                        ) : (
                                          <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-800">
                                            {formatNumber(parseNumber(item.draftUnitCost))}
                                          </p>
                                        )}
                                      </div>
                                      <div>
                                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Jual</label>
                                        {userRole === 'owner' ? (
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={item.draftSellPrice}
                                            onChange={(event) => {
                                              const { formatted } = handleFormattedInputChange(event.target.value);
                                              setPbEditableItems((prev) => prev.map((row) => (
                                                row.productId === item.productId
                                                  ? { ...row, draftSellPrice: formatted }
                                                  : row
                                              )));
                                              setPbFieldError(null);
                                            }}
                                            className="ai-input w-full px-3 py-2 text-right text-sm font-semibold"
                                          />
                                        ) : (
                                          <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-800">
                                            {formatNumber(parseNumber(item.draftSellPrice))}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {userRole === 'owner' && removedPbItems.length > 0 && (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Dihapus (Belum Disimpan)</p>
                            <div className="mt-2 space-y-2">
                              {removedPbItems.map((removedItem) => (
                                <div key={`removed-${removedItem.productId}`} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2">
                                  <p className="text-sm font-medium text-slate-900">
                                    {formatProductName(removedItem.productNameSnapshot)} • Qty {formatNumber(parseNumber(removedItem.draftQuantity))}
                                    {!removedItem.isNew ? ` • Sisa layer ${formatNumber(removedItem.layerQuantityRemaining || 0)}` : ''}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreRemovedPbItem(removedItem)}
                                    className="ai-button-ghost px-2 py-1 text-xs font-semibold text-sky-700"
                                  >
                                    Batal Hapus
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {userRole === 'owner' && (
                          <div className="rounded-2xl border border-dashed border-slate-300 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tambah Produk yang Terlewat</p>
                            {addProductMode === 'existing' ? (
                              <div className="relative z-30 mt-3">
                                <div className="mb-1 flex items-center justify-between gap-3">
                                  <label className="block text-sm font-medium text-slate-700">Nama Produk *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setPbAddProductQuery('');
                        setPbAddProductId(null);
                        setPbAddBuyPrice('');
                        setPbAddSellPrice('');
                        setPbFieldError(null);
                        setIsAddProductFocusOpen(false);
                      }}
                                    className="ai-button-ghost px-2 py-1 text-xs font-medium text-rose-600"
                                  >
                                    Hapus
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={pbAddProductQuery}
                                  onFocus={() => setIsAddProductFocusOpen(true)}
                                  onBlur={() => window.setTimeout(() => setIsAddProductFocusOpen(false), 120)}
                                  onChange={(event) => {
                                    setPbAddProductQuery(event.target.value.toLocaleUpperCase('id-ID'));
                                    setPbAddProductId(null);
                                    setPbFieldError(null);
                                  }}
                                  placeholder="Cari produk..."
                                  className="ai-input w-full px-4 py-3 text-sm"
                                />
                                {isAddProductFocusOpen && (
                                  <div className="absolute z-50 mt-2 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                                    {filteredAddProductSuggestions.map((product) => (
                                      <button
                                        key={product.id}
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => handleSelectAddProduct(product)}
                                        className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-sky-50"
                                      >
                                        <p className="font-medium text-slate-900">{formatProductName(product.name)}</p>
                                        <p className="text-xs text-slate-500">
                                          SKU: {product.sku || '-'} • Stok tersisa: {formatNumber(product.stockQty)}
                                        </p>
                                      </button>
                                    ))}
                                    {canShowAddNewOption && (
                                      <button
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => {
                                          setAddProductMode('new');
                                          setPbAddProductForm((prev) => ({ ...prev, name: formatProductName(pbAddProductQuery) }));
                                          setPbAddProductFormErrors({});
                                          setIsAddProductFocusOpen(false);
                                        }}
                                        className="w-full rounded-xl border border-dashed border-sky-300 bg-sky-50 px-3 py-2 text-left text-sm font-medium text-sky-700"
                                      >
                                        + Tambah produk baru "{formatProductName(pbAddProductQuery)}"
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-3">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <p className="text-sm font-semibold text-slate-900">Tambah Produk Baru</p>
                                  <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPbAddProductForm({ ...DEFAULT_PRODUCT_FORM });
                          setPbAddProductFormErrors({});
                          setPbAddQty('1');
                          setPbFieldError(null);
                        }}
                                      className="ai-button-ghost px-2 py-1 text-xs font-medium text-rose-600"
                                    >
                                      Hapus
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAddProductMode('existing');
                                        setPbAddProductFormErrors({});
                                      }}
                                      className="text-xs font-medium text-slate-600 hover:text-slate-800"
                                    >
                                      Gunakan Produk Existing
                                    </button>
                                  </div>
                                </div>
                                <ProductFormFields
                                  value={pbAddProductForm}
                                  errors={pbAddProductFormErrors}
                                  onChange={(next) => {
                                    setPbAddProductForm(next);
                                    setPbAddProductFormErrors({});
                                    setPbFieldError(null);
                                  }}
                                  idPrefix="pb-missing-product-inline"
                                />
                              </div>
              )}

              {addProductMode === 'existing' ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Jumlah PB *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={pbAddQty}
                      onChange={(event) => {
                        const { formatted } = handleFormattedInputChange(event.target.value);
                        setPbAddQty(formatted);
                        setPbFieldError(null);
                      }}
                      placeholder="Qty"
                      className="ai-input w-full px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Harga Beli *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={pbAddBuyPrice}
                      onChange={(event) => {
                        const { formatted } = handleFormattedInputChange(event.target.value);
                        setPbAddBuyPrice(formatted);
                        setPbFieldError(null);
                      }}
                      placeholder="0"
                      className="ai-input w-full px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Harga Jual *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={pbAddSellPrice}
                      onChange={(event) => {
                        const { formatted } = handleFormattedInputChange(event.target.value);
                        setPbAddSellPrice(formatted);
                        setPbFieldError(null);
                      }}
                      placeholder="0"
                      className="ai-input w-full px-3 py-2.5 text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Jumlah PB *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={pbAddQty}
                    onChange={(event) => {
                      const { formatted } = handleFormattedInputChange(event.target.value);
                      setPbAddQty(formatted);
                      setPbFieldError(null);
                    }}
                    placeholder="Qty"
                    className="ai-input w-full px-3 py-2.5 text-sm"
                  />
                </div>
              )}
                            <button
                              onClick={handleAddMissingPbProduct}
                              className="ai-button mt-2 inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold"
                            >
                              <PackagePlus className="h-4 w-4" />
                              Tambah ke Daftar Terlewat
                            </button>
                            {pbPendingMissingItems.length > 0 && (
                              <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                                    Daftar Produk Terlewat ({formatNumber(pbPendingMissingItems.length)})
                                  </p>
                                  <button
                                    type="button"
                                    onClick={handleApplyPendingMissingItems}
                                    className="ai-button px-3 py-1.5 text-[11px] font-semibold"
                                  >
                                    Masukkan ke PB
                                  </button>
                                </div>
                                <div className="mt-2 space-y-2">
                                  {pbPendingMissingItems.map((pendingItem) => (
                                    <div key={`pending-${pendingItem.productId}`} className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-white px-3 py-2">
                                      <p className="text-sm font-medium text-slate-900">
                                        {formatProductName(pendingItem.productNameSnapshot)}
                                        {' • '}Qty {formatNumber(parseNumber(pendingItem.draftQuantity))}
                                        {' • '}Modal Rp {formatNumber(pendingItem.unitCost)}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => handleRemovePendingMissingItem(pendingItem.productId)}
                                        className="ai-button-ghost px-2 py-1 text-xs font-semibold text-rose-600"
                                      >
                                        Hapus
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {pbFieldError && (
                          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{pbFieldError}</p>
                        )}

                        {userRole === 'owner' && (
                          <button
                            onClick={handleSavePbAdjustments}
                            disabled={isPbSaving || isPbDetailLoading || ((pbEditableItems.length + pbPendingMissingItems.length) === 0 && removedPbItems.length === 0)}
                            className="ai-button w-full px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isPbSaving ? 'MENYIMPAN PERUBAHAN...' : 'SIMPAN PERUBAHAN PB'}
                          </button>
                        )}
                        </section>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-2">
              <button
                onClick={() => setPbCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={pbCurrentPage === 1}
                className="ai-button-ghost px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <p className="text-xs font-semibold text-slate-600">
                Halaman {pbCurrentPage} / {pbTotalPages}
              </p>
              <button
                onClick={() => setPbCurrentPage((prev) => Math.min(pbTotalPages, prev + 1))}
                disabled={pbCurrentPage === pbTotalPages}
                className="ai-button-ghost px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
