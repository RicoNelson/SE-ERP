import { useState, useEffect } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Package, ShieldCheck, Sparkles, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const storeName = import.meta.env.VITE_STORE_NAME || 'SE ERP';
  const { currentUser } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ phone?: string; otp?: string }>({});
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [sendCodeCooldownSec, setSendCodeCooldownSec] = useState(0);
  
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

  useEffect(() => {
    if (sendCodeCooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setSendCodeCooldownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sendCodeCooldownSec]);

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

  const createRecaptchaVerifier = async () => {
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
      window.recaptchaVerifier = undefined;
    }

    const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
    });

    window.recaptchaVerifier = verifier;
    await verifier.render();
    return verifier;
  };

  const getAuthErrorCode = (value: unknown): string | null => {
    if (!value || typeof value !== 'object') return null;
    const code = Reflect.get(value, 'code');
    return typeof code === 'string' ? code : null;
  };

  const isTooManyRequestsError = (value: unknown) => getAuthErrorCode(value) === 'auth/too-many-requests';

  const getSendCodeErrorMessage = (value: unknown) => {
    const code = getAuthErrorCode(value);
    if (!code) return 'Gagal mengirim kode. Periksa nomor HP Anda.';

    if (code === 'auth/billing-not-enabled') {
      return 'OTP belum aktif. Billing Firebase belum dinyalakan. Aktifkan paket Blaze di Firebase Console.';
    }
    if (code === 'auth/invalid-app-credential') {
      return 'Kredensial aplikasi tidak valid. Biasanya token reCAPTCHA kedaluwarsa atau domain belum diizinkan. Coba refresh halaman.';
    }
    if (code === 'auth/invalid-phone-number') {
      return 'Nomor HP tidak valid. Gunakan format Indonesia yang benar.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Terlalu banyak percobaan. Coba lagi beberapa saat.';
    }
    if (code === 'auth/quota-exceeded') {
      return 'Kuota OTP Firebase habis. Coba lagi nanti.';
    }
    if (code === 'auth/captcha-check-failed') {
      return 'Verifikasi reCAPTCHA gagal. Muat ulang halaman lalu coba lagi.';
    }

    return `Gagal mengirim kode (${code}).`;
  };

  const getVerifyCodeErrorMessage = (value: unknown) => {
    const code = getAuthErrorCode(value);
    if (!code) return 'Kode OTP salah.';

    if (code === 'auth/invalid-verification-code') {
      return 'Kode OTP salah.';
    }
    if (code === 'auth/code-expired' || code === 'auth/session-expired') {
      return 'Kode OTP sudah kedaluwarsa. Minta kode baru.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Terlalu banyak percobaan verifikasi. Coba lagi beberapa saat.';
    }

    return `Verifikasi gagal (${code}).`;
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const nextFieldErrors: { phone?: string } = {};
    if (!phoneNumber.trim()) {
      nextFieldErrors.phone = 'Nomor HP wajib diisi.';
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }
    if (sendCodeCooldownSec > 0) {
      setError(`Terlalu banyak percobaan. Coba lagi dalam ${sendCodeCooldownSec} detik.`);
      return;
    }

    setError('');
    setFieldErrors({});
    setLoading(true);

    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);
      const appVerifier = await createRecaptchaVerifier();
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      
      setConfirmationResult(confirmation);
      setStep('otp');
    } catch (err: unknown) {
      console.error(err);
      if (isTooManyRequestsError(err)) {
        const cooldown = 60;
        setSendCodeCooldownSec(cooldown);
        setError(`Terlalu banyak percobaan. Coba lagi dalam ${cooldown} detik.`);
      } else {
        setError(getSendCodeErrorMessage(err));
      }
      
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
    setError('');
    const nextFieldErrors: { otp?: string } = {};
    if (!otp.trim()) {
      nextFieldErrors.otp = 'Kode OTP wajib diisi.';
    } else if (otp.length !== 6) {
      nextFieldErrors.otp = 'Kode OTP harus 6 digit.';
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    if (!confirmationResult) return;

    setError('');
    setFieldErrors({});
    setLoading(true);

    try {
      await confirmationResult.confirm(otp);
    } catch (err: unknown) {
      console.error(err);
      setError(getVerifyCodeErrorMessage(err));
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
            <h1 className="ai-heading text-3xl font-bold text-slate-900">{storeName}</h1>
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
                  className={`ai-input w-full py-3 pl-12 pr-4 transition-colors duration-200 ${fieldErrors.phone ? 'ai-input-error' : ''}`}
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                />
              </div>
              {fieldErrors.phone && (
                <p id="phone-error" className="ai-field-error mt-1 text-xs">
                  {fieldErrors.phone}
                </p>
              )}
            </div>

            {error && <p className="rounded-2xl border border-rose-300/30 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>}

            <button 
              type="submit" 
              disabled={loading || sendCodeCooldownSec > 0}
              className="ai-button inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold disabled:opacity-50"
            >
              {loading ? 'MENGIRIM...' : sendCodeCooldownSec > 0 ? `TUNGGU ${sendCodeCooldownSec} DETIK` : 'KIRIM KODE OTP'}
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
                className={`ai-input w-full px-4 py-3 text-center text-lg font-bold tracking-[0.45em] transition-colors duration-200 ${fieldErrors.otp ? 'ai-input-error' : ''}`}
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.slice(0, 6));
                  setFieldErrors((prev) => ({ ...prev, otp: undefined }));
                }}
                disabled={loading}
                aria-invalid={Boolean(fieldErrors.otp)}
                aria-describedby={fieldErrors.otp ? 'otp-error' : undefined}
              />
              {fieldErrors.otp && (
                <p id="otp-error" className="ai-field-error mt-1 text-xs">
                  {fieldErrors.otp}
                </p>
              )}
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
              onClick={() => {
                setStep('phone');
                setError('');
                setFieldErrors({});
              }}
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
