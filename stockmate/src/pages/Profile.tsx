import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, ShieldCheck, Phone } from 'lucide-react';

export default function Profile() {
  const storeName = import.meta.env.VITE_STORE_NAME || 'SE ERP';
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (window.confirm('Apakah Anda yakin ingin keluar?')) {
      setIsLoggingOut(true);
      try {
        await signOut(auth);
        navigate('/login');
      } catch (error) {
        console.error('Error logging out:', error);
        alert('Gagal keluar. Silakan coba lagi.');
        setIsLoggingOut(false);
      }
    }
  };

  return (
    <div className="ai-page page-enter">
      <section className="ai-card ai-page-hero stagger-fade-in">
        <p className="ai-kicker mb-2">Akun</p>
        <h2 className="ai-heading text-2xl font-bold text-slate-900">Profil Pengguna</h2>
      </section>

      <div className="ai-card mt-4 mb-6 overflow-hidden">
        <div className="flex flex-col items-center p-6">
          <div className="ai-stat-orb mb-4 h-20 w-20 rounded-[1.75rem]">
            <User className="h-10 w-10 text-sky-700" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {userProfile?.name || currentUser?.displayName || `Pengguna ${storeName}`}
          </h3>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
            <Phone className="h-4 w-4" />
            {currentUser?.phoneNumber || 'Nomor tidak tersedia'}
          </p>
        </div>
        
        <div className="ai-divider" />
        <div className="flex items-center gap-3 p-4 text-sm text-slate-600">
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
          <p>
            Akun ini diverifikasi menggunakan <strong>Nomor HP (OTP)</strong>.
          </p>
        </div>
      </div>

      <div className="ai-card overflow-hidden">
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex w-full items-center gap-3 p-4 text-left font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
        >
          <LogOut className="h-5 w-5" />
          {isLoggingOut ? 'KELUAR...' : 'KELUAR AKUN'}
        </button>
      </div>
      
      <p className="mt-8 text-center text-xs text-slate-500">
        {storeName} v1.0.0
      </p>
    </div>
  );
}
