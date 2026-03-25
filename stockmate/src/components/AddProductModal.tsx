import { useState, useEffect } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { X } from 'lucide-react';
import type { Product } from '../types';
import { formatProductName, handleFormattedInputChange, parseNumber } from '../utils/format';
import { useAuth } from '../contexts/AuthContext';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddProductModal({ isOpen, onClose }: AddProductModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { currentUser } = useAuth();
  
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    sellPrice: '',
    costPrice: '',
    stockQty: '0',
    lowStockThreshold: '5',
  });

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

  if (!shouldRender) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const stockQty = parseNumber(formData.stockQty);
      const costPrice = parseNumber(formData.costPrice);
      const productData: Product = {
        name: formatProductName(formData.name),
        sku: formData.sku,
        sellPrice: parseNumber(formData.sellPrice),
        costPrice,
        stockQty,
        lowStockThreshold: parseNumber(formData.lowStockThreshold),
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const batch = writeBatch(db);
      const productRef = doc(collection(db, 'products'));
      batch.set(productRef, productData);

      if (stockQty > 0) {
        const layerRef = doc(collection(db, 'inventory_layers'));
        batch.set(layerRef, {
          productId: productRef.id,
          quantityReceived: stockQty,
          quantityRemaining: stockQty,
          unitCost: costPrice,
          sellPriceSnapshot: parseNumber(formData.sellPrice),
          sourceType: 'initial_stock',
          sourceId: productRef.id,
          receivedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const movementRef = doc(collection(db, 'stock_movements'));
        batch.set(movementRef, {
          productId: productRef.id,
          type: 'stock_in',
          quantityChange: stockQty,
          unitCost: costPrice,
          layerId: layerRef.id,
          referenceId: productRef.id,
          referenceType: 'initial_stock',
          performedBy: currentUser?.uid || 'unknown',
          performedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setFormData({ name: '', sku: '', sellPrice: '', costPrice: '', stockQty: '0', lowStockThreshold: '5' });
      onClose();
    } catch (err: unknown) {
      console.error('Error adding product: ', err);
      setError('Gagal menambahkan produk. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`ai-modal-shell transition-all duration-300 ${isVisible ? 'visible opacity-100' : 'invisible opacity-0'}`}>
      <div 
        className={`ai-modal-backdrop transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      
      <div 
        className={`ai-modal-panel transition-transform duration-300 ease-out ${
          isVisible ? 'translate-y-0 scale-100' : 'translate-y-full sm:translate-y-8 sm:scale-95'
        }`}
      >
        <div className="flex items-center justify-between p-4">
          <h2 className="text-lg font-bold text-slate-900">Tambah Produk Baru</h2>
          <button onClick={onClose} className="ai-button-ghost rounded-full p-2 text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="ai-divider" />
        
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {error && <div className="mb-4 rounded-2xl border border-rose-300/30 bg-rose-50 p-3 text-sm text-rose-600">{error}</div>}
          
          <form id="add-product-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nama Produk *</label>
              <input
                required
                type="text"
                placeholder="Misal: Samsung Charger 25W"
                className="ai-input w-full px-4 py-3"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: formatProductName(e.target.value)})}
              />
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">SKU / Barcode</label>
              <input
                type="text"
                placeholder="Misal: SAM-CHG-25"
                className="ai-input w-full px-4 py-3"
                value={formData.sku}
                onChange={(e) => setFormData({...formData, sku: e.target.value})}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Harga Modal (Rp) *</label>
              <input
                required
                type="text"
                inputMode="numeric"
                placeholder="100.000"
                className="ai-input w-full px-4 py-3"
                value={formData.costPrice}
                onChange={(e) => {
                  const { formatted } = handleFormattedInputChange(e.target.value);
                  setFormData({...formData, costPrice: formatted});
                }}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Harga Jual (Rp) *</label>
              <input
                required
                type="text"
                inputMode="numeric"
                placeholder="150.000"
                className="ai-input w-full px-4 py-3"
                value={formData.sellPrice}
                onChange={(e) => {
                  const { formatted } = handleFormattedInputChange(e.target.value);
                  setFormData({...formData, sellPrice: formatted});
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Stok Awal</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="ai-input w-full px-4 py-3"
                  value={formData.stockQty}
                  onChange={(e) => {
                    const { formatted } = handleFormattedInputChange(e.target.value);
                    setFormData({...formData, stockQty: formatted});
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Batas Menipis</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="ai-input w-full px-4 py-3"
                  value={formData.lowStockThreshold}
                  onChange={(e) => {
                    const { formatted } = handleFormattedInputChange(e.target.value);
                    setFormData({...formData, lowStockThreshold: formatted});
                  }}
                />
              </div>
            </div>
          </form>
        </div>
        
        <div className="p-4">
          <button
            form="add-product-form"
            type="submit"
            disabled={loading}
            className="ai-button w-full px-4 py-3 font-medium disabled:opacity-50"
          >
            {loading ? 'MENYIMPAN...' : 'SIMPAN PRODUK'}
          </button>
        </div>
      </div>
    </div>
  );
}
