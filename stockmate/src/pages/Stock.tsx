import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Search, Plus, Edit2, X, Boxes, AlertTriangle, Sparkles, ChevronDown, ArrowUpDown } from 'lucide-react';
import type { Product } from '../types';
import AddProductModal from '../components/AddProductModal';
import { formatNumber, handleFormattedInputChange, parseNumber } from '../utils/format';
import { useAuth } from '../contexts/AuthContext';

export default function Stock() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'sellPrice' | 'stockQty'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { userProfile } = useAuth();
  
  const userRole = userProfile?.role || 'staff';
  
  // Stock Opname state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [opnameQty, setOpnameQty] = useState('');
  const [isOpnameProcessing, setIsOpnameProcessing] = useState(false);

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
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.sku.toLowerCase().includes(searchQuery.toLowerCase());
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
      const productRef = doc(db, 'products', editingProduct.id!);
      await updateDoc(productRef, {
        stockQty: newQty,
        updatedAt: serverTimestamp()
      });
      setEditingProduct(null);
      setOpnameQty('');
    } catch (error) {
      console.error("Error updating stock:", error);
      alert("Gagal melakukan stock opname");
    } finally {
      setIsOpnameProcessing(false);
    }
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
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold leading-tight text-slate-900">{product.name}</h3>
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
                    <button 
                      onClick={() => {
                        setEditingProduct(product);
                        setOpnameQty(product.stockQty.toString());
                      }}
                      className="ai-button-ghost inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-sky-700"
                    >
                      <Edit2 className="h-4 w-4" />
                      Opname
                    </button>
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
            onClick={() => setIsAddModalOpen(true)}
            className="ai-button flex items-center justify-center rounded-full p-3.5"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      )}

      <AddProductModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
      />

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
              <p className="mb-4 text-sm text-slate-500">Sesuaikan stok fisik untuk <span className="font-semibold text-slate-900">{editingProduct.name}</span></p>
              
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
              </div>
              
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
    </div>
  );
}
