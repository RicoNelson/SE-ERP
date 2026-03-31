import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Package,
  BarChart3,
  User as UserIcon,
  Users,
  Download,
  BellRing,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { useOwnerSaleNotifications } from '../hooks/useOwnerSaleNotifications';

export default function Layout() {
  const storeName = import.meta.env.VITE_STORE_NAME || 'SE ERP';
  const { currentUser, userProfile, loading } = useAuth();
  const navigate = useNavigate();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useOwnerSaleNotifications(currentUser?.uid, userProfile);

  useEffect(() => {
    if (!loading && !currentUser) {
      navigate('/login');
    }
  }, [currentUser, loading, navigate]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (loading || !currentUser) return null;

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const navItems = [
    { to: '/', icon: ShoppingCart, label: 'Jual' },
    { to: '/stock', icon: Package, label: 'Stok' },
    { to: '/reports', icon: BarChart3, label: 'Laporan' },
  ];

  // Add Pegawai tab only for owners
  if (userProfile?.role === 'owner') {
    navItems.push({ to: '/users', icon: Users, label: 'Pegawai' });
  }

  // Profile always last
  navItems.push({ to: '/profile', icon: UserIcon, label: 'Profil' });

  return (
    <div className="ai-shell flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-sky-200/60 bg-white/70 px-4 pb-4 pt-safe backdrop-blur-xl">
        <div className="glass-panel-strong mx-auto mt-3 flex max-w-6xl items-center justify-between rounded-[1.75rem] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-300/35 bg-sky-100 text-sky-700 shadow-[0_16px_30px_rgba(104,160,255,0.14)]">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="ai-kicker mb-1">Manajemen Toko</p>
              <h1 className="ai-heading text-lg font-bold text-slate-900">{storeName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {installPrompt && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="ai-button-secondary inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold"
              >
                <Download className="h-4 w-4 text-sky-600" />
                Pasang
              </button>
            )}
            <div className="glass-panel flex h-11 w-11 items-center justify-center rounded-2xl text-slate-700">
              <div className="relative">
                <BellRing className="h-4 w-4" />
                <span className="ai-badge-live absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_18px_rgba(255,107,157,0.7)]" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 z-20 w-full px-4 pb-safe">
        <div className="glass-panel-strong mx-auto mb-3 flex h-[78px] max-w-6xl items-center justify-around rounded-[1.9rem] px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `group flex h-full w-full flex-col items-center justify-center rounded-2xl space-y-1 ${
                  isActive ? 'text-sky-600' : 'text-slate-500 hover:text-slate-700'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition-all duration-300 ${
                      isActive
                        ? 'border-sky-300/40 bg-sky-100 shadow-[0_14px_28px_rgba(104,160,255,0.14)] -translate-y-0.5'
                        : 'border-transparent bg-white/0 group-hover:bg-sky-50 group-hover:-translate-y-0.5'
                    }`}
                  >
                    <item.icon className={`h-5 w-5 ${item.label === 'Pegawai' ? 'h-[22px] w-[22px]' : ''}`} />
                  </div>
                  <span className={`text-[11px] font-semibold ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
