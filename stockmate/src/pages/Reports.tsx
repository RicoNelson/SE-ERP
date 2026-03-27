import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, where, orderBy, onSnapshot, Timestamp, doc, getDoc, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatNumber, formatProductName, handleFormattedInputChange, parseNumber } from '../utils/format';
import { TrendingUp, PackageMinus, Clock, ShoppingBag, Siren, Activity, X, WalletCards, HandCoins } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface DailyStats {
  totalRevenue: number;
  totalItemsSold: number;
  totalCogs: number;
}

interface ProductSoldStat {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
}

interface ActivityLog {
  id: string;
  type: string;
  quantityChange: number;
  productId?: string;
  productName?: string;
  note?: string;
  performedAt: Date;
  referenceId?: string;
  referenceType?: string;
}

interface SaleDetailItem {
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  unitPrice: number;
}

interface SaleDetail {
  id: string;
  items: SaleDetailItem[];
  total: number;
  soldAt: Date;
  paymentMethod?: string;
}

interface PurchaseDetailItem {
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  unitCost: number;
  sellPrice: number;
  subtotal: number;
}

interface PurchaseDetail {
  id: string;
  receiptCode?: string;
  receiptDate: Date;
  supplierName?: string;
  note?: string;
  items: PurchaseDetailItem[];
  totalAmount: number;
}

interface ExpenseRecord {
  id: string;
  amount: number;
  category: string;
  note?: string;
  spentAt: Date;
}

interface ProductDetailEntry {
  id: string;
  type: 'sale' | 'opname' | 'pb';
  performedAt: Date;
  quantity: number;
  unitPrice?: number;
  total?: number;
  paymentMethod?: string;
  note?: string;
  receiptCode?: string;
  supplierName?: string;
}

const EXPENSE_CATEGORIES = [
  'Biaya Kirim Barang',
  'Tip Kurir',
  'Parkir',
  'Pulsa / Data',
  'Makan Staff',
  'Lainnya',
];

