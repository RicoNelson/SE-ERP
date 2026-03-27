import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Search, ChevronLeft, ChevronDown, Plus } from 'lucide-react';
import type { Product } from '../types';
import { formatDateId, formatNumber, formatProductName, normalizeSearchQuery } from '../utils/format';

interface ProductSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProduct: (product: Product) => void;
}

export default function ProductSearchModal({ isOpen, onClose, onAddProduct }: ProductSearchModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [productsPerPage, setProductsPerPage] = useState(10);

  const [isVisible, setIsVisible] = useState(isOpen);
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setShouldRender(true);
        setIsVisible(true);
      });
    } else {
      requestAnimationFrame(() => setIsVisible(false));
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return; // Only fetch when modal is open
    
    const q = query(collection(db, 'products'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((doc) => {
        prods.push({ id: doc.id, ...doc.data() } as Product);
      });
      setProducts(prods);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen]);

  if (!shouldRender) return null;

  const normalizedSearch = normalizeSearchQuery(searchQuery);
  const filteredProducts = products.filter((p) =>
    normalizeSearchQuery(p.name).includes(normalizedSearch) ||
    normalizeSearchQuery(p.sku).includes(normalizedSearch),
  );
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
  const startIndex = (currentPage - 1) * productsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + productsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, productsPerPage, isOpen]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className={`fixed inset-0 z-50 flex flex-col bg-[linear-gradient(180deg,rgba(248,251,255,0.96),rgba(243,248,255,0.99))] transition-all duration-300 ${isVisible ? 'visible translate-y-0 opacity-100' : 'invisible translate-y-8 opacity-0'}`}>
      <div className="glass-panel-strong flex items-center gap-3 border-b border-sky-100 px-4 py-3 shadow-sm pt-safe">
        <button 
          onClick={onClose}
          className="ai-button-ghost -ml-2 rounded-full p-2 text-slate-600"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            type="text"
            placeholder="Ketik untuk mencari..."
            className="ai-input w-full py-2.5 pl-9 pr-4 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <select
              value={productsPerPage}
              onChange={(e) => setProductsPerPage(Number(e.target.value))}
              className="ai-select w-full appearance-none py-2.5 pl-4 pr-10 text-sm font-medium"
            >
              <option value={10}>10 produk / halaman</option>
              <option value={20}>20 produk / halaman</option>
              <option value={50}>50 produk / halaman</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
              <ChevronDown className="h-5 w-5" />
            </div>
          </div>
          <div className="inline-flex items-center justify-center rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-600">
            Total: {filteredProducts.length}
          </div>
        </div>

        {loading ? (
          <p className="py-8 text-center text-slate-400">Memuat produk...</p>
        ) : filteredProducts.length === 0 ? (
          <div className="ai-empty-state">
            <p className="font-medium text-slate-900">Tidak ada produk ditemukan.</p>
            <p className="mt-1 text-sm text-slate-500">Coba cari berdasarkan nama atau SKU yang berbeda.</p>
          </div>
        ) : (
          paginatedProducts.map((product, index) => {
            const isLowStock = product.stockQty <= product.lowStockThreshold;
            const isOutOfStock = product.stockQty === 0;

            return (
              <div key={product.id} className="ai-card ai-card-hover stagger-fade-in flex items-center justify-between p-4" style={{ animationDelay: `${index * 50}ms` }}>
                <div className="flex-1 mr-4">
                  <h3 className="font-semibold text-slate-900">{formatProductName(product.name)}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm">
                    <span className="text-slate-600">Rp {formatNumber(product.sellPrice)}</span>
                    <span className="text-slate-600">|</span>
                    <span className={`font-medium ${isOutOfStock ? 'text-rose-300' : isLowStock ? 'text-amber-300' : 'text-slate-400'}`}>
                      Stok: {formatNumber(product.stockQty)} {isOutOfStock ? '(Habis!)' : isLowStock ? '(Menipis)' : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">PB terakhir: {formatDateId(product.latestPbDate)}</p>
                </div>
                <button 
                  onClick={() => onAddProduct(product)}
                  className="ai-button inline-flex items-center gap-1 px-3 py-2 text-sm font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Tambah
                </button>
              </div>
            );
          })
        )}

        {!loading && filteredProducts.length > 0 && (
          <div className="mt-1 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="ai-button-ghost px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sebelumnya
            </button>
            <p className="text-sm font-medium text-slate-600">
              Halaman {currentPage} / {totalPages}
            </p>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="ai-button-ghost px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Berikutnya
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
