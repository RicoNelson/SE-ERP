import { formatProductName, handleFormattedInputChange } from '../utils/format';
import type { ProductFormData, ProductFormFieldErrors } from '../features/products/productForm';

interface ProductFormFieldsProps {
  value: ProductFormData;
  onChange: (next: ProductFormData) => void;
  idPrefix: string;
  errors?: ProductFormFieldErrors;
}

export default function ProductFormFields({ value, onChange, idPrefix, errors }: ProductFormFieldsProps) {
  const getInputClassName = (hasError?: boolean) =>
    `ai-input w-full px-4 py-3 transition-colors duration-200 ${hasError ? 'ai-input-error' : ''}`;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-name`} className="mb-1 block text-sm font-medium text-slate-700">Nama Produk *</label>
        <input
          id={`${idPrefix}-name`}
          required
          type="text"
          className={getInputClassName(Boolean(errors?.name))}
          placeholder="Misal: Samsung Charger 25W"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: formatProductName(e.target.value) })}
          aria-invalid={Boolean(errors?.name)}
          aria-describedby={errors?.name ? `${idPrefix}-name-error` : undefined}
        />
        {errors?.name && (
          <p id={`${idPrefix}-name-error`} className="ai-field-error mt-1 text-xs">
            {errors.name}
          </p>
        )}
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
            className={getInputClassName(Boolean(errors?.costPrice))}
            value={value.costPrice}
            onChange={(e) => {
              const { formatted } = handleFormattedInputChange(e.target.value);
              onChange({ ...value, costPrice: formatted });
            }}
            aria-invalid={Boolean(errors?.costPrice)}
            aria-describedby={errors?.costPrice ? `${idPrefix}-cost-error` : undefined}
          />
          {errors?.costPrice && (
            <p id={`${idPrefix}-cost-error`} className="ai-field-error mt-1 text-xs">
              {errors.costPrice}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-sell`} className="mb-1 block text-sm font-medium text-slate-700">Harga Jual (Rp) *</label>
          <input
            id={`${idPrefix}-sell`}
            required
            type="text"
            inputMode="numeric"
            className={getInputClassName(Boolean(errors?.sellPrice))}
            value={value.sellPrice}
            onChange={(e) => {
              const { formatted } = handleFormattedInputChange(e.target.value);
              onChange({ ...value, sellPrice: formatted });
            }}
            aria-invalid={Boolean(errors?.sellPrice)}
            aria-describedby={errors?.sellPrice ? `${idPrefix}-sell-error` : undefined}
          />
          {errors?.sellPrice && (
            <p id={`${idPrefix}-sell-error`} className="ai-field-error mt-1 text-xs">
              {errors.sellPrice}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-stock`} className="mb-1 block text-sm font-medium text-slate-700">Stok Awal</label>
          <input
            id={`${idPrefix}-stock`}
            type="text"
            inputMode="numeric"
            className={getInputClassName(Boolean(errors?.stockQty))}
            value={value.stockQty}
            onChange={(e) => {
              const { formatted } = handleFormattedInputChange(e.target.value);
              onChange({ ...value, stockQty: formatted });
            }}
            aria-invalid={Boolean(errors?.stockQty)}
            aria-describedby={errors?.stockQty ? `${idPrefix}-stock-error` : undefined}
          />
          {errors?.stockQty && (
            <p id={`${idPrefix}-stock-error`} className="ai-field-error mt-1 text-xs">
              {errors.stockQty}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-threshold`} className="mb-1 block text-sm font-medium text-slate-700">Batas Menipis</label>
          <input
            id={`${idPrefix}-threshold`}
            type="text"
            inputMode="numeric"
            className={getInputClassName(Boolean(errors?.lowStockThreshold))}
            value={value.lowStockThreshold}
            onChange={(e) => {
              const { formatted } = handleFormattedInputChange(e.target.value);
              onChange({ ...value, lowStockThreshold: formatted });
            }}
            aria-invalid={Boolean(errors?.lowStockThreshold)}
            aria-describedby={errors?.lowStockThreshold ? `${idPrefix}-threshold-error` : undefined}
          />
          {errors?.lowStockThreshold && (
            <p id={`${idPrefix}-threshold-error`} className="ai-field-error mt-1 text-xs">
              {errors.lowStockThreshold}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
