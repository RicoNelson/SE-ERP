import { useState, useEffect } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Package, ShieldCheck, Sparkles, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { currentUser } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser) {
      navigate('/');
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    // Initialize reCAPTCHA only once
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible'
      });
    }

    return () => {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = undefined;
      }
    };
  }, []);

  const formatPhoneNumber = (phone: string) => {
    // Basic formatting: ensure it starts with +62 if not provided
    let formatted = phone.replace(/\D/g, '');
    if (formatted.startsWith('0')) {
      formatted = '62' + formatted.substring(1);
    } else if (!formatted.startsWith('62')) {
      formatted = '62' + formatted;
    }
    return '+' + formatted;
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) {
      setError('Masukkan nomor HP');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);
      
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible'
        });
      }
      
      const appVerifier = window.recaptchaVerifier;
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      
      setConfirmationResult(confirmation);
      setStep('otp');
    } catch (err: unknown) {
      console.error(err);
      setError('Gagal mengirim kode. Periksa nomor HP Anda.');
      
      // Reset reCAPTCHA on error
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = undefined;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError('Kode harus 6 digit');
      return;
    }

    if (!confirmationResult) return;

    setError('');
    setLoading(true);

    try {
      await confirmationResult.confirm(otp);
    } catch (err) {
      console.error(err);
      setError('Kode Salah');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(121,231,255,0.18),transparent_26%),radial-gradient(circle_at_80%_20%,rgba(82,168,255,0.18),transparent_24%)]" />
      <div className="glass-panel-strong page-enter relative w-full max-w-md rounded-[2rem] p-8 text-center">
        <div className="mb-6 flex justify-center">
          <div className="ai-stat-orb h-18 w-18 rounded-[1.5rem]">
            <Package className="h-8 w-8 text-sky-700" />
          </div>
        </div>
        <div className="mb-6 space-y-3">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
            <Sparkles className="h-3.5 w-3.5" />
            Masuk Sistem
          </div>
          <div>
            <h1 className="ai-heading text-3xl font-bold text-slate-900">Sukses Elektronik</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
              Masuk ke dashboard inventaris dengan pengalaman yang aman, cepat, dan nyaman digunakan.
            </p>
          </div>
        </div>
        
        {/* Invisible reCAPTCHA container required for Firebase Phone Auth */}
        <div id="recaptcha-container"></div>

        {step === 'phone' ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div className="text-left">
              <label htmlFor="phone" className="mb-2 block text-sm font-medium text-slate-700">
                Masukkan Nomor HP Anda
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-medium text-slate-500">
                  +62
                </span>
                <input
                  id="phone"
                  type="tel"
                  placeholder="812 3456 7890"
                  className="ai-input w-full py-3 pl-12 pr-4"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            {error && <p className="rounded-2xl border border-rose-300/30 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>}

            <button 
              type="submit" 
              disabled={loading}
              className="ai-button inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold disabled:opacity-50"
            >
              {loading ? 'MENGIRIM...' : 'KIRIM KODE OTP'}
              {!loading && <ChevronRight className="h-4 w-4" />}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="text-left">
              <label htmlFor="otp" className="mb-2 block text-sm font-medium text-slate-700">
                Masukkan Kode OTP
              </label>
              <p className="mb-3 text-xs text-slate-500">
                dikirim ke {formatPhoneNumber(phoneNumber)}
              </p>
              <input
                id="otp"
                type="number"
                placeholder="123456"
                maxLength={6}
                className="ai-input w-full px-4 py-3 text-center text-lg font-bold tracking-[0.45em]"
                value={otp}
                onChange={(e) => setOtp(e.target.value.slice(0, 6))}
                disabled={loading}
              />
            </div>

            {error && <p className="rounded-2xl border border-rose-300/30 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>}

            <button 
              type="submit" 
              disabled={loading || otp.length !== 6}
              className="ai-button w-full px-4 py-3 font-semibold disabled:opacity-50"
            >
              {loading ? 'MEMVERIFIKASI...' : 'VERIFIKASI'}
            </button>

            <button 
              type="button"
              onClick={() => setStep('phone')}
              className="ai-button-ghost mt-2 w-full px-4 py-3 text-sm font-medium"
              disabled={loading}
            >
              Ubah Nomor HP
            </button>
          </form>
        )}

        <div className="ai-divider my-6" />

        <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>Verifikasi OTP untuk akses dashboard yang aman</span>
        </div>
      </div>
    </div>
  );
}
