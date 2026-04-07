import { BellRing, BellOff, ChevronLeft } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { OwnerNotificationOutletContext } from '../components/Layout';
import { formatDateId } from '../utils/format';

export default function Notifications() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { notifications, unreadCount, markAllAsRead } = useOutletContext<OwnerNotificationOutletContext>();

  useEffect(() => {
    if (userProfile?.role === 'owner') {
      markAllAsRead();
    }
  }, [markAllAsRead, userProfile?.role]);

  if (userProfile?.role !== 'owner') {
    return (
      <section className="page-enter mx-auto w-full max-w-4xl px-4 py-6">
        <div className="glass-panel-strong rounded-[1.5rem] border border-sky-200/70 p-6 text-center">
          <BellOff className="mx-auto h-7 w-7 text-slate-400" />
          <h2 className="ai-heading mt-3 text-xl font-bold text-slate-900">Notifikasi Khusus Owner</h2>
          <p className="mt-2 text-sm text-slate-600">Halaman ini hanya tersedia untuk akun owner.</p>
          <button type="button" onClick={() => navigate('/')} className="ai-button-secondary mt-4 px-4 py-2 text-sm font-semibold">
            Kembali
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page-enter mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-6">
      <div className="glass-panel-strong relative overflow-hidden rounded-[1.75rem] border border-sky-200/70 p-4 sm:p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(135,206,250,0.22),transparent_38%)]" />

        <div className="relative flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="glass-panel inline-flex h-10 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:-translate-x-0.5"
          >
            <ChevronLeft className="h-4 w-4" />
            Kembali
          </button>
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/75 px-3 py-1 text-xs font-semibold text-sky-700">
            <BellRing className="h-3.5 w-3.5" />
            {unreadCount > 0 ? `${unreadCount} baru` : 'Semua sudah dibaca'}
          </span>
        </div>

        <div className="relative mt-4">
          <h1 className="ai-heading text-2xl font-bold text-slate-900">Notifikasi Staff</h1>
          <p className="mt-1 text-sm text-slate-600">Pantau aksi penjualan dan stok dari tim secara real-time.</p>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="stagger-fade-in mt-4 rounded-2xl border border-dashed border-slate-300/80 bg-white/60 px-5 py-10 text-center">
          <BellOff className="mx-auto h-7 w-7 text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-slate-700">Belum ada aktivitas staff terbaru.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {notifications.map((item, index) => (
            <article
              key={item.id}
              style={{ animationDelay: `${Math.min(index * 45, 260)}ms` }}
              className="stagger-fade-in glass-panel rounded-2xl border border-slate-200/80 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <time className="whitespace-nowrap text-xs text-slate-500">
                  {new Date(item.createdAtMillis).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
              <p className="mt-1 text-sm text-slate-600">{item.body}</p>
              <p className="mt-2 text-xs text-slate-500">{formatDateId(new Date(item.createdAtMillis))}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
