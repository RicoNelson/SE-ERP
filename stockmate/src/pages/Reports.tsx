import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, Timestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatNumber } from '../utils/format';
import { TrendingUp, PackageMinus, Clock, ShoppingBag, Siren, Activity, X } from 'lucide-react';
import { Link } from 'react-router-dom';

interface DailyStats {
  totalRevenue: number;
  totalItemsSold: number;
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
  productName?: string;
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

export default function Reports() {
  const [stats, setStats] = useState<DailyStats>({ totalRevenue: 0, totalItemsSold: 0 });
  const [productsSold, setProductsSold] = useState<ProductSoldStat[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [isSaleDetailLoading, setIsSaleDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    // 1. Fetch Today's Sales
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const salesQuery = query(
      collection(db, 'sales'),
      where('soldAt', '>=', Timestamp.fromDate(startOfToday))
    );

    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      let revenue = 0;
      let itemsSold = 0;
      const productStatsMap = new Map<string, ProductSoldStat>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        revenue += data.total || 0;
        
        // Sum up quantities from all items in this sale
        if (data.items && Array.isArray(data.items)) {
          data.items.forEach((item: any) => {
            itemsSold += item.quantity || 0;
            
            const existingStat = productStatsMap.get(item.productId) || {
              productId: item.productId,
              productName: item.productNameSnapshot,
              quantity: 0,
              revenue: 0
            };
            
            existingStat.quantity += item.quantity;
            existingStat.revenue += (item.quantity * item.unitPrice);
            productStatsMap.set(item.productId, existingStat);
          });
        }
      });

      setStats({ totalRevenue: revenue, totalItemsSold: itemsSold });
      setProductsSold(Array.from(productStatsMap.values()).sort((a, b) => b.quantity - a.quantity));
    });

    // 2. Fetch Low Stock Count
    const productsQuery = query(collection(db, 'products'));
    const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
      let lowCount = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.stockQty <= data.lowStockThreshold) {
          lowCount++;
        }
      });
      setLowStockCount(lowCount);
    });

    // 3. Fetch Recent Activity (Stock Movements)
    const activityQuery = query(
      collection(db, 'stock_movements'),
      orderBy('performedAt', 'desc')
    );
    
    // We only want the latest ~10 activities for the dashboard
    const unsubActivity = onSnapshot(activityQuery, async (snapshot) => {
      const activities: ActivityLog[] = [];
      let count = 0;
      
      for (const docSnapshot of snapshot.docs) {
        if (count >= 10) break;
        
        const data = docSnapshot.data();
        
        activities.push({
          id: docSnapshot.id,
          type: data.type,
          quantityChange: data.quantityChange,
          referenceId: data.referenceId,
          referenceType: data.referenceType,
          performedAt: data.performedAt?.toDate() || new Date(),
        });
        count++;
      }
      
      setRecentActivity(activities);
      setLoading(false);
    });

    return () => {
      unsubSales();
      unsubProducts();
      unsubActivity();
    };
  }, []);

  if (loading) {
    return <div className="p-4 text-center text-slate-500 mt-10">Memuat laporan...</div>;
  }

  return (
    <div className="ai-page page-enter">
      <section className="ai-card ai-page-hero stagger-fade-in">
        <p className="ai-kicker mb-2">Laporan Harian</p>
        <h2 className="ai-heading text-2xl font-bold text-slate-900">Ringkasan Hari Ini</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Ikhtisar performa penjualan, stok kritis, dan aktivitas operasional dalam satu tampilan yang rapi dan mudah dibaca.
        </p>
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
            <div className="p-6 text-center text-sm text-slate-400">Belum ada produk terjual hari ini</div>
          ) : (
            <div className="divide-y divide-white/6">
              {productsSold.map((prod, index) => (
                <div key={prod.productId} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium leading-tight text-slate-900">{prod.productName}</p>
                    <p className="mt-1 text-xs text-slate-400">Rp {formatNumber(prod.revenue)}</p>
                  </div>
                  <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-1 text-lg font-bold text-slate-900">
                    #{index + 1} · {formatNumber(prod.quantity)}
                  </div>
                </div>
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
            <div className="p-6 text-center text-sm text-slate-400">Belum ada aktivitas hari ini</div>
          ) : (
            <div className="divide-y divide-white/6">
              {recentActivity.map((activity) => {
                const isSale = activity.type === 'sale';
                const canOpenSaleDetail = isSale && activity.referenceType === 'sale' && !!activity.referenceId;
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
                            Penjualan
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {activity.performedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} · Ketuk untuk detail
                          </p>
                        </button>
                      ) : (
                        <>
                          <p className="font-medium text-slate-900">
                            {isSale ? 'Penjualan' : 'Penyesuaian Stok'}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {activity.performedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
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
                      <p className="font-medium text-slate-900">{item.productNameSnapshot}</p>
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
    </div>
  );
}
