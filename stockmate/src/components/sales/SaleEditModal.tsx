import { AlertTriangle, Pencil, Plus, Save, ShoppingBag, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Product } from '../../types';
import { formatNumber, formatProductName, handleFormattedInputChange, parseNumber } from '../../utils/format';
import { PAYMENT_METHODS, toDateInputValue } from '../../features/sales/constants';
import type { EditableSaleDraft, SaleHistoryItem } from '../../features/sales/saleTransactions';
import ProductSearchModal from '../ProductSearchModal';

interface SaleEditModalProps {
  sale: SaleHistoryItem | null;
  isOpen: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onSave: (draft: EditableSaleDraft) => Promise<void>;
  onDelete: () => Promise<void>;
}

interface SaleEditorRow {
  id: string;
  productId: string;
  productNameSnapshot: string;
  quantity: string;
  unitPrice: string;
}

const toEditorRows = (sale: SaleHistoryItem | null): SaleEditorRow[] => (
  sale?.items.map((item) => ({
    id: `${item.productId}-${crypto.randomUUID()}`,
    productId: item.productId,
    productNameSnapshot: formatProductName(item.productNameSnapshot),
    quantity: formatNumber(item.quantity),
    unitPrice: formatNumber(item.unitPrice),
  })) || []
);

export default function SaleEditModal({
  sale,
  isOpen,
  isSaving,
  isDeleting,
  onClose,
  onSave,
  onDelete,
}: SaleEditModalProps) {
  const [rows, setRows] = useState<SaleEditorRow[]>(() => toEditorRows(sale));
  const [paymentMethod, setPaymentMethod] = useState(() => sale?.paymentMethod || PAYMENT_METHODS[0]);
  const [soldDate, setSoldDate] = useState(() => toDateInputValue(sale?.soldAt || new Date()));
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [formError, setFormError] = useState('');

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + (parseNumber(row.quantity) * parseNumber(row.unitPrice)), 0),
    [rows],
  );

  if (!isOpen || !sale) return null;

  const handleAddProduct = (product: Product) => {
    const productId = product.id;
    if (!productId) return;
    setFormError('');
    setRows((prev) => {
      const existing = prev.find((row) => row.productId === productId);
      if (existing) {
        return prev.map((row) => (
          row.productId === productId
            ? { ...row, quantity: formatNumber(parseNumber(row.quantity) + 1) }
            : row
        ));
      }

      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          productId,
          productNameSnapshot: formatProductName(product.name),
          quantity: '1',
          unitPrice: formatNumber(product.sellPrice),
        },
      ];
    });
    setIsSearchOpen(false);
  };

  const handleSave = async () => {
    const soldAt = new Date(`${soldDate}T00:00:00`);
    if (Number.isNaN(soldAt.getTime())) {
      setFormError('Tanggal penjualan wajib diisi.');
      return;
    }

    const cleanedRows = rows
      .map((row) => ({
        productId: row.productId,
        quantity: parseNumber(row.quantity),
        unitPrice: parseNumber(row.unitPrice),
      }))
      .filter((row) => row.productId && row.quantity > 0 && row.unitPrice > 0);

    if (cleanedRows.length === 0) {
      setFormError('Minimal satu produk penjualan harus tersisa.');
      return;
    }

    setFormError('');
    await onSave({
      soldAt,
      paymentMethod,
      items: cleanedRows,
    });
  };

  return (
    <>
      <div className="ai-modal-shell">
        <div className="ai-modal-backdrop" onClick={onClose} />
        <div className="ai-modal-panel page-enter translate-y-0 scale-100">
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Edit Penjualan</p>
              <h2 className="text-lg font-bold text-slate-900">
                {sale.soldAt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
              </h2>
            </div>
            <button onClick={onClose} className="ai-button-ghost rounded-full p-2 text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="ai-divider" />

          <div className="max-h-[72vh] space-y-4 overflow-y-auto p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Tanggal</label>
                <input
                  type="date"
                  value={soldDate}
                  onChange={(event) => setSoldDate(event.target.value)}
                  className="ai-input w-full px-3 py-2.5"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Metode Pembayaran</label>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className="ai-select w-full appearance-none px-3 py-2.5"
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-sky-600" />
                  <p className="text-sm font-semibold text-slate-900">Produk dalam penjualan</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  className="ai-button inline-flex items-center gap-2 px-3 py-2 text-sm"
                >
                  <Plus className="h-4 w-4" />
                  Tambah Produk
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {rows.map((row, index) => (
                <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Item {index + 1}</p>
                      <h3 className="mt-1 font-bold text-slate-900">{row.productNameSnapshot}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((item) => item.id !== row.id))}
                      className="ai-button-ghost rounded-xl p-2 text-rose-600"
                      title="Hapus item dari penjualan"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Jumlah</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.quantity}
                        onChange={(event) => {
                          const { formatted } = handleFormattedInputChange(event.target.value);
                          setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, quantity: formatted } : item)));
                        }}
                        className="ai-input w-full px-3 py-2.5"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Harga Jual</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.unitPrice}
                        onChange={(event) => {
                          const { formatted } = handleFormattedInputChange(event.target.value);
                          setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, unitPrice: formatted } : item)));
                        }}
                        className="ai-input w-full px-3 py-2.5"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Mengubah penjualan ini akan langsung menyesuaikan stok, laporan hari terkait, dan sisa batch PB/FIFO yang sebelumnya dipakai oleh penjualan ini.
                </p>
              </div>
            </div>

            {formError && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                {formError}
              </p>
            )}
          </div>

          <div className="ai-divider" />
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Total Baru</p>
              <p className="text-2xl font-bold text-slate-900">Rp {formatNumber(total)}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(true)}
                disabled={isSaving || isDeleting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Hapus Penjualan
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || isDeleting}
                className="ai-button inline-flex items-center justify-center gap-2 px-4 py-3 font-semibold disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
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

      {isDeleteConfirmOpen && (
        <div className="ai-modal-shell">
          <div className="ai-modal-backdrop" onClick={() => setIsDeleteConfirmOpen(false)} />
          <div className="ai-modal-panel page-enter translate-y-0 scale-100">
            <div className="flex items-start gap-3 p-4">
              <div className="rounded-full bg-rose-100 p-2 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">Aksi Sangat Sensitif</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">Hapus penjualan ini?</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Penjualan akan dihapus, stok akan dikembalikan, laporan akan berubah, dan alokasi FIFO ke batch PB akan dibatalkan.
                </p>
              </div>
            </div>
            <div className="ai-divider" />
            <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="ai-button-ghost px-4 py-3 font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
              >
                <Pencil className="hidden h-4 w-4" />
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus Penjualan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
