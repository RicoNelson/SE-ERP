import { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { X } from 'lucide-react';
import type { Product } from '../types';
import { handleFormattedInputChange, parseNumber } from '../utils/format';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddProductModal({ isOpen, onClose }: AddProductModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
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
      setShouldRender(true);
      // Small delay to allow DOM to render before triggering animation
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
      // Wait for animation to finish before removing from DOM
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
      const productData: Product = {
        name: formData.name,
        sku: formData.sku,
        sellPrice: parseNumber(formData.sellPrice),
        costPrice: parseNumber(formData.costPrice),
        stockQty: parseNumber(formData.stockQty),
        lowStockThreshold: parseNumber(formData.lowStockThreshold),
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'products'), productData);
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
                onChange={(e) => setFormData({...formData, name: e.target.value})}
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
