import { Timestamp, collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { CalendarRange, History, PencilLine, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import { formatNumber, formatProductName } from '../../utils/format';
import {
  getEndExclusiveOfDay,
  getStartOfDay,
  toDateInputValue,
} from '../../features/sales/constants';
import DateRangeCalendar from './DateRangeCalendar';
import { mapSaleHistoryItem, type SaleHistoryItem } from '../../features/sales/saleTransactions';

interface SalesHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSale: (sale: SaleHistoryItem) => void;
}

type FilterMode = 'today' | 'single' | 'range';

export default function SalesHistoryModal({ isOpen, onClose, onSelectSale }: SalesHistoryModalProps) {
  const today = useMemo(() => new Date(), []);
  const [filterMode, setFilterMode] = useState<FilterMode>('today');
  const [singleDate, setSingleDate] = useState(toDateInputValue(today));
  const [rangeStartDate, setRangeStartDate] = useState(toDateInputValue(today));
  const [rangeEndDate, setRangeEndDate] = useState('');
  const [sales, setSales] = useState<SaleHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const loadSales = async () => {
      setIsLoading(true);
      try {
        let start = getStartOfDay(today);
        let end = getEndExclusiveOfDay(today);

        if (filterMode === 'single') {
          const picked = new Date(`${singleDate}T00:00:00`);
          start = getStartOfDay(picked);
          end = getEndExclusiveOfDay(picked);
        }

        if (filterMode === 'range') {
          const startPicked = new Date(`${rangeStartDate}T00:00:00`);
          const endPicked = new Date(`${(rangeEndDate || rangeStartDate)}T00:00:00`);
          start = getStartOfDay(startPicked <= endPicked ? startPicked : endPicked);
          end = getEndExclusiveOfDay(startPicked <= endPicked ? endPicked : startPicked);
        }

        const snapshot = await getDocs(query(
          collection(db, 'sales'),
          where('soldAt', '>=', Timestamp.fromDate(start)),
          where('soldAt', '<', Timestamp.fromDate(end)),
          orderBy('soldAt', 'desc'),
        ));

        setSales(snapshot.docs.map(mapSaleHistoryItem));
      } finally {
        setIsLoading(false);
      }
    };

    void loadSales();
  }, [filterMode, isOpen, rangeEndDate, rangeStartDate, singleDate, today]);

  const filteredSales = sales.filter((sale) => {
    if (!searchQuery.trim()) return true;
    const queryValue = searchQuery.trim().toLowerCase();
    return sale.items.some((item) =>
      formatProductName(item.productNameSnapshot).toLowerCase().includes(queryValue),
    );
  });

  if (!isOpen) return null;

  return (
    <div className="ai-modal-shell">
      <div className="ai-modal-backdrop" onClick={onClose} />
      <div className="ai-modal-panel page-enter translate-y-0 scale-100">
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Riwayat Penjualan</p>
            <h2 className="text-lg font-bold text-slate-900">Cari dan edit transaksi</h2>
          </div>
          <button onClick={onClose} className="ai-button-ghost rounded-full p-2 text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="ai-divider" />

        <div className="max-h-[75vh] space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setFilterMode('today')}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${filterMode === 'today' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('single')}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${filterMode === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              Tanggal
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('range')}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${filterMode === 'range' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              Rentang
            </button>
          </div>

          {filterMode === 'single' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Pilih Tanggal</label>
              <input
                type="date"
                value={singleDate}
                onChange={(event) => setSingleDate(event.target.value)}
                className="ai-input w-full px-3 py-2.5"
              />
            </div>
          )}

          {filterMode === 'range' && (
            <DateRangeCalendar
              startDate={rangeStartDate}
              endDate={rangeEndDate}
              onChange={({ startDate, endDate }) => {
                setRangeStartDate(startDate);
                setRangeEndDate(endDate);
              }}
            />
          )}

          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari nama produk di penjualan..."
              className="ai-input w-full py-3 pl-11 pr-4"
            />
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <p className="py-8 text-center text-slate-500">Memuat daftar penjualan...</p>
            ) : filteredSales.length === 0 ? (
              <div className="ai-empty-state">
                <CalendarRange className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-3 font-medium text-slate-900">Belum ada penjualan untuk filter ini.</p>
              </div>
            ) : (
              filteredSales.map((sale) => (
                <button
                  key={sale.id}
                  type="button"
                  onClick={() => onSelectSale(sale)}
                  className="ai-card ai-card-hover w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-sky-600" />
                        <p className="text-sm font-semibold text-slate-900">
                          {sale.soldAt.toLocaleString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{sale.paymentMethod}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-slate-900">Rp {formatNumber(sale.total)}</p>
                      <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sky-700">
                        <PencilLine className="h-3.5 w-3.5" />
                        Edit
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    {sale.items.slice(0, 3).map((item) => (
                      <p key={`${sale.id}-${item.productId}`}>
                        {formatProductName(item.productNameSnapshot)} · {formatNumber(item.quantity)} x Rp {formatNumber(item.unitPrice)}
                      </p>
                    ))}
                    {sale.items.length > 3 && (
                      <p className="text-xs font-medium text-slate-500">+ {sale.items.length - 3} item lainnya</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
