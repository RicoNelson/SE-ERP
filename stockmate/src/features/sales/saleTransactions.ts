import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { FifoAllocation, InventoryLayer, Product } from '../../types';
import { formatProductName } from '../../utils/format';

export interface EditableSaleDraftItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface EditableSaleDraft {
  soldAt: Date;
  paymentMethod: string;
  items: EditableSaleDraftItem[];
}

export interface SaleHistoryItem {
  id: string;
  soldAt: Date;
  total: number;
  paymentMethod: string;
  items: Array<{
    productId: string;
    productNameSnapshot: string;
    quantity: number;
    unitPrice: number;
  }>;
}

interface PreparedSaleItem {
  productId: string;
  productRef: DocumentReference;
  productNameSnapshot: string;
  quantity: number;
  totalRevenue: number;
  avgCost: number;
  totalCost: number;
  fifoAllocations: FifoAllocation[];
  layerUpdates: Array<{
    ref: DocumentReference;
    quantityRemaining: number;
  }>;
  movementRef: DocumentReference;
}

const NEGATIVE_STOCK_LAYER_ID = 'negative_stock';

const getReceivedAtMillis = (value: unknown): number => {
  if (!value || typeof value !== 'object') return 0;
  const maybeTimestamp = value as { toDate?: () => Date };
  const date = maybeTimestamp.toDate?.();
  return date instanceof Date ? date.getTime() : 0;
};

const getSaleMovementDocs = async (db: Firestore, saleId: string) => {
  const movementQuery = query(
    collection(db, 'stock_movements'),
    where('referenceType', '==', 'sale'),
    where('referenceId', '==', saleId),
  );
  const snapshot = await getDocs(movementQuery);
  return snapshot.docs;
};

const buildPreparedSaleItems = async (db: Firestore, draft: EditableSaleDraft): Promise<PreparedSaleItem[]> => {
  const productIds = [...new Set(draft.items.map((item) => item.productId))];

  const layerRefsByProduct = new Map<string, DocumentReference[]>();
  await Promise.all(
    productIds.map(async (productId) => {
      const layersSnapshot = await getDocs(query(collection(db, 'inventory_layers'), where('productId', '==', productId)));
      const refs = [...layersSnapshot.docs]
        .sort((a, b) => getReceivedAtMillis(a.data().receivedAt) - getReceivedAtMillis(b.data().receivedAt))
        .map((layerDoc) => layerDoc.ref);
      layerRefsByProduct.set(productId, refs);
    }),
  );

  const preparedItems = await runTransaction(db, async (transaction) => {
    const prepared: PreparedSaleItem[] = [];

    for (const item of draft.items) {
      const productRef = doc(db, 'products', item.productId);
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists()) {
        throw new Error('Produk pada penjualan tidak ditemukan.');
      }

      const productData = productSnap.data() as Product;
      const candidateLayerRefs = layerRefsByProduct.get(item.productId) || [];
      let remainingToAllocate = item.quantity;
      let totalCost = 0;
      const allocations: FifoAllocation[] = [];
      const layerUpdates: Array<{ ref: DocumentReference; quantityRemaining: number }> = [];

      for (const layerRef of candidateLayerRefs) {
        if (remainingToAllocate <= 0) break;
        const layerSnap = await transaction.get(layerRef);
        if (!layerSnap.exists()) continue;

        const layerData = layerSnap.data() as InventoryLayer;
        const available = Number(layerData.quantityRemaining || 0);
        if (available <= 0) continue;

        const allocatedQty = Math.min(available, remainingToAllocate);
        const unitCost = Number(layerData.unitCost || 0);

        layerUpdates.push({
          ref: layerRef,
          quantityRemaining: available - allocatedQty,
        });
        allocations.push({
          layerId: layerSnap.id,
          quantity: allocatedQty,
          unitCost,
          unitSellPrice: item.unitPrice,
        });

        totalCost += allocatedQty * unitCost;
        remainingToAllocate -= allocatedQty;
      }

      if (remainingToAllocate > 0) {
        const fallbackUnitCost = Number(productData.costPrice || 0);
        allocations.push({
          layerId: NEGATIVE_STOCK_LAYER_ID,
          quantity: remainingToAllocate,
          unitCost: fallbackUnitCost,
          unitSellPrice: item.unitPrice,
        });
        totalCost += remainingToAllocate * fallbackUnitCost;
      }

      prepared.push({
        productId: item.productId,
        productRef,
        productNameSnapshot: formatProductName(productData.name),
        quantity: item.quantity,
        totalRevenue: item.quantity * item.unitPrice,
        avgCost: item.quantity > 0 ? totalCost / item.quantity : 0,
        totalCost,
        fifoAllocations: allocations,
        layerUpdates,
        movementRef: doc(collection(db, 'stock_movements')),
      });
    }

    return prepared;
  });

  return preparedItems;
};

