import { useState } from 'react';
import { Search, Trash2, Edit3, ChevronDown, ShoppingBag, CreditCard } from 'lucide-react';
import { doc, writeBatch, serverTimestamp, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Product } from '../types';
import { formatNumber, handleFormattedInputChange, parseNumber } from '../utils/format';
import ProductSearchModal from '../components/ProductSearchModal';

interface CartItem extends Product {
  cartQuantity: string; // Keep as string for the text input handling
  cartPrice: string; // Allow editing sell price
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
  const { currentUser } = useAuth();

  // Calculate total
  const total = cart.reduce((sum, item) => {
    return sum + (parseNumber(item.cartPrice) * parseNumber(item.cartQuantity));
  }, 0);

  const handleQuantityChange = (id: string, value: string) => {
    const { formatted } = handleFormattedInputChange(value);
    
    setCart(cart.map(item => 
      item.id === id ? { ...item, cartQuantity: formatted } : item
    ));
  };

  const handlePriceChange = (id: string, value: string) => {
    const { formatted } = handleFormattedInputChange(value);
    
    setCart(cart.map(item => 
      item.id === id ? { ...item, cartPrice: formatted } : item
    ));
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const handleAddProduct = (product: Product) => {
    // Check if already in cart
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      // If already in cart, increment by 1
      const currentQty = parseNumber(existing.cartQuantity);
      handleQuantityChange(product.id!, (currentQty + 1).toString());
    } else {
      // Add new to cart
      setCart([...cart, { ...product, cartQuantity: '1', cartPrice: formatNumber(product.sellPrice) }]);
    }
    setIsSearchOpen(false);
  };

  const handleConfirmSale = async () => {
    if (cart.length === 0 || isProcessing) return;
    
    setIsProcessing(true);

    try {
      const batch = writeBatch(db);
      
      // 1. Create the sale record
      const saleRef = doc(collection(db, 'sales'));
      const saleItems = cart.map(item => ({
        productId: item.id!,
        productNameSnapshot: item.name,
        quantity: parseNumber(item.cartQuantity),
        unitPrice: parseNumber(item.cartPrice),
        originalPrice: item.sellPrice,
        costPrice: item.costPrice || 0
      }));

      batch.set(saleRef, {
        items: saleItems,
        total: total,
        paymentMethod: paymentMethod,
        soldBy: currentUser?.uid || 'unknown',
        soldAt: serverTimestamp()
      });

      // 2. Update stock quantities for each product
      cart.forEach(item => {
        const productRef = doc(db, 'products', item.id!);
        const newStockQty = item.stockQty - parseNumber(item.cartQuantity);
        
        batch.update(productRef, {
          stockQty: newStockQty,
          updatedAt: serverTimestamp()
        });

        // 3. Create stock movement record
        const movementRef = doc(collection(db, 'stock_movements'));
        batch.set(movementRef, {
          productId: item.id!,
          type: 'sale',
          quantityChange: -parseNumber(item.cartQuantity),
          referenceId: saleRef.id,
          referenceType: 'sale',
          performedBy: currentUser?.uid || 'unknown',
          performedAt: serverTimestamp()
        });
      });

      // Execute all writes as a single atomic transaction
      await batch.commit();
      
      // Clear cart on success
      setCart([]);
      alert('Penjualan berhasil dicatat dan stok telah dikurangi!');

    } catch (error) {
      console.error("Error completing sale:", error);
      alert('Gagal memproses penjualan. Silakan coba lagi.');
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
              Tambah produk, atur jumlah, lalu konfirmasi pembayaran tanpa gangguan visual.
            </p>
            <button
              onClick={() => setIsSearchOpen(true)}
              className="ai-input mt-6 inline-flex w-full items-center gap-3 px-4 text-left text-slate-600 hover:border-indigo-300 hover:text-slate-900"
            >
              <div className="ai-stat-orb h-11 w-11">
                <Search className="h-5 w-5 text-sky-700" />
              </div>
              <span className="flex-1 font-medium">Cari nama produk atau SKU</span>
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
                  className="ai-card ai-card-hover stagger-fade-in p-4"
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex-1 pr-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                          Produk aktif
                        </span>
                        <span className="text-xs text-slate-500">Stok {formatNumber(item.stockQty)}</span>
                      </div>
                      <h3 className="mb-1 font-semibold leading-tight text-slate-900">{item.name}</h3>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-500">Rp</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="ai-input flex-1 px-3 py-2 text-sm font-semibold text-slate-900"
                          value={item.cartPrice}
                          onChange={(e) => handlePriceChange(item.id!, e.target.value)}
                        />
                        <Edit3 className="h-4 w-4 text-slate-500" />
                      </div>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.id!)}
                      className="ai-button-ghost p-2.5 text-rose-500 hover:text-rose-600"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                  
                  <div className="ai-panel-muted flex items-center justify-between p-3">
                    <label className="text-sm font-medium text-slate-700">
                      Jumlah Terjual
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="ai-input w-24 px-3 py-2 text-center text-lg font-bold"
                      value={item.cartQuantity}
                      onChange={(e) => handleQuantityChange(item.id!, e.target.value)}
                    />
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
          <div className="glass-panel-strong mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-lg px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total Tagihan</p>
              <p className="ai-heading text-[1.75rem] font-bold leading-none text-slate-900">Rp {formatNumber(total)}</p>
            </div>
            <button
              onClick={handleConfirmSale}
              disabled={cart.length === 0 || total === 0 || isProcessing}
              className="ai-button min-w-[160px] px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-900/60 border-t-transparent"></span>
                  MEMPROSES...
                </span>
              ) : (
                'KONFIRMASI PENJUALAN'
              )}
            </button>
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