const toDateInputValue = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const parseDateInput = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default function Reports() {
  const today = useMemo(() => new Date(), []);
  const yesterday = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() - 1);
    return next;
  }, []);
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('single');
  const [singleDate, setSingleDate] = useState(toDateInputValue(today));
  const [rangeStartDate, setRangeStartDate] = useState(toDateInputValue(today));
  const [rangeEndDate, setRangeEndDate] = useState(toDateInputValue(today));
  const [stats, setStats] = useState<DailyStats>({ totalRevenue: 0, totalItemsSold: 0, totalCogs: 0 });
  const [productsSold, setProductsSold] = useState<ProductSoldStat[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [productNameById, setProductNameById] = useState<Record<string, string>>({});
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [isSaleDetailLoading, setIsSaleDetailLoading] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseDetail | null>(null);
  const [isPurchaseDetailLoading, setIsPurchaseDetailLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductSoldStat | null>(null);
  const [productDetailEntries, setProductDetailEntries] = useState<ProductDetailEntry[]>([]);
  const [isProductDetailLoading, setIsProductDetailLoading] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [expenseFieldErrors, setExpenseFieldErrors] = useState<{ expenseCategory?: string; expenseAmount?: string }>({});
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
  const grossProfit = stats.totalRevenue - stats.totalCogs;
  const netPnl = grossProfit - totalExpenses;
  const pnlMargin = stats.totalRevenue > 0 ? (netPnl / stats.totalRevenue) * 100 : 0;
  const selectedStartDate = dateFilterMode === 'single' ? singleDate : rangeStartDate;
  const selectedEndDate = dateFilterMode === 'single' ? singleDate : rangeEndDate;
  const filterLabel = dateFilterMode === 'single'
    ? new Date(`${singleDate}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    : `${new Date(`${rangeStartDate}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} - ${new Date(`${rangeEndDate}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const getFilterDateRange = useCallback(() => {
    const startDateRaw = parseDateInput(selectedStartDate);
    const endDateRaw = parseDateInput(selectedEndDate);
    if (!startDateRaw || !endDateRaw) return null;

    const normalizedStartDate = new Date(startDateRaw);
    const normalizedEndDate = new Date(endDateRaw);
    normalizedStartDate.setHours(0, 0, 0, 0);
    normalizedEndDate.setHours(0, 0, 0, 0);
    if (normalizedEndDate < normalizedStartDate) return null;

    const endExclusive = new Date(normalizedEndDate);
    endExclusive.setDate(endExclusive.getDate() + 1);

    return { normalizedStartDate, endExclusive };
  }, [selectedStartDate, selectedEndDate]);

  const handleOpenSaleDetail = async (activity: ActivityLog) => {
    if (activity.type !== 'sale' || !activity.referenceId) return;

    setIsSaleDetailLoading(true);
    try {
      const saleRef = doc(db, 'sales', activity.referenceId);
      const saleSnapshot = await getDoc(saleRef);

      if (!saleSnapshot.exists()) {
        alert('Detail penjualan tidak ditemukan.');
        return;
      }

      const saleData = saleSnapshot.data();
      setSelectedSale({
        id: saleSnapshot.id,
        items: Array.isArray(saleData.items) ? saleData.items : [],
        total: saleData.total || 0,
        soldAt: saleData.soldAt?.toDate?.() || activity.performedAt,
        paymentMethod: saleData.paymentMethod || 'Tidak diketahui',
      });
    } catch (error) {
      console.error('Error loading sale detail:', error);
      alert('Gagal memuat detail penjualan.');
    } finally {
      setIsSaleDetailLoading(false);
    }
  };

  const handleOpenPurchaseDetail = async (activity: ActivityLog) => {
    const isPbActivity = activity.type === 'stock_in' && activity.referenceType === 'purchase_order';
    if (!isPbActivity || !activity.referenceId) return;

    setIsPurchaseDetailLoading(true);
    try {
      const purchaseRef = doc(db, 'purchases', activity.referenceId);
      const purchaseSnapshot = await getDoc(purchaseRef);

      if (!purchaseSnapshot.exists()) {
        alert('Detail PB tidak ditemukan.');
        return;
      }

      const purchaseData = purchaseSnapshot.data();
      setSelectedPurchase({
        id: purchaseSnapshot.id,
        receiptCode: purchaseData.receiptCode || '',
        receiptDate: purchaseData.receiptDate?.toDate?.() || activity.performedAt,
        supplierName: purchaseData.supplierName || '',
        note: purchaseData.note || '',
        items: Array.isArray(purchaseData.items) ? purchaseData.items : [],
        totalAmount: purchaseData.totalAmount || 0,
      });
    } catch (error) {
      console.error('Error loading purchase detail:', error);
      alert('Gagal memuat detail PB.');
    } finally {
      setIsPurchaseDetailLoading(false);
    }
  };

  const handleOpenProductDetail = async (product: ProductSoldStat) => {
    const range = getFilterDateRange();
    if (!range) return;

    setSelectedProduct(product);
    setProductDetailEntries([]);
    setIsProductDetailLoading(true);

    try {
      const salesQuery = query(
        collection(db, 'sales'),
        where('soldAt', '>=', Timestamp.fromDate(range.normalizedStartDate)),
        where('soldAt', '<', Timestamp.fromDate(range.endExclusive)),
        orderBy('soldAt', 'desc')
      );
      const adjustmentsQuery = query(
        collection(db, 'stock_movements'),
        where('performedAt', '>=', Timestamp.fromDate(range.normalizedStartDate)),
        where('performedAt', '<', Timestamp.fromDate(range.endExclusive)),
        orderBy('performedAt', 'desc')
      );

      const [salesSnapshot, adjustmentsSnapshot] = await Promise.all([
        getDocs(salesQuery),
        getDocs(adjustmentsQuery),
      ]);

      const saleEntries: ProductDetailEntry[] = [];
      salesSnapshot.docs.forEach((saleDoc) => {
        const saleData = saleDoc.data();
        const soldAt = saleData.soldAt?.toDate?.() || new Date();
        const paymentMethod = saleData.paymentMethod || 'Tidak diketahui';
        const items = Array.isArray(saleData.items) ? saleData.items : [];

        items.forEach((item: { productId?: string; quantity?: number; unitPrice?: number; }) => {
          if (item.productId !== product.productId) return;
          const quantity = item.quantity || 0;
          const unitPrice = item.unitPrice || 0;
          saleEntries.push({
            id: saleDoc.id,
            type: 'sale',
            performedAt: soldAt,
            quantity,
            unitPrice,
            total: quantity * unitPrice,
            paymentMethod,
          });
        });
      });

      const movementEntries: ProductDetailEntry[] = adjustmentsSnapshot.docs.flatMap((adjustmentDoc) => {
          const data = adjustmentDoc.data();
          if (data.productId !== product.productId) return [];
          const isOpname = data.type === 'adjustment' && data.referenceType === 'stock_opname';
          const isPb = data.type === 'stock_in' && data.referenceType === 'purchase_order';
          if (!isOpname && !isPb) return [];

          return [{
            id: adjustmentDoc.id,
            type: isOpname ? 'opname' as const : 'pb' as const,
            performedAt: data.performedAt?.toDate?.() || new Date(),
            quantity: data.quantityChange || 0,
            note: data.note || '',
            receiptCode: data.receiptCode || '',
            supplierName: data.supplierName || '',
          }];
        });

      const merged = [...saleEntries, ...movementEntries].sort(
        (a, b) => b.performedAt.getTime() - a.performedAt.getTime()
      );
      setProductDetailEntries(merged);
    } catch (error) {
      console.error('Error loading product details in report:', error);
      alert('Gagal memuat detail produk.');
    } finally {
      setIsProductDetailLoading(false);
    }
  };

  const handleSaveExpense = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const amount = parseNumber(expenseAmount);
    if (isSavingExpense) return;

    const nextFieldErrors: { expenseCategory?: string; expenseAmount?: string } = {};
    if (!expenseCategory.trim()) nextFieldErrors.expenseCategory = 'Kategori biaya wajib dipilih.';
    if (!expenseAmount.trim()) nextFieldErrors.expenseAmount = 'Nominal biaya wajib diisi.';
    else if (amount <= 0) nextFieldErrors.expenseAmount = 'Nominal biaya harus lebih dari 0.';
    if (Object.keys(nextFieldErrors).length > 0) {
      setExpenseFieldErrors(nextFieldErrors);
      return;
    }
    setExpenseFieldErrors({});

    setIsSavingExpense(true);
    try {
      await addDoc(collection(db, 'operating_expenses'), {
        amount,
        category: expenseCategory,
        note: expenseNote.trim(),
        spentAt: serverTimestamp(),
        createdBy: currentUser?.uid || 'unknown',
        createdAt: serverTimestamp(),
      });
      setExpenseAmount('');
      setExpenseNote('');
      setExpenseFieldErrors({});
    } catch (error) {
      console.error('Error saving expense:', error);
      alert('Gagal menyimpan biaya. Silakan coba lagi.');
    } finally {
      setIsSavingExpense(false);
    }
  };

  useEffect(() => {
    const range = getFilterDateRange();
    if (!range) return;
    const { normalizedStartDate, endExclusive } = range;

    setLoading(true);

    const salesQuery = query(
      collection(db, 'sales'),
      where('soldAt', '>=', Timestamp.fromDate(normalizedStartDate)),
      where('soldAt', '<', Timestamp.fromDate(endExclusive)),
      orderBy('soldAt', 'desc')
    );

    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      let revenue = 0;
      let itemsSold = 0;
      let cogs = 0;
      const productStatsMap = new Map<string, ProductSoldStat>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        revenue += data.total || 0;

        if (data.items && Array.isArray(data.items)) {
          data.items.forEach((item: { productId?: string; productNameSnapshot?: string; quantity?: number; unitPrice?: number; costPrice?: number; totalCost?: number; }) => {
            const quantity = item.quantity || 0;
            const unitPrice = item.unitPrice || 0;
            const costPrice = item.costPrice || 0;
            const productId = item.productId || 'unknown-product';

            itemsSold += quantity;
            cogs += item.totalCost ?? (quantity * costPrice);

            const existingStat = productStatsMap.get(productId) || {
              productId,
              productName: formatProductName(item.productNameSnapshot || 'Produk'),
              quantity: 0,
              revenue: 0
            };

            existingStat.quantity += quantity;
            existingStat.revenue += quantity * unitPrice;
            productStatsMap.set(productId, existingStat);
          });
        }
      });

      setStats({ totalRevenue: revenue, totalItemsSold: itemsSold, totalCogs: cogs });
      setProductsSold(Array.from(productStatsMap.values()).sort((a, b) => b.quantity - a.quantity));
    });

    const expensesQuery = query(
      collection(db, 'operating_expenses'),
      where('spentAt', '>=', Timestamp.fromDate(normalizedStartDate)),
      where('spentAt', '<', Timestamp.fromDate(endExclusive)),
      orderBy('spentAt', 'desc')
    );
    const unsubExpenses = onSnapshot(expensesQuery, (snapshot) => {
      const todayExpenses: ExpenseRecord[] = snapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data();
        return {
          id: docSnapshot.id,
          amount: data.amount || 0,
          category: data.category || 'Lainnya',
          note: data.note || '',
          spentAt: data.spentAt?.toDate?.() || new Date(),
        };
      });
      setExpenses(todayExpenses);
    });

    const productsQuery = query(collection(db, 'products'));
    const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
      let lowCount = 0;
      const names: Record<string, string> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        names[doc.id] = formatProductName(data.name || 'Produk');
        if (data.stockQty <= data.lowStockThreshold) {
          lowCount++;
        }
      });
      setProductNameById(names);
      setLowStockCount(lowCount);
    });

    const activityQuery = query(
      collection(db, 'stock_movements'),
      where('performedAt', '>=', Timestamp.fromDate(normalizedStartDate)),
      where('performedAt', '<', Timestamp.fromDate(endExclusive)),
      orderBy('performedAt', 'desc')
    );

    const unsubActivity = onSnapshot(activityQuery, async (snapshot) => {
      const activities: ActivityLog[] = [];
      let count = 0;

      for (const docSnapshot of snapshot.docs) {
        if (count >= 30) break;

        const data = docSnapshot.data();

        activities.push({
          id: docSnapshot.id,
          type: data.type,
          quantityChange: data.quantityChange,
          productId: data.productId,
          referenceId: data.referenceId,
          referenceType: data.referenceType,
          note: data.note,
          performedAt: data.performedAt?.toDate() || new Date(),
        });
        count++;
      }
      
      setRecentActivity(activities);
      setLoading(false);
    });

    return () => {
      unsubSales();
      unsubExpenses();
      unsubProducts();
      unsubActivity();
    };
  }, [selectedStartDate, selectedEndDate, getFilterDateRange]);

  if (loading) {
    return <div className="p-4 text-center text-slate-500 mt-10">Memuat laporan...</div>;
  }

  return (
    <div className="ai-page page-enter">
      <section className="ai-card ai-page-hero stagger-fade-in">
        <p className="ai-kicker mb-2">Laporan Periode</p>
        <h2 className="ai-heading text-2xl font-bold text-slate-900">Ringkasan {filterLabel}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Ikhtisar performa penjualan, stok kritis, dan aktivitas operasional dalam satu tampilan yang rapi dan mudah dibaca.
        </p>
      </section>

      <section className="ai-card mt-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDateFilterMode('single');
              setSingleDate(toDateInputValue(today));
            }}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${dateFilterMode === 'single' && singleDate === toDateInputValue(today) ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            Hari Ini
          </button>
          <button
            type="button"
            onClick={() => {
              setDateFilterMode('single');
              setSingleDate(toDateInputValue(yesterday));
            }}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${dateFilterMode === 'single' && singleDate === toDateInputValue(yesterday) ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            Kemarin
          </button>
          <button
            type="button"
            onClick={() => setDateFilterMode('single')}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${dateFilterMode === 'single' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            Per Tanggal
          </button>
          <button
            type="button"
            onClick={() => setDateFilterMode('range')}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${dateFilterMode === 'range' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            Rentang Tanggal
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {dateFilterMode === 'single' ? (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Tanggal</label>
              <input
                type="date"
                className="ai-input w-full px-3 py-2.5"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Dari Tanggal</label>
                <input
                  type="date"
                  className="ai-input w-full px-3 py-2.5"
                  value={rangeStartDate}
                  onChange={(e) => setRangeStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Sampai Tanggal</label>
                <input
                  type="date"
                  className="ai-input w-full px-3 py-2.5"
                  value={rangeEndDate}
                  min={rangeStartDate}
                  onChange={(e) => setRangeEndDate(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="ai-card ai-card-hover stagger-fade-in p-4" style={{ animationDelay: '60ms' }}>
          <div className="mb-4 flex items-center gap-3 text-slate-600">
            <div className="ai-stat-orb">
              <TrendingUp className="h-4 w-4 text-emerald-300" />
            </div>
            <span className="text-sm font-medium">Penjualan</span>
          </div>
          <div className="text-xl font-bold text-slate-900">
            Rp {formatNumber(stats.totalRevenue)}
          </div>
        </div>
        
        <div className="ai-card ai-card-hover stagger-fade-in p-4" style={{ animationDelay: '120ms' }}>
          <div className="mb-4 flex items-center gap-3 text-slate-600">
            <div className="ai-stat-orb">
              <PackageMinus className="h-4 w-4 text-sky-700" />
            </div>
            <span className="text-sm font-medium">Item Terjual</span>
          </div>
          <div className="text-xl font-bold text-slate-900">
            {formatNumber(stats.totalItemsSold)}
          </div>
        </div>

        <div className="ai-card ai-card-hover stagger-fade-in p-4" style={{ animationDelay: '180ms' }}>
          <div className="mb-4 flex items-center gap-3 text-slate-600">
            <div className="ai-stat-orb">
              <WalletCards className="h-4 w-4 text-emerald-300" />
            </div>
            <span className="text-sm font-medium">Laba Kotor</span>
          </div>
          <div className="text-xl font-bold text-slate-900">
            Rp {formatNumber(grossProfit)}
          </div>
        </div>

        <div className="ai-card ai-card-hover stagger-fade-in p-4" style={{ animationDelay: '240ms' }}>
          <div className="mb-4 flex items-center gap-3 text-slate-600">
            <div className="ai-stat-orb">
              <HandCoins className="h-4 w-4 text-rose-300" />
            </div>
            <span className="text-sm font-medium">Margin PnL</span>
          </div>
          <div className={`text-xl font-bold ${netPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            Rp {formatNumber(netPnl)}
          </div>
          <p className={`mt-1 text-xs font-semibold ${netPnl >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
            {pnlMargin.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="mt-6 mb-8">
        <div className="ai-section-title">
          <div className="flex items-center gap-3">
            <div className="ai-stat-orb">
              <HandCoins className="h-5 w-5 text-sky-700" />
            </div>
            <h3 className="font-bold text-slate-900">Biaya Operasional ({filterLabel})</h3>
          </div>
          <span className="text-sm font-semibold text-slate-500">Rp {formatNumber(totalExpenses)}</span>
        </div>
        <div className="ai-card p-4">
          <form onSubmit={handleSaveExpense}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Kategori</label>
                <div className="relative">
                  <select
                    value={expenseCategory}
                    onChange={(e) => {
                      setExpenseCategory(e.target.value);
                      setExpenseFieldErrors((prev) => ({ ...prev, expenseCategory: undefined }));
                    }}
                    className={`ai-select w-full appearance-none py-3 pl-4 pr-10 font-medium transition-colors duration-200 ${expenseFieldErrors.expenseCategory ? 'ai-select-error' : ''}`}
                    aria-invalid={Boolean(expenseFieldErrors.expenseCategory)}
                    aria-describedby={expenseFieldErrors.expenseCategory ? 'expense-category-error' : undefined}
                  >
                    {EXPENSE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                {expenseFieldErrors.expenseCategory && (
                  <p id="expense-category-error" className="ai-field-error mt-1 text-xs">
                    {expenseFieldErrors.expenseCategory}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Nominal</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={expenseAmount}
                  onChange={(e) => {
                    const { formatted } = handleFormattedInputChange(e.target.value);
                    setExpenseAmount(formatted);
                    setExpenseFieldErrors((prev) => ({ ...prev, expenseAmount: undefined }));
                  }}
                  className={`ai-input w-full px-4 py-3 transition-colors duration-200 ${expenseFieldErrors.expenseAmount ? 'ai-input-error' : ''}`}
                  placeholder="Contoh: 35.000"
                  aria-invalid={Boolean(expenseFieldErrors.expenseAmount)}
                  aria-describedby={expenseFieldErrors.expenseAmount ? 'expense-amount-error' : undefined}
                />
                {expenseFieldErrors.expenseAmount && (
                  <p id="expense-amount-error" className="ai-field-error mt-1 text-xs">
                    {expenseFieldErrors.expenseAmount}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Catatan</label>
                <input
                  type="text"
                  value={expenseNote}
                  onChange={(e) => setExpenseNote(e.target.value)}
                  className="ai-input w-full px-4 py-3"
                  placeholder="Opsional"
                />
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={isSavingExpense}
                className="rounded-lg border border-sky-600 bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingExpense ? 'Menyimpan...' : 'Simpan Biaya'}
              </button>
            </div>
          </form>

          <div className="ai-divider my-4" />

          {expenses.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada biaya pada periode ini.</p>
          ) : (
            <div className="space-y-2">
              {expenses.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between rounded-xl border border-slate-200/80 px-3 py-2.5">
                  <div className="pr-4">
                    <p className="text-sm font-semibold text-slate-900">{expense.category}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {expense.spentAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      {expense.note ? ` · ${expense.note}` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-rose-600">- Rp {formatNumber(expense.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 mb-8">
        <div className="ai-section-title">
          <div className="flex items-center gap-3">
            <div className="ai-stat-orb">
              <ShoppingBag className="h-5 w-5 text-sky-700" />
            </div>
            <h3 className="font-bold text-slate-900">Detail Produk Terjual</h3>
          </div>
        </div>
        <div className="ai-card overflow-hidden">
          {productsSold.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">Belum ada produk terjual pada periode ini</div>
          ) : (
            <div className="divide-y divide-white/6">
              {productsSold.map((prod, index) => (
                <button
                  key={prod.productId}
                  type="button"
                  onClick={() => handleOpenProductDetail(prod)}
                  className="w-full p-4 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium leading-tight text-slate-900">{formatProductName(prod.productName)}</p>
                    <p className="mt-1 text-xs text-slate-400">Rp {formatNumber(prod.revenue)} · Ketuk untuk detail</p>
                  </div>
                  <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-1 text-lg font-bold text-slate-900">
                    #{index + 1} · {formatNumber(prod.quantity)}
                  </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-8">
        <div className="ai-section-title">
          <div className="flex items-center gap-3">
            <div className="ai-stat-orb">
              <Siren className="h-5 w-5 text-rose-300" />
            </div>
            <h3 className="font-bold text-slate-900">Peringatan</h3>
          </div>
        </div>
        {lowStockCount > 0 ? (
          <div className="flex items-center justify-between rounded-[1.5rem] border border-rose-300/16 bg-rose-400/10 p-4">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-rose-300 animate-pulse"></div>
              <span className="font-medium text-rose-700">{lowStockCount} Item Stok Menipis</span>
            </div>
            <Link to="/stock" className="ai-button-ghost px-3 py-2 text-sm font-bold text-rose-600">
              Lihat
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-[1.5rem] border border-emerald-300/14 bg-emerald-400/10 p-4">
            <div className="h-2 w-2 rounded-full bg-emerald-300"></div>
            <span className="font-medium text-emerald-700">Semua stok dalam kondisi aman</span>
          </div>
        )}
      </div>

      <div>
        <div className="ai-section-title">
          <div className="flex items-center gap-3">
            <div className="ai-stat-orb">
              <Activity className="h-5 w-5 text-sky-700" />
            </div>
            <h3 className="font-bold text-slate-900">Aktivitas Terkini</h3>
          </div>
          <Clock className="h-5 w-5 text-slate-400" />
        </div>
        
        <div className="ai-card overflow-hidden">
          {recentActivity.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">Belum ada aktivitas pada periode ini</div>
          ) : (
            <div className="divide-y divide-white/6">
              {recentActivity.map((activity) => {
                const isSale = activity.type === 'sale';
                const canOpenSaleDetail = isSale && activity.referenceType === 'sale' && !!activity.referenceId;
                const isPb = activity.type === 'stock_in' && activity.referenceType === 'purchase_order';
                const canOpenPbDetail = isPb && !!activity.referenceId;
                const productName = activity.productId ? productNameById[activity.productId] : undefined;
                return (
                  <div key={activity.id} className="p-4 flex items-center justify-between">
                    <div className="flex-1 pr-4">
                      {canOpenSaleDetail ? (
                        <button
                          onClick={() => handleOpenSaleDetail(activity)}
                          disabled={isSaleDetailLoading}
                          className="text-left"
                        >
                          <p className="font-medium text-sky-700 underline decoration-sky-200 underline-offset-2">
                            Penjualan {productName ? `· ${formatProductName(productName)}` : ''}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {activity.performedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} · Ketuk untuk detail
                          </p>
                        </button>
                      ) : canOpenPbDetail ? (
                        <button
                          onClick={() => handleOpenPurchaseDetail(activity)}
                          disabled={isPurchaseDetailLoading}
                          className="text-left"
                        >
                          <p className="font-medium text-indigo-700 underline decoration-indigo-200 underline-offset-2">
                            PB / Penambahan Stok {productName ? `· ${formatProductName(productName)}` : ''}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {activity.performedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            {activity.note ? ` · ${activity.note}` : ''}
                            {' · Ketuk untuk detail'}
                          </p>
                        </button>
                      ) : (
                        <>
                          <p className="font-medium text-slate-900">
                            {isSale ? 'Penjualan' : isPb ? 'PB / Penambahan Stok' : 'Penyesuaian Stok'} {productName ? `· ${formatProductName(productName)}` : ''}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {activity.performedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            {activity.note ? ` · ${activity.note}` : ''}
                          </p>
                        </>
                      )}
                    </div>
                    <div className={`font-bold ${isSale ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {activity.quantityChange > 0 ? '+' : ''}{activity.quantityChange}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedSale && (
        <div className="ai-modal-shell">
          <div className="ai-modal-backdrop" onClick={() => setSelectedSale(null)} />
          <div className="ai-modal-panel page-enter translate-y-0 scale-100">
            <div className="flex items-center justify-between p-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Detail Penjualan</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selectedSale.soldAt.toLocaleString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <button onClick={() => setSelectedSale(null)} className="ai-button-ghost rounded-full p-2 text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="ai-divider" />
            <div className="max-h-[60vh] overflow-y-auto p-4">
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Metode Pembayaran</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selectedSale.paymentMethod}</p>
              </div>

              {selectedSale.items.length === 0 ? (
                <p className="text-sm text-slate-500">Tidak ada item pada transaksi ini.</p>
              ) : (
                <div className="space-y-3">
                  {selectedSale.items.map((item, idx) => (
                    <div key={`${selectedSale.id}-${item.productId}-${idx}`} className="rounded-xl border border-slate-200/80 p-3">
                      <p className="font-medium text-slate-900">{formatProductName(item.productNameSnapshot)}</p>
                      <div className="mt-1 flex items-center justify-between text-sm">
                        <span className="text-slate-500">{formatNumber(item.quantity)} x Rp {formatNumber(item.unitPrice)}</span>
                        <span className="font-semibold text-slate-900">Rp {formatNumber(item.quantity * item.unitPrice)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="ai-divider my-4" />

              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-700">Total</p>
                <p className="text-lg font-bold text-slate-900">Rp {formatNumber(selectedSale.total)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedPurchase && (
        <div className="ai-modal-shell">
          <div className="ai-modal-backdrop" onClick={() => setSelectedPurchase(null)} />
          <div className="ai-modal-panel page-enter translate-y-0 scale-100">
            <div className="flex items-center justify-between p-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Detail PB</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selectedPurchase.receiptDate.toLocaleString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <button onClick={() => setSelectedPurchase(null)} className="ai-button-ghost rounded-full p-2 text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="ai-divider" />
            <div className="max-h-[60vh] overflow-y-auto p-4">
              <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p><span className="font-semibold">Ref PB:</span> {selectedPurchase.id}</p>
                <p><span className="font-semibold">Kode Struk:</span> {selectedPurchase.receiptCode || '-'}</p>
                <p><span className="font-semibold">Supplier:</span> {selectedPurchase.supplierName || '-'}</p>
                <p><span className="font-semibold">Catatan:</span> {selectedPurchase.note || '-'}</p>
              </div>

              {selectedPurchase.items.length === 0 ? (
                <p className="text-sm text-slate-500">Tidak ada item pada PB ini.</p>
              ) : (
                <div className="space-y-3">
                  {selectedPurchase.items.map((item, idx) => (
                    <div key={`${selectedPurchase.id}-${item.productId}-${idx}`} className="rounded-xl border border-slate-200/80 p-3">
                      <p className="font-medium text-slate-900">{formatProductName(item.productNameSnapshot)}</p>
                      <div className="mt-1 flex items-center justify-between text-sm">
                        <span className="text-slate-500">{formatNumber(item.quantity)} x Rp {formatNumber(item.unitCost)}</span>
                        <span className="font-semibold text-slate-900">Rp {formatNumber(item.subtotal)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Harga Jual Snapshot: Rp {formatNumber(item.sellPrice)}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="ai-divider my-4" />

              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-700">Total PB</p>
                <p className="text-lg font-bold text-slate-900">Rp {formatNumber(selectedPurchase.totalAmount)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedProduct && (
        <div className="ai-modal-shell">
          <div className="ai-modal-backdrop" onClick={() => setSelectedProduct(null)} />
          <div className="ai-modal-panel page-enter translate-y-0 scale-100">
            <div className="flex items-center justify-between p-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Detail Produk</h2>
                <p className="mt-0.5 text-sm text-slate-600">{formatProductName(selectedProduct.productName)}</p>
                <p className="mt-0.5 text-xs text-slate-500">Periode {filterLabel}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="ai-button-ghost rounded-full p-2 text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="ai-divider" />
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {isProductDetailLoading ? (
                <p className="text-sm text-slate-500">Memuat detail produk...</p>
              ) : productDetailEntries.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada detail transaksi pada periode ini.</p>
              ) : (
                <div className="space-y-3">
                  {productDetailEntries.map((entry, idx) => {
                    const isSaleEntry = entry.type === 'sale';
                    const isOpnameEntry = entry.type === 'opname';
                    return (
                      <div key={`${entry.id}-${idx}`} className="rounded-xl border border-slate-200/80 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className={`text-sm font-semibold ${isSaleEntry ? 'text-sky-700' : isOpnameEntry ? 'text-emerald-700' : 'text-indigo-700'}`}>
                              {isSaleEntry ? 'Penjualan' : isOpnameEntry ? 'Penyesuaian Stok (OPNAME)' : 'Penambahan Stok (PB)'}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {entry.performedAt.toLocaleString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                          <div className={`text-sm font-bold ${entry.quantity < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                            {entry.quantity > 0 ? '+' : ''}{formatNumber(entry.quantity)}
                          </div>
                        </div>
                        {isSaleEntry ? (
                          <div className="mt-2 text-sm text-slate-600">
                            <p>#{entry.id}</p>
                            <p>{formatNumber(Math.abs(entry.quantity))} x Rp {formatNumber(entry.unitPrice || 0)}</p>
                            <p className="font-semibold text-slate-900">Total Rp {formatNumber(entry.total || 0)}</p>
                            <p className="text-xs text-slate-500">Metode: {entry.paymentMethod}</p>
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-slate-600">
                            <p>Ref: {entry.id}</p>
                            {entry.type === 'pb' && (
                              <p>
                                {entry.receiptCode ? `Struk ${entry.receiptCode}` : 'PB'}
                                {entry.supplierName ? ` • ${entry.supplierName}` : ''}
                              </p>
                            )}
                            <p>{entry.note || 'Penyesuaian stok manual.'}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