const restoreSaleInTransaction = async (
  transaction: Parameters<typeof runTransaction>[1] extends (transaction: infer T) => unknown ? T : never,
  db: Firestore,
  movementDocs: QueryDocumentSnapshot[],
) => {
  const productRestores = new Map<string, number>();

  for (const movementDoc of movementDocs) {
    const movementData = movementDoc.data() as {
      productId?: string;
      quantityChange?: number;
      fifoAllocations?: FifoAllocation[];
    };

    const productId = String(movementData.productId || '');
    const quantityChange = Number(movementData.quantityChange || 0);
    if (productId) {
      productRestores.set(productId, (productRestores.get(productId) || 0) - quantityChange);
    }

    const allocations = Array.isArray(movementData.fifoAllocations) ? movementData.fifoAllocations : [];
    for (const allocation of allocations) {
      if (!allocation.layerId || allocation.layerId === NEGATIVE_STOCK_LAYER_ID) continue;
      const layerRef = doc(db, 'inventory_layers', allocation.layerId);
      const layerSnap = await transaction.get(layerRef);
      if (!layerSnap.exists()) continue;
      const currentRemaining = Number(layerSnap.data().quantityRemaining || 0);
      transaction.update(layerRef, {
        quantityRemaining: currentRemaining + Number(allocation.quantity || 0),
        updatedAt: serverTimestamp(),
      });
    }

    transaction.delete(movementDoc.ref);
  }

  for (const [productId, quantity] of productRestores.entries()) {
    const productRef = doc(db, 'products', productId);
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists()) continue;
    const currentStock = Number(productSnap.data().stockQty || 0);
    transaction.update(productRef, {
      stockQty: currentStock + quantity,
      updatedAt: serverTimestamp(),
    });
  }
};

const applySaleInTransaction = async (
  transaction: Parameters<typeof runTransaction>[1] extends (transaction: infer T) => unknown ? T : never,
  saleRef: DocumentReference,
  preparedItems: PreparedSaleItem[],
  draft: EditableSaleDraft,
  currentUserUid: string,
) => {
  const soldAtTimestamp = Timestamp.fromDate(draft.soldAt);
  let total = 0;

  for (const prepared of preparedItems) {
    for (const layerUpdate of prepared.layerUpdates) {
      transaction.update(layerUpdate.ref, {
        quantityRemaining: layerUpdate.quantityRemaining,
        updatedAt: serverTimestamp(),
      });
    }

    const productSnap = await transaction.get(prepared.productRef);
    if (!productSnap.exists()) {
      throw new Error('Produk tidak ditemukan saat menyimpan penjualan.');
    }

    const currentStock = Number(productSnap.data().stockQty || 0);
    transaction.update(prepared.productRef, {
      stockQty: currentStock - prepared.quantity,
      updatedAt: serverTimestamp(),
    });

    transaction.set(prepared.movementRef, {
      productId: prepared.productId,
      type: 'sale',
      quantityChange: -prepared.quantity,
      referenceId: saleRef.id,
      referenceType: 'sale',
      performedBy: currentUserUid,
      performedAt: soldAtTimestamp,
      fifoAllocations: prepared.fifoAllocations,
      totalCost: prepared.totalCost,
      totalRevenue: prepared.totalRevenue,
      unitCost: prepared.avgCost,
    });

    total += prepared.totalRevenue;
  }

  transaction.set(
    saleRef,
    {
      items: preparedItems.map((prepared) => ({
        productId: prepared.productId,
        productNameSnapshot: prepared.productNameSnapshot,
        quantity: prepared.quantity,
        unitPrice: prepared.totalRevenue / prepared.quantity,
        originalPrice: prepared.totalRevenue / prepared.quantity,
        costPrice: prepared.avgCost,
        totalCost: prepared.totalCost,
        fifoAllocations: prepared.fifoAllocations,
      })),
      total,
      paymentMethod: draft.paymentMethod,
      soldBy: currentUserUid,
      soldAt: soldAtTimestamp,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const createSale = async (db: Firestore, draft: EditableSaleDraft, currentUserUid: string) => {
  const saleRef = doc(collection(db, 'sales'));
  const preparedItems = await buildPreparedSaleItems(db, draft);

  await runTransaction(db, async (transaction) => {
    await applySaleInTransaction(transaction, saleRef, preparedItems, draft, currentUserUid);
  });
};

export const replaceSale = async (db: Firestore, saleId: string, draft: EditableSaleDraft, currentUserUid: string) => {
  const saleRef = doc(db, 'sales', saleId);
  const saleSnap = await getDoc(saleRef);
  if (!saleSnap.exists()) {
    throw new Error('Penjualan tidak ditemukan.');
  }

  const movementDocs = await getSaleMovementDocs(db, saleId);
  const preparedItems = await buildPreparedSaleItems(db, draft);

  await runTransaction(db, async (transaction) => {
    await restoreSaleInTransaction(transaction, db, movementDocs);
    await applySaleInTransaction(transaction, saleRef, preparedItems, draft, currentUserUid);
  });
};

export const deleteSale = async (db: Firestore, saleId: string) => {
  const saleRef = doc(db, 'sales', saleId);
  const saleSnap = await getDoc(saleRef);
  if (!saleSnap.exists()) {
    throw new Error('Penjualan tidak ditemukan.');
  }

  const movementDocs = await getSaleMovementDocs(db, saleId);

  await runTransaction(db, async (transaction) => {
    await restoreSaleInTransaction(transaction, db, movementDocs);
    transaction.delete(saleRef);
  });
};

export const mapSaleHistoryItem = (saleDoc: QueryDocumentSnapshot): SaleHistoryItem => {
  const data = saleDoc.data() as {
    total?: number;
    paymentMethod?: string;
    soldAt?: { toDate?: () => Date };
    items?: Array<{
      productId?: string;
      productNameSnapshot?: string;
      quantity?: number;
      unitPrice?: number;
    }>;
  };

  return {
    id: saleDoc.id,
    soldAt: data.soldAt?.toDate?.() || new Date(),
    total: Number(data.total || 0),
    paymentMethod: String(data.paymentMethod || 'Tidak diketahui'),
    items: Array.isArray(data.items)
      ? data.items.map((item) => ({
        productId: String(item.productId || ''),
        productNameSnapshot: formatProductName(item.productNameSnapshot || ''),
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
      }))
      : [],
  };
};
