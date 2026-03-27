import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, doc, serverTimestamp, runTransaction, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Search, Plus, Edit2, X, Boxes, AlertTriangle, Sparkles, ChevronDown, ArrowUpDown, PackagePlus } from 'lucide-react';
import type { Product } from '../types';
import { formatNumber, formatProductName, handleFormattedInputChange, normalizeSearchQuery, parseNumber } from '../utils/format';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface ProductMovement {
  id: string;
  type: string;
  quantityChange: number;
  referenceId?: string;
  referenceType?: string;
  receiptCode?: string;
  supplierName?: string;
  note?: string;
  performedAt?: Date | null;
}

interface ProductFifoLayer {
  id: string;
  quantityReceived?: number;
  quantityRemaining: number;
  unitCost: number;
  sellPriceSnapshot: number;
  sourceType: string;
  receivedAt?: Date | null;
}

export default function Stock() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'sellPrice' | 'stockQty'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const { userProfile, currentUser } = useAuth();
  const navigate = useNavigate();
  
  const userRole = userProfile?.role || 'staff';
  
  // Stock Opname state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [opnameQty, setOpnameQty] = useState('');
  const [opnameLayers, setOpnameLayers] = useState<ProductFifoLayer[]>([]);
  const [selectedOpnameLayerId, setSelectedOpnameLayerId] = useState('');
  const [isOpnameLayersLoading, setIsOpnameLayersLoading] = useState(false);
  const [isOpnameProcessing, setIsOpnameProcessing] = useState(false);
  const [selectedProductDetail, setSelectedProductDetail] = useState<Product | null>(null);
  const [recentMovements, setRecentMovements] = useState<ProductMovement[]>([]);
  const [fifoLayers, setFifoLayers] = useState<ProductFifoLayer[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const normalizedSearchQuery = normalizeSearchQuery(searchQuery);

  useEffect(() => {
    if (!editingProduct?.id) {
      setOpnameLayers([]);
      setSelectedOpnameLayerId('');
      setIsOpnameLayersLoading(false);
      return;
    }

    let cancelled = false;
    setIsOpnameLayersLoading(true);

    (async () => {
      try {
        const fifoQuery = query(
          collection(db, 'inventory_layers'),
          where('productId', '==', editingProduct.id),
          limit(120),
        );
        const fifoSnap = await getDocs(fifoQuery);
        if (cancelled) return;

        const layers: ProductFifoLayer[] = fifoSnap.docs
          .map((item) => {
            const data = item.data();
            return {
              id: item.id,
              quantityReceived: data.quantityReceived || 0,
              quantityRemaining: data.quantityRemaining || 0,
              unitCost: data.unitCost || editingProduct.costPrice || 0,
              sellPriceSnapshot: data.sellPriceSnapshot || editingProduct.sellPrice || 0,
              sourceType: data.sourceType || 'purchase_receipt',
              receivedAt: data.receivedAt?.toDate?.() || null,
            };
          })
          .sort((a, b) => {
            const aTime = a.receivedAt ? a.receivedAt.getTime() : 0;
            const bTime = b.receivedAt ? b.receivedAt.getTime() : 0;
            return aTime - bTime;
          });

        setOpnameLayers(layers);
        const oldestActiveLayer = layers.find((item) => item.quantityRemaining > 0);
        setSelectedOpnameLayerId(oldestActiveLayer?.id || '');
      } catch (error) {
        console.error('Error loading opname FIFO layers:', error);
        setOpnameLayers([]);
        setSelectedOpnameLayerId('');
      } finally {
        if (!cancelled) {
          setIsOpnameLayersLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editingProduct?.id, editingProduct?.costPrice, editingProduct?.sellPrice]);

  useEffect(() => {
    // Real-time listener for products
    const q = query(collection(db, 'products'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((document) => {
        prods.push({ id: document.id, ...document.data() } as Product);
      });
      setProducts(prods);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching products:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredProducts = products
    .filter((p) => {
      const nameKey = normalizeSearchQuery(p.name);
      const skuKey = normalizeSearchQuery(p.sku);
      const matchesSearch = nameKey.includes(normalizedSearchQuery) || skuKey.includes(normalizedSearchQuery);
      const matchesLowStock = filterLowStock ? p.stockQty <= p.lowStockThreshold : true;
      return matchesSearch && matchesLowStock;
    })
    .sort((a, b) => {
      const direction = sortOrder === 'asc' ? 1 : -1;

      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }) * direction;
      }

      return (a[sortBy] - b[sortBy]) * direction;
    });

  const handleStockOpname = async () => {
    if (!editingProduct || isOpnameProcessing) return;
    setIsOpnameProcessing(true);
    try {
      const newQty = parseNumber(opnameQty);
      const selectedLayerId = selectedOpnameLayerId;

      if (!selectedOpnameLayerId) {
        throw new Error('Pilih layer FIFO untuk opname.');
      }

      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, 'products', editingProduct.id!);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) {
          throw new Error('Produk tidak ditemukan');
        }

        const productData = productSnap.data() as Product;
        const previousQty = productData.stockQty || 0;
        const delta = newQty - previousQty;
        const targetLayerId = selectedLayerId;
        let layerRef: ReturnType<typeof doc> | null = null;
        let layerCurrentQty = 0;
        let layerCurrentReceived = 0;

        if (delta !== 0 && targetLayerId) {
          layerRef = doc(db, 'inventory_layers', targetLayerId);
          const layerSnap = await transaction.get(layerRef);
          if (!layerSnap.exists()) {
            throw new Error('Layer FIFO tidak ditemukan.');
          }
          const layerData = layerSnap.data();
          layerCurrentQty = layerData.quantityRemaining || 0;
          layerCurrentReceived = layerData.quantityReceived || 0;
        }

        if (delta !== 0) {
          if (!targetLayerId) {
            throw new Error('Layer FIFO belum dipilih.');
          }

          if (delta < 0 && layerRef) {
            const deduction = Math.abs(delta);

            if (layerCurrentQty < deduction) {
              throw new Error(`Stok layer tidak cukup. Sisa di layer ${formatNumber(layerCurrentQty)}.`);
            }

            transaction.update(layerRef, {
              quantityRemaining: layerCurrentQty - deduction,
              updatedAt: serverTimestamp(),
            });
          }

          if (delta > 0 && layerRef) {
            transaction.update(layerRef, {
              quantityRemaining: layerCurrentQty + delta,
              quantityReceived: layerCurrentReceived + delta,
              updatedAt: serverTimestamp(),
            });
          }

          const movementRef = doc(collection(db, 'stock_movements'));
          transaction.set(movementRef, {
            productId: editingProduct.id,
            type: 'adjustment',
            quantityChange: delta,
            referenceId: editingProduct.id,
            referenceType: 'stock_opname',
            performedBy: currentUser?.uid || 'unknown',
            performedAt: serverTimestamp(),
            layerId: targetLayerId || null,
            adjustmentSource: 'existing_layer',
            note: `Stock opname dari ${formatNumber(previousQty)} ke ${formatNumber(newQty)}`,
          });
        }

        transaction.update(productRef, {
          stockQty: newQty,
          updatedAt: serverTimestamp(),
        });
      });
      setEditingProduct(null);
      setOpnameQty('');
      setSelectedOpnameLayerId('');
    } catch (error) {
      console.error("Error updating stock:", error);
      const message = error instanceof Error ? error.message : 'Gagal melakukan stock opname';
      alert(message);
    } finally {
      setIsOpnameProcessing(false);
    }
  };

  useEffect(() => {
    if (!selectedProductDetail?.id) {
      setRecentMovements([]);
      setFifoLayers([]);
      setDetailLoading(false);
      return;
    }

    setDetailLoading(true);

    let cancelled = false;
    (async () => {
      try {
        const movementQuery = query(
          collection(db, 'stock_movements'),
          where('productId', '==', selectedProductDetail.id),
          limit(30),
        );
        const fifoQuery = query(
          collection(db, 'inventory_layers'),
          where('productId', '==', selectedProductDetail.id),
          limit(80),
        );

        const [movementSnap, fifoSnap] = await Promise.all([
          getDocs(movementQuery),
          getDocs(fifoQuery),
        ]);

        if (cancelled) return;

        const movements: ProductMovement[] = movementSnap.docs
          .map((item) => {
            const data = item.data();
            return {
              id: item.id,
              type: data.type || 'unknown',
              quantityChange: data.quantityChange || 0,
              referenceId: data.referenceId,
              referenceType: data.referenceType,
              receiptCode: data.receiptCode,
              supplierName: data.supplierName,
              note: data.note,
              performedAt: data.performedAt?.toDate?.() || null,
            };
          })
          .sort((a, b) => {
            const aTime = a.performedAt ? a.performedAt.getTime() : 0;
            const bTime = b.performedAt ? b.performedAt.getTime() : 0;
            return bTime - aTime;
          })
          .slice(0, 5);

        const layers: ProductFifoLayer[] = fifoSnap.docs
          .map((item) => {
            const data = item.data();
            return {
              id: item.id,
              quantityRemaining: data.quantityRemaining || 0,
              unitCost: data.unitCost || 0,
              sellPriceSnapshot: data.sellPriceSnapshot || selectedProductDetail.sellPrice || 0,
              sourceType: data.sourceType || 'purchase_receipt',
              receivedAt: data.receivedAt?.toDate?.() || null,
            };
          })
          .filter((item) => item.quantityRemaining > 0)
          .sort((a, b) => {
            const aTime = a.receivedAt ? a.receivedAt.getTime() : 0;
            const bTime = b.receivedAt ? b.receivedAt.getTime() : 0;
            return aTime - bTime;
          });

        setRecentMovements(movements);
        setFifoLayers(layers);
      } catch (error) {
        console.error('Error loading product details:', error);
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProductDetail?.id, selectedProductDetail?.sellPrice]);

  const formatMovementSource = (movement: ProductMovement) => {
    if (movement.referenceType === 'purchase_order') {
      const base = movement.receiptCode ? `PB ${movement.receiptCode}` : `PB ${movement.referenceId || '-'}`;
      return movement.supplierName ? `${base} • ${movement.supplierName}` : base;
    }
    if (movement.referenceType === 'sale') {
      return `Penjualan #${movement.referenceId || '-'}`;
    }
    if (movement.referenceType === 'stock_opname') {
      return 'Stock Opname';
    }
    if (movement.referenceType === 'initial_stock') {
      return 'Stok Awal Produk';
    }
    return movement.referenceType || 'Manual';
  };

  return (
    <div className="ai-page page-enter">
      <section className="ai-card ai-page-hero stagger-fade-in">
        <div className="ai-section-title">
          <div className="flex items-center gap-3">
            <div className="ai-stat-orb">
              <Boxes className="h-5 w-5 text-sky-700" />
            </div>
            <div>
              <p className="ai-kicker mb-1">Inventaris</p>
              <h2 className="ai-heading text-2xl font-bold text-slate-900">Stok & Ketersediaan</h2>
            </div>
          </div>
          <div className="ai-chip">
            <Sparkles className="h-3.5 w-3.5 text-sky-600" />
            <span>{products.length} item terhubung</span>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate-600">
          Pantau inventaris secara real time, sorot item kritis, dan lakukan stock opname dari panel yang terasa cepat dan rapi.
        </p>
        <div className="relative mt-5">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari inventaris..."
            className="ai-input w-full py-3 pl-12 pr-4"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setFilterLowStock(false)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${!filterLowStock ? 'ai-button text-slate-950' : 'ai-button-ghost text-slate-600'}`}
          >
            Semua
          </button>
          <button
            onClick={() => setFilterLowStock(true)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${filterLowStock ? 'border border-rose-300/30 bg-rose-50 text-rose-600 shadow-[0_16px_34px_rgba(255,107,157,0.08)]' : 'ai-button-ghost text-slate-600'}`}
          >
            <AlertTriangle className="h-4 w-4" />
            Stok Menipis
          </button>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'sellPrice' | 'stockQty')}
              className="ai-select w-full appearance-none py-2.5 pl-4 pr-10 text-sm font-medium"
            >
              <option value="name">Urutkan: Nama</option>
              <option value="sellPrice">Urutkan: Harga</option>
              <option value="stockQty">Urutkan: Stok</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
              <ChevronDown className="h-5 w-5" />
            </div>
          </div>
          <button
            onClick={() => setSortOrder((prev) => prev === 'asc' ? 'desc' : 'asc')}
            className="ai-button-ghost inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-700"
          >
            <ArrowUpDown className="h-4 w-4" />
            {sortOrder === 'asc' ? 'A-Z / Kecil' : 'Z-A / Besar'}
          </button>
        </div>
      </section>

      <section className="mt-4 space-y-3 pb-24">
        {loading ? (
          <p className="py-8 text-center text-slate-400">Memuat stok...</p>
        ) : filteredProducts.length === 0 ? (
          <div className="ai-empty-state">
            <p className="font-medium text-slate-900">Tidak ada produk ditemukan.</p>
            <p className="mt-1 text-sm text-slate-500">Coba ubah kata kunci pencarian atau filter stok.</p>
          </div>
        ) : (
          filteredProducts.map((product, index) => {
            const isLowStock = product.stockQty <= product.lowStockThreshold;
            return (
              <div
                key={product.id}
                className="ai-card ai-card-hover stagger-fade-in p-4"
                style={{ animationDelay: `${index * 60}ms` }}
                onClick={() => setSelectedProductDetail(product)}
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold leading-tight text-slate-900">{formatProductName(product.name)}</h3>
                    <p className="mt-1 text-xs text-slate-400">SKU: {product.sku}</p>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${isLowStock ? 'text-rose-500' : 'text-slate-900'}`}>
                      {formatNumber(product.stockQty)}
                    </div>
                    <div className={`mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${isLowStock ? 'text-rose-500' : 'text-emerald-600'}`}>
                      {isLowStock ? 'Menipis' : 'Aman'}
                    </div>
                  </div>
                </div>
                
                <div className="ai-divider my-3" />

                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Rp {formatNumber(product.sellPrice)}</p>
                    {userRole === 'owner' && (
                      <p className="mt-0.5 text-xs text-slate-500">Modal: Rp {formatNumber(product.costPrice)}</p>
                    )}
                  </div>
                  {userRole === 'owner' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/stock/add?tab=pb&productId=${product.id}`);
                        }}
                        className="ai-button inline-flex items-center gap-2 px-3 py-2 text-sm font-medium"
                      >
                        <PackagePlus className="h-4 w-4" />
                        Tambah PB
                      </button>
                      <button 
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingProduct(product);
                          setOpnameQty(product.stockQty.toString());
                        }}
                        className="ai-button-ghost inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-sky-700"
                      >
                        <Edit2 className="h-4 w-4" />
                        Opname
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>

      {userRole === 'owner' && (
        <div className="fixed bottom-[92px] right-4 flex flex-col gap-3">
          <button 
            onClick={() => navigate('/stock/add?tab=product')}
            className="ai-button flex items-center justify-center rounded-full p-3.5"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      )}

      {/* Stock Opname Modal */}
      {editingProduct && (
        <div className="ai-modal-shell">
          <div className="ai-modal-backdrop" onClick={() => setEditingProduct(null)} />
          <div className="ai-modal-panel page-enter translate-y-0 scale-100">
            <div className="flex items-center justify-between p-4">
              <h2 className="text-lg font-bold text-slate-900">Stock Opname</h2>
              <button onClick={() => setEditingProduct(null)} className="ai-button-ghost rounded-full p-2 text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="ai-divider" />
            <div className="p-4">
              <p className="mb-4 text-sm text-slate-500">Sesuaikan stok fisik untuk <span className="font-semibold text-slate-900">{formatProductName(editingProduct.name)}</span></p>
              
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-slate-700">Jumlah Stok Fisik (Aktual)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  className="ai-input w-full px-4 py-3 text-center text-xl font-bold"
                  value={opnameQty}
                  onChange={(e) => {
                    const { formatted } = handleFormattedInputChange(e.target.value);
                    setOpnameQty(formatted);
                  }}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Perubahan: {parseNumber(opnameQty) - (editingProduct.stockQty || 0) > 0 ? '+' : ''}{formatNumber(parseNumber(opnameQty) - (editingProduct.stockQty || 0))}
                </p>
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-slate-700">Layer FIFO untuk Penyesuaian</label>
                {isOpnameLayersLoading ? (
                  <p className="text-sm text-slate-500">Memuat layer FIFO...</p>
                ) : (
                  <>
                    <select
                      value={selectedOpnameLayerId}
                      onChange={(e) => setSelectedOpnameLayerId(e.target.value)}
                      className="ai-select w-full appearance-none py-3 px-4 text-sm"
                    >
                      {opnameLayers.map((layer) => (
                        <option key={layer.id} value={layer.id}>
                          {layer.sourceType === 'initial_stock' ? 'Stok Awal' : layer.sourceType === 'stock_opname' ? 'Opname' : 'PB'}
                          {' · '}Sisa {formatNumber(layer.quantityRemaining)}
                          {' · '}Modal Rp {formatNumber(layer.unitCost)}
                          {layer.receivedAt ? ` · ${layer.receivedAt.toLocaleDateString('id-ID')}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      Penyesuaian stok hanya menggunakan layer FIFO yang sudah ada.
                    </p>
                  </>
                )}
              </div>

              {parseNumber(opnameQty) - (editingProduct.stockQty || 0) < 0 && selectedOpnameLayerId && (
                <p className="mb-4 text-xs text-slate-500">
                  Pastikan layer dipilih punya sisa cukup untuk dikurangi.
                </p>
              )}
              
              <button
                onClick={handleStockOpname}
                disabled={isOpnameProcessing}
                className="ai-button w-full px-4 py-3.5 font-bold disabled:opacity-50"
              >
                {isOpnameProcessing ? 'MENYIMPAN...' : 'SIMPAN STOK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedProductDetail && (
        <div className="ai-modal-shell">
          <div className="ai-modal-backdrop" onClick={() => setSelectedProductDetail(null)} />
          <div className="ai-modal-panel page-enter translate-y-0 scale-100">
            <div className="flex items-center justify-between p-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{formatProductName(selectedProductDetail.name)}</h2>
                <p className="text-xs text-slate-500">SKU: {selectedProductDetail.sku || '-'}</p>
              </div>
              <button onClick={() => setSelectedProductDetail(null)} className="ai-button-ghost rounded-full p-2 text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="ai-divider" />
            <div className="max-h-[72vh] space-y-5 overflow-y-auto p-4">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">5 Aktivitas Stok Terbaru</h3>
                {detailLoading ? (
                  <p className="text-sm text-slate-500">Memuat aktivitas...</p>
                ) : recentMovements.length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada riwayat perubahan stok.</p>
                ) : (
                  <div className="space-y-2">
                    {recentMovements.map((movement) => (
                      <div key={movement.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{formatMovementSource(movement)}</p>
                          <p className={`text-sm font-bold ${movement.quantityChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {movement.quantityChange >= 0 ? '+' : ''}{formatNumber(movement.quantityChange)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {movement.performedAt ? movement.performedAt.toLocaleString('id-ID') : '-'}
                        </p>
                        {movement.note && <p className="mt-1 text-xs text-slate-600">{movement.note}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Layer FIFO Aktif (Harga Modal per Batch)</h3>
                {fifoLayers.length === 0 ? (
                  <p className="text-sm text-slate-500">Tidak ada layer FIFO aktif.</p>
                ) : (
                  <div className="space-y-2">
                    {fifoLayers.map((layer) => (
                      <div key={layer.id} className="rounded-2xl border border-sky-200/60 bg-sky-50/60 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {layer.sourceType === 'initial_stock' ? 'Stok Awal' : 'PB / Pembelian'}
                          </p>
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Modal Rp {formatNumber(layer.unitCost)}</p>
                            <p className="text-sm font-bold text-slate-900">Jual Rp {formatNumber(layer.sellPriceSnapshot)}</p>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          Sisa {formatNumber(layer.quantityRemaining)} unit
                          {layer.receivedAt ? ` • ${layer.receivedAt.toLocaleDateString('id-ID')}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
