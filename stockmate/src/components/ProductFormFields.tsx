import { formatProductName, handleFormattedInputChange } from '../utils/format';
import type { ProductFormData } from '../features/products/productForm';

interface ProductFormFieldsProps {
  value: ProductFormData;
  onChange: (next: ProductFormData) => void;
  idPrefix: string;
}

export default function ProductFormFields({ value, onChange, idPrefix }: ProductFormFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-name`} className="mb-1 block text-sm font-medium text-slate-700">Nama Produk *</label>
        <input
          id={`${idPrefix}-name`}
          required
          type="text"
          className="ai-input w-full px-4 py-3"
          placeholder="Misal: Samsung Charger 25W"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: formatProductName(e.target.value) })}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-sku`} className="mb-1 block text-sm font-medium text-slate-700">SKU / Barcode</label>
        <input
          id={`${idPrefix}-sku`}
          type="text"
          className="ai-input w-full px-4 py-3"
          placeholder="Misal: SAM-CHG-25"
          value={value.sku}
          onChange={(e) => onChange({ ...value, sku: e.target.value })}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-cost`} className="mb-1 block text-sm font-medium text-slate-700">Harga Beli (Rp) *</label>
          <input
            id={`${idPrefix}-cost`}
            required
            type="text"
            inputMode="numeric"
            className="ai-input w-full px-4 py-3"
            value={value.costPrice}
            onChange={(e) => {
              const { formatted } = handleFormattedInputChange(e.target.value);
              onChange({ ...value, costPrice: formatted });
            }}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-sell`} className="mb-1 block text-sm font-medium text-slate-700">Harga Jual (Rp) *</label>
          <input
            id={`${idPrefix}-sell`}
            required
            type="text"
            inputMode="numeric"
            className="ai-input w-full px-4 py-3"
            value={value.sellPrice}
            onChange={(e) => {
              const { formatted } = handleFormattedInputChange(e.target.value);
              onChange({ ...value, sellPrice: formatted });
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-stock`} className="mb-1 block text-sm font-medium text-slate-700">Stok Awal</label>
          <input
            id={`${idPrefix}-stock`}
            type="text"
            inputMode="numeric"
            className="ai-input w-full px-4 py-3"
            value={value.stockQty}
            onChange={(e) => {
              const { formatted } = handleFormattedInputChange(e.target.value);
              onChange({ ...value, stockQty: formatted });
            }}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-threshold`} className="mb-1 block text-sm font-medium text-slate-700">Batas Menipis</label>
          <input
            id={`${idPrefix}-threshold`}
            type="text"
            inputMode="numeric"
            className="ai-input w-full px-4 py-3"
            value={value.lowStockThreshold}
            onChange={(e) => {
              const { formatted } = handleFormattedInputChange(e.target.value);
              onChange({ ...value, lowStockThreshold: formatted });
            }}
          />
        </div>
      </div>
    </div>
  );
}
