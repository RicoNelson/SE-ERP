import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, Shield, User as UserIcon, Trash2, X } from 'lucide-react';
import type { UserProfile } from '../types';

export default function Users() {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // Form state
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'owner' | 'staff'>('staff');
  const [isProcessing, setIsProcessing] = useState(false);
  const [addUserError, setAddUserError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ newName?: string; newPhone?: string }>({});

  useEffect(() => {
    if (userProfile?.role !== 'owner') return;

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList: UserProfile[] = [];
      snapshot.forEach((doc) => {
        usersList.push({ ...doc.data(), phoneNumber: doc.id } as UserProfile);
      });
      setUsers(usersList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userProfile]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserError('');
    const nextFieldErrors: { newName?: string; newPhone?: string } = {};
    if (!newName.trim()) {
      nextFieldErrors.newName = 'Nama lengkap wajib diisi.';
    }
    if (!newPhone.trim()) {
      nextFieldErrors.newPhone = 'Nomor telepon wajib diisi.';
    } else if (!newPhone.startsWith('+62')) {
      nextFieldErrors.newPhone = 'Nomor telepon harus diawali dengan +62.';
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});

    setIsProcessing(true);
    try {
      // Use phone number as document ID
      const userRef = doc(db, 'users', newPhone);
      await setDoc(userRef, {
        phoneNumber: newPhone,
        name: newName,
        role: newRole,
        createdAt: serverTimestamp(),
      });
      
      setNewPhone('');
      setNewName('');
      setNewRole('staff');
      setAddUserError('');
      setFieldErrors({});
      setIsAddModalOpen(false);
    } catch (error) {
      console.error("Error adding user:", error);
      setAddUserError('Gagal menambahkan pengguna.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveUser = async (targetUser: UserProfile) => {
    if (targetUser.role === 'owner') {
      alert('Tidak dapat menghapus akun pemilik.');
      return;
    }

    if (targetUser.phoneNumber === userProfile?.phoneNumber) {
      alert('Tidak dapat menghapus akun sendiri.');
      return;
    }

    if (window.confirm(`Hapus akses untuk ${targetUser.phoneNumber}?`)) {
      try {
        await deleteDoc(doc(db, 'users', targetUser.phoneNumber));
      } catch (error) {
        console.error("Error removing user:", error);
        alert('Gagal menghapus pengguna.');
      }
    }
  };

  if (userProfile?.role !== 'owner') {
    return (
      <div className="p-8 text-center text-slate-500">
        Anda tidak memiliki akses ke halaman ini.
      </div>
    );
  }

  return (
    <div className="ai-page page-enter">
      <div className="ai-card ai-page-hero stagger-fade-in">
        <div className="ai-section-title">
          <div>
            <p className="ai-kicker mb-2">Akses Pengguna</p>
            <h2 className="ai-heading text-2xl font-bold text-slate-900">Manajemen Pegawai</h2>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate-600">
          Kelola akses pemilik dan staf dengan tampilan yang jelas, modern, dan tetap ringan untuk operasional harian.
        </p>
      </div>

      <div className="mt-4 flex items-center justify-end">
        <button 
          onClick={() => {
            setAddUserError('');
            setFieldErrors({});
            setIsAddModalOpen(true);
          }}
          className="ai-button inline-flex items-center gap-2 px-4 py-3"
        >
          <UserPlus className="h-5 w-5" />
          Tambah Pegawai
        </button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-slate-400">Memuat daftar pegawai...</p>
      ) : (
        <div className="mt-4 space-y-3">
          {users.map((user, index) => (
            <div key={user.phoneNumber} className="ai-card ai-card-hover stagger-fade-in flex items-center justify-between p-4" style={{ animationDelay: `${index * 60}ms` }}>
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${user.role === 'owner' ? 'border border-sky-300/30 bg-sky-100 text-sky-700' : 'border border-slate-200 bg-slate-50 text-slate-600'}`}>
                  {user.role === 'owner' ? <Shield className="h-5 w-5" /> : <UserIcon className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="font-bold leading-tight text-slate-900">
                    {user.name || 'Belum ada nama'}
                  </h3>
                  <p className="text-sm text-slate-400">{user.phoneNumber}</p>
                  <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                    user.role === 'owner' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {user.role === 'owner' ? 'Pemilik' : 'Staf'}
                  </span>
                </div>
              </div>
              
              {user.role !== 'owner' && user.phoneNumber !== userProfile.phoneNumber && (
                <button 
                  onClick={() => handleRemoveUser(user)}
                  className="ai-button-ghost rounded-xl p-2.5 text-rose-500"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isAddModalOpen && (
        <div className="ai-modal-shell">
          <div
            className="ai-modal-backdrop"
            onClick={() => {
              setAddUserError('');
              setFieldErrors({});
              setIsAddModalOpen(false);
            }}
          />
          <div className="ai-modal-panel page-enter translate-y-0 scale-100">
            <div className="flex items-center justify-between p-4">
              <h2 className="text-lg font-bold text-slate-900">Tambah Pegawai Baru</h2>
              <button
                onClick={() => {
                  setAddUserError('');
                  setFieldErrors({});
                  setIsAddModalOpen(false);
                }}
                className="ai-button-ghost rounded-full p-2 text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="ai-divider" />
            
            <form onSubmit={handleAddUser} className="p-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Nama Lengkap</label>
                <input
                  required
                  type="text"
                  placeholder="Misal: Budi Santoso"
                  value={newName}
                  onChange={(e) => {
                    setAddUserError('');
                    setFieldErrors((prev) => ({ ...prev, newName: undefined }));
                    setNewName(e.target.value);
                  }}
                  className={`ai-input w-full px-4 py-3 transition-colors duration-200 ${fieldErrors.newName ? 'ai-input-error' : ''}`}
                  aria-invalid={Boolean(fieldErrors.newName)}
                  aria-describedby={fieldErrors.newName ? 'add-user-name-error' : undefined}
                />
                {fieldErrors.newName && (
                  <p id="add-user-name-error" className="ai-field-error mt-1 text-xs">
                    {fieldErrors.newName}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Nomor Telepon (WhatsApp)</label>
                <input
                  required
                  type="tel"
                  placeholder="+628123456789"
                  value={newPhone}
                  onChange={(e) => {
                    setAddUserError('');
                    setFieldErrors((prev) => ({ ...prev, newPhone: undefined }));
                    let val = e.target.value;
                    if (val.startsWith('0')) val = '+62' + val.substring(1);
                    setNewPhone(val);
                  }}
                  className={`ai-input w-full px-4 py-3 transition-colors duration-200 ${fieldErrors.newPhone ? 'ai-input-error' : ''}`}
                  aria-invalid={Boolean(fieldErrors.newPhone)}
                  aria-describedby={fieldErrors.newPhone ? 'add-user-phone-error' : undefined}
                />
                {fieldErrors.newPhone ? (
                  <p id="add-user-phone-error" className="ai-field-error mt-1 text-xs">
                    {fieldErrors.newPhone}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">Pastikan diawali dengan +62</p>
                )}
              </div>
              {addUserError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {addUserError}
                </p>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Peran Akses</label>
                <select
                  className="ai-select w-full px-4 py-3"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'owner' | 'staff')}
                >
                  <option value="staff">Staf (Hanya Kasir)</option>
                  <option value="owner">Pemilik (Akses Penuh)</option>
                </select>
              </div>
              
              <button
                type="submit"
                disabled={isProcessing}
                className="ai-button mt-4 w-full px-4 py-3.5 font-bold disabled:opacity-50"
              >
                {isProcessing ? 'MENYIMPAN...' : 'TAMBAHKAN AKSES'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
