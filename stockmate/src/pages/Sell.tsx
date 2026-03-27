import { useState } from 'react';
import { Search, Trash2, Edit3, ChevronDown, ShoppingBag, CreditCard } from 'lucide-react';
import { doc, serverTimestamp, collection, runTransaction, query, where, getDocs, type DocumentReference } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Product, InventoryLayer, FifoAllocation } from '../types';
import { formatNumber, formatProductName, handleFormattedInputChange, parseNumber } from '../utils/format';
import ProductSearchModal from '../components/ProductSearchModal';

interface CartItem extends Product {
  cartQuantity: string; // Keep as string for the text input handling
  cartPrice: string; // Allow editing sell price
}

interface SaleRowErrors {
  cartQuantity?: string;
  cartPrice?: string;
}

const PAYMENT_METHODS = [
  'QRIS',
  'ShopeePay Later',
  'Kredivo',
  'Transfer Bank - BCA',
  'Transfer Bank - BRI',
  'Transfer Bank - Mandiri',
  'Tunai'
];

export default function Sell() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('QRIS');
  const [saleFormError, setSaleFormError] = useState('');
  const [saleRowErrors, setSaleRowErrors] = useState<Record<string, SaleRowErrors>>({});
  const { currentUser } = useAuth();

  // Calculate total
  const total = cart.reduce((sum, item) => {
    return sum + (parseNumber(item.cartPrice) * parseNumber(item.cartQuantity));
  }, 0);

  const handleQuantityChange = (id: string, value: string) => {
    const { formatted } = handleFormattedInputChange(value);
    setSaleFormError('');
    setSaleRowErrors((prev) => {
      if (!prev[id]?.cartQuantity) return prev;
      return { ...prev, [id]: { ...prev[id], cartQuantity: undefined } };
    });
    
    setCart(cart.map(item => 
      item.id === id ? { ...item, cartQuantity: formatted } : item
    ));
  };

  const handlePriceChange = (id: string, value: string) => {
    const { formatted } = handleFormattedInputChange(value);
    setSaleFormError('');
    setSaleRowErrors((prev) => {
      if (!prev[id]?.cartPrice) return prev;
      return { ...prev, [id]: { ...prev[id], cartPrice: undefined } };
    });
    setCart(cart.map((item) =>
      item.id === id ? { ...item, cartPrice: formatted } : item,
    ));
  };

  const getOldestLayerSellPrice = async (productId: string, fallbackSellPrice: number): Promise<number> => {
    try {
      const layersQuery = query(
        collection(db, 'inventory_layers'),
        where('productId', '==', productId),
      );
      const layersSnapshot = await getDocs(layersQuery);

      const oldestAvailable = layersSnapshot.docs
        .map((layerDoc) => layerDoc.data() as InventoryLayer)
        .filter((layer) => (layer.quantityRemaining || 0) > 0)
        .sort((a, b) => {
          const aTime = 'toDate' in (a.receivedAt as object)
            ? (a.receivedAt as { toDate: () => Date }).toDate().getTime()
            : new Date(a.receivedAt as unknown as string).getTime();
          const bTime = 'toDate' in (b.receivedAt as object)
            ? (b.receivedAt as { toDate: () => Date }).toDate().getTime()
            : new Date(b.receivedAt as unknown as string).getTime();
          return aTime - bTime;
        })[0];

      return oldestAvailable?.sellPriceSnapshot ?? fallbackSellPrice;
    } catch (error) {
      console.error('Error reading oldest FIFO layer sell price:', error);
      return fallbackSellPrice;
    }
  };

  const removeFromCart = (id: string) => {
    setSaleFormError('');
    setSaleRowErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setCart(cart.filter(item => item.id !== id));
  };

  const handleAddProduct = async (product: Product) => {
    setSaleFormError('');
    setSaleRowErrors((prev) => {
      if (!product.id || !prev[product.id]) return prev;
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
    // Check if already in cart
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      // If already in cart, increment by 1
      const currentQty = parseNumber(existing.cartQuantity);
      handleQuantityChange(product.id!, (currentQty + 1).toString());
    } else {
      const defaultSellPrice = await getOldestLayerSellPrice(product.id!, product.sellPrice);
      // Add new to cart
      setCart([
        ...cart,
        { ...product, name: formatProductName(product.name), cartQuantity: '1', cartPrice: formatNumber(defaultSellPrice) },
      ]);
    }
    setIsSearchOpen(false);
  };

  const handleConfirmSale = async () => {
    if (cart.length === 0 || isProcessing) return;
    setSaleFormError('');
    setSaleRowErrors({});

    const cartWithParsedQty = cart.map((item) => ({
      ...item,
      parsedQuantity: parseNumber(item.cartQuantity),
      parsedUnitPrice: parseNumber(item.cartPrice),
    }));

    const nextRowErrors: Record<string, SaleRowErrors> = {};
    cartWithParsedQty.forEach((item) => {
      const rowError: SaleRowErrors = {};
      if (!item.cartQuantity.trim()) rowError.cartQuantity = 'Jumlah terjual wajib diisi.';
      else if (item.parsedQuantity <= 0) rowError.cartQuantity = 'Jumlah terjual harus lebih dari 0.';
      if (!item.cartPrice.trim()) rowError.cartPrice = 'Harga jual wajib diisi.';
      else if (item.parsedUnitPrice <= 0) rowError.cartPrice = 'Harga jual harus lebih dari 0.';
      if (Object.keys(rowError).length > 0) {
        nextRowErrors[item.id!] = rowError;
      }
    });
    if (Object.keys(nextRowErrors).length > 0) {
      setSaleRowErrors(nextRowErrors);
      setSaleFormError('Lengkapi semua field wajib yang ditandai merah.');
      return;
    }

    setIsProcessing(true);

    try {
      const layerRefsByProduct = new Map<string, DocumentReference[]>();
      for (const item of cartWithParsedQty) {
        const productId = item.id!;
        const layersQuery = query(
          collection(db, 'inventory_layers'),
          where('productId', '==', productId),
        );
        const layersSnapshot = await getDocs(layersQuery);
        const sortedLayerRefs = [...layersSnapshot.docs]
          .sort((a, b) => {
            const aDate = (a.data().receivedAt?.toDate?.() as Date | undefined)?.getTime() || 0;
            const bDate = (b.data().receivedAt?.toDate?.() as Date | undefined)?.getTime() || 0;
            return aDate - bDate;
          })
          .map((docItem) => docItem.ref);
        layerRefsByProduct.set(productId, sortedLayerRefs);
      }

      await runTransaction(db, async (transaction) => {
        const saleRef = doc(collection(db, 'sales'));
        const preparedSales: Array<{
          productId: string;
          productRef: DocumentReference;
          currentStock: number;
          quantityToSell: number;
          movementRef: DocumentReference;
          totalRevenue: number;
          avgCost: number;
          totalCost: number;
          fifoAllocations: FifoAllocation[];
          layerUpdates: Array<{
            ref: DocumentReference;
            quantityRemaining: number;
          }>;
          saleItem: {
            productId: string;
            productNameSnapshot: string;
            quantity: number;
            unitPrice: number;
            originalPrice: number;
            costPrice: number;
            totalCost: number;
            fifoAllocations: FifoAllocation[];
          };
        }> = [];

        for (const item of cartWithParsedQty) {
          const productId = item.id!;
          const quantityToSell = item.parsedQuantity;
          const productRef = doc(db, 'products', productId);
          const productSnap = await transaction.get(productRef);

          if (!productSnap.exists()) {
            throw new Error(`Produk ${formatProductName(item.name)} tidak ditemukan.`);
          }

          const productData = productSnap.data() as Product;
          const currentStock = productData.stockQty || 0;
          const candidateLayerRefs = layerRefsByProduct.get(productId) || [];

          let remainingToAllocate = quantityToSell;
          let totalCost = 0;
          const allocations: FifoAllocation[] = [];
          const layerUpdates: Array<{
            ref: DocumentReference;
            quantityRemaining: number;
          }> = [];

          for (const layerRef of candidateLayerRefs) {
            if (remainingToAllocate <= 0) break;
            const layerSnap = await transaction.get(layerRef);
            if (!layerSnap.exists()) continue;
            const layerData = layerSnap.data() as InventoryLayer;
            const available = layerData.quantityRemaining || 0;

            if (available <= 0) continue;

            const allocatedQty = Math.min(available, remainingToAllocate);
            const newRemaining = available - allocatedQty;
            const unitCost = layerData.unitCost || 0;

            layerUpdates.push({
              ref: layerRef,
              quantityRemaining: newRemaining,
            });

            allocations.push({
              layerId: layerSnap.id,
              quantity: allocatedQty,
              unitCost,
              unitSellPrice: item.parsedUnitPrice,
            });

            totalCost += allocatedQty * unitCost;
            remainingToAllocate -= allocatedQty;
          }

          if (remainingToAllocate > 0) {
            const fallbackUnitCost = productData.costPrice || 0;
            allocations.push({
              layerId: 'negative_stock',
              quantity: remainingToAllocate,
              unitCost: fallbackUnitCost,
              unitSellPrice: item.parsedUnitPrice,
            });
            totalCost += remainingToAllocate * fallbackUnitCost;
          }

          const totalRevenue = quantityToSell * item.parsedUnitPrice;
          const avgCost = quantityToSell > 0 ? totalCost / quantityToSell : 0;
          const movementRef = doc(collection(db, 'stock_movements'));

          preparedSales.push({
            productId,
            productRef,
            currentStock,
            quantityToSell,
            movementRef,
            totalRevenue,
            avgCost,
            totalCost,
            fifoAllocations: allocations,
            layerUpdates,
            saleItem: {
              productId,
              productNameSnapshot: formatProductName(item.name),
              quantity: quantityToSell,
              unitPrice: item.parsedUnitPrice,
              originalPrice: item.parsedUnitPrice,
              costPrice: avgCost,
              totalCost,
              fifoAllocations: allocations,
            },
          });
        }

        let computedSaleTotal = 0;
        const saleItems: Array<{
          productId: string;
          productNameSnapshot: string;
          quantity: number;
          unitPrice: number;
          originalPrice: number;
          costPrice: number;
          totalCost: number;
          fifoAllocations: FifoAllocation[];
        }> = [];

        for (const prepared of preparedSales) {
          for (const layerUpdate of prepared.layerUpdates) {
            transaction.update(layerUpdate.ref, {
              quantityRemaining: layerUpdate.quantityRemaining,
              updatedAt: serverTimestamp(),
            });
          }

          transaction.update(prepared.productRef, {
            stockQty: prepared.currentStock - prepared.quantityToSell,
            updatedAt: serverTimestamp(),
          });

          transaction.set(prepared.movementRef, {
            productId: prepared.productId,
            type: 'sale',
            quantityChange: -prepared.quantityToSell,
            referenceId: saleRef.id,
            referenceType: 'sale',
            performedBy: currentUser?.uid || 'unknown',
            performedAt: serverTimestamp(),
            fifoAllocations: prepared.fifoAllocations,
            totalCost: prepared.totalCost,
            totalRevenue: prepared.totalRevenue,
            unitCost: prepared.avgCost,
          });

          computedSaleTotal += prepared.totalRevenue;
          saleItems.push(prepared.saleItem);
        }

        transaction.set(saleRef, {
          items: saleItems,
          total: computedSaleTotal,
          paymentMethod: paymentMethod,
          soldBy: currentUser?.uid || 'unknown',
          soldAt: serverTimestamp()
        });
      });

      setCart([]);
      setSaleFormError('');
      setSaleRowErrors({});
      alert('Penjualan berhasil dicatat dengan metode FIFO dan stok telah dikurangi.');

    } catch (error) {
      console.error("Error completing sale:", error);
      const message = error instanceof Error ? error.message : 'Gagal memproses penjualan. Silakan coba lagi.';
      alert(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div className="ai-page page-enter pb-[12rem]">
        <div className="ai-page-grid">
          <section className="ai-card ai-page-hero stagger-fade-in">
            <div className="ai-section-title">
              <div>
                <p className="ai-kicker mb-2">Transaksi</p>
                <h2 className="ai-heading text-2xl font-bold text-slate-900">Penjualan Saat Ini</h2>
              </div>
            </div>
            <p className="max-w-lg text-sm leading-6 text-slate-600">
              Tambah produk, atur jumlah, lalu konfirmasi pembayaran.
            </p>
            <button
              onClick={() => setIsSearchOpen(true)}
              className="group mt-6 inline-flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition-all hover:border-indigo-300 hover:bg-white"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-sky-100 bg-sky-100/70 text-sky-700 transition-colors group-hover:bg-sky-100">
                <Search className="h-5 w-5" />
              </span>
              <span className="flex-1 text-base font-medium text-slate-700">Cari nama produk atau SKU</span>
            </button>
          </section>
        </div>

        <section className="mt-4">
          <div className="ai-section-title">
            <div className="flex items-center gap-3">
              <div className="ai-stat-orb h-11 w-11 rounded-2xl">
                <ShoppingBag className="h-5 w-5 text-sky-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Keranjang Penjualan</h3>
                <p className="text-sm text-slate-500">{cart.length} item aktif</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {cart.length === 0 ? (
              <div className="ai-empty-state stagger-fade-in">
                <div className="ai-stat-orb mx-auto mb-4 h-16 w-16">
                  <Search className="h-8 w-8 text-sky-700" />
                </div>
                <p className="font-medium text-slate-900">Belum ada produk.</p>
                <p className="mt-1 text-sm text-slate-500">Silakan cari produk di atas untuk memulai transaksi.</p>
              </div>
            ) : (
              cart.map((item, index) => (
                <div
                  key={item.id}
                  className="ai-card ai-card-hover stagger-fade-in overflow-hidden p-4"
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">
                          Produk Aktif
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                          Stok {formatNumber(item.stockQty)}
                        </span>
                      </div>
                      <h3 className="truncate text-lg font-bold leading-tight text-slate-900">{formatProductName(item.name)}</h3>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.id!)}
                      className="ai-button-ghost shrink-0 rounded-xl p-2.5 text-rose-500 hover:text-rose-600"
                      aria-label={`Hapus ${formatProductName(item.name)}`}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Harga Jual (Invoice Ini)
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-2 text-sm font-semibold text-slate-600">Rp</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className={`ai-input flex-1 px-3 py-2.5 text-base font-semibold text-slate-900 transition-colors duration-200 ${saleRowErrors[item.id!]?.cartPrice ? 'ai-input-error' : ''}`}
                          value={item.cartPrice}
                          onChange={(e) => handlePriceChange(item.id!, e.target.value)}
                          aria-invalid={Boolean(saleRowErrors[item.id!]?.cartPrice)}
                          aria-describedby={saleRowErrors[item.id!]?.cartPrice ? `sell-price-error-${item.id}` : undefined}
                        />
                        <Edit3 className="h-4 w-4 text-slate-500" />
                      </div>
                      {saleRowErrors[item.id!]?.cartPrice && (
                        <p id={`sell-price-error-${item.id}`} className="ai-field-error mt-1 text-xs">
                          {saleRowErrors[item.id!]?.cartPrice}
                        </p>
                      )}
                    </div>

                    <div className="ai-panel-muted flex items-center justify-between rounded-2xl p-3">
                      <label className="text-sm font-semibold text-slate-700">
                        Jumlah Terjual
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={`ai-input w-28 px-3 py-2.5 text-center text-lg font-bold transition-colors duration-200 ${saleRowErrors[item.id!]?.cartQuantity ? 'ai-input-error' : ''}`}
                        value={item.cartQuantity}
                        onChange={(e) => handleQuantityChange(item.id!, e.target.value)}
                        aria-invalid={Boolean(saleRowErrors[item.id!]?.cartQuantity)}
                        aria-describedby={saleRowErrors[item.id!]?.cartQuantity ? `sell-qty-error-${item.id}` : undefined}
                      />
                    </div>
                    {saleRowErrors[item.id!]?.cartQuantity && (
                      <p id={`sell-qty-error-${item.id}`} className="ai-field-error text-xs">
                        {saleRowErrors[item.id!]?.cartQuantity}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-5">
          <div className="ai-card p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="ai-stat-orb h-11 w-11">
                <CreditCard className="h-5 w-5 text-sky-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pembayaran</p>
                <p className="text-sm text-slate-600">Pilih metode pembayaran transaksi ini</p>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Metode Pembayaran</label>
              <div className="relative">
                <select 
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="ai-select w-full appearance-none py-3 pl-4 pr-10 font-medium"
                >
                  {PAYMENT_METHODS.map(method => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                  <ChevronDown className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="fixed bottom-[98px] left-0 right-0 z-10 px-4">
          <div className="glass-panel-strong mx-auto max-w-6xl rounded-lg border-slate-200 bg-white px-3 py-2.5">
            {saleFormError && (
              <p className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                {saleFormError}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="ai-heading text-[1.9rem] font-bold leading-none text-slate-900">Rp {formatNumber(total)}</p>
                <p className="mt-1 text-sm font-medium text-slate-500">Total Tagihan</p>
              </div>
              <button
                onClick={handleConfirmSale}
                disabled={cart.length === 0 || total === 0 || isProcessing}
                className="ai-button min-w-[160px] rounded-lg border border-emerald-600 bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent"></span>
                    MEMPROSES...
                  </span>
                ) : (
                  'KONFIRMASI PENJUALAN'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ProductSearchModal 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)}
        onAddProduct={handleAddProduct}
      />
    </>
  );
}
