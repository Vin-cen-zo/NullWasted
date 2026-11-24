import React, { useEffect, useState } from "react";
import { UserSession } from "../types/listing";
import {
  changePassword,
  fetchPublicStoreDetail,
  updateConsumerProfile,
  updateStoreProfile,
} from "../services/api";
import {
  X,
  User,
  Store,
  KeyRound,
  Save,
  CheckCircle2,
  Clock,
  Utensils,
  MapPin,
  Phone,
  FileText,
  Eye,
  EyeOff,
} from "lucide-react";

interface ProfileModalProps {
  isOpen: boolean;
  session: UserSession | null;
  onClose: () => void;
  onSessionUpdated: (updated: UserSession) => void;
  onToast: (message: string, type?: "success" | "error") => void;
}

const STORE_CATEGORIES = [
  "Lauk & Makanan Berat",
  "Bakery & Pastry",
  "Kopi & Kudapan",
  "Kuliner Umum",
  "Kuliner & Makanan",
];

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  session,
  onClose,
  onSessionUpdated,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<"profile" | "password">("profile");

  // Consumer form state
  const [consumerName, setConsumerName] = useState("");
  const [consumerPhone, setConsumerPhone] = useState("");

  // Merchant form state
  const [storeName, setStoreName] = useState("");
  const [storeCategory, setStoreCategory] = useState("Kuliner & Makanan");
  const [storeClosingTime, setStoreClosingTime] = useState("20:30");
  const [storeLocationName, setStoreLocationName] = useState("");
  const [storeDescription, setStoreDescription] = useState("");

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !session) return;
    setActiveTab("profile");
    setErrorMsg(null);
    setSuccessMsg(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");

    if (session.role === "consumer") {
      setConsumerName(session.customerName || "");
      setConsumerPhone(session.customerPhone || "");
    } else if (session.role === "merchant") {
      setStoreName(session.storeName || "");
      setStoreCategory(session.storeCategory || "Kuliner & Makanan");
      setStoreClosingTime(session.closingTime || "20:30");
      setStoreLocationName(session.locationName || "");
      setStoreDescription(session.storeDescription || "");
      if (session.storeId) {
        fetchPublicStoreDetail(session.storeId)
          .then((detail) => {
            setStoreName(detail.store.name);
            setStoreCategory(detail.store.category || "Kuliner & Makanan");
            setStoreClosingTime(detail.store.closing_time || "20:30");
            setStoreLocationName(detail.store.location_name || "");
            setStoreDescription(detail.store.description || "");
          })
          .catch(() => {
            // Keep session fallback values
          });
      }
    }
  }, [isOpen, session]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !session) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      setIsSaving(true);
      if (session.role === "consumer") {
        if (consumerName.trim().length < 2) {
          setErrorMsg("Nama lengkap minimal 2 karakter.");
          return;
        }
        const updated = await updateConsumerProfile({
          name: consumerName.trim(),
          phone: consumerPhone.trim(),
        });
        onSessionUpdated({
          ...session,
          customerName: updated.name,
          customerPhone: updated.phone,
        });
        setSuccessMsg("Profil konsumen berhasil diperbarui.");
        onToast("Profil konsumen berhasil diperbarui.", "success");
      } else if (session.role === "merchant" && session.storeId) {
        if (storeName.trim().length < 2) {
          setErrorMsg("Nama gerai minimal 2 karakter.");
          return;
        }
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(storeClosingTime.trim())) {
          setErrorMsg("Format jam tutup harus 24 jam (HH:MM), contoh: 20:30.");
          return;
        }
        const updated = await updateStoreProfile(session.storeId, {
          name: storeName.trim(),
          category: storeCategory.trim() || "Kuliner & Makanan",
          closing_time: storeClosingTime.trim(),
          location_name: storeLocationName.trim(),
          description: storeDescription.trim(),
        });
        onSessionUpdated({
          ...session,
          storeName: updated.name,
          storeCategory: updated.category,
          storeDescription: updated.description,
          closingTime: updated.closing_time,
          locationName: updated.location_name,
        });
        setSuccessMsg("Profil gerai berhasil diperbarui.");
        onToast("Profil gerai berhasil diperbarui.", "success");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal menyimpan profil.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentPassword) {
      setErrorMsg("Masukkan password lama Anda.");
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg("Password baru minimal 6 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg("Konfirmasi password baru tidak cocok.");
      return;
    }

    try {
      setIsSaving(true);
      const res = await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMsg(res.message || "Password berhasil diubah.");
      onToast(res.message || "Password berhasil diubah.", "success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal mengubah password.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              {session.role === "merchant" ? <Store className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-[#181C2E]">
                {session.role === "merchant" ? "Profil Gerai Mitra" : "Profil Saya"}
              </h2>
              <p className="text-xs text-[#646982]">{session.email || session.storeId || "Akun Aktif"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup profil"
            className="w-9 h-9 rounded-lg bg-[#ECF0F4] hover:bg-slate-200 flex items-center justify-center text-[#181C2E] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F0F5FA] rounded-xl">
          <button
            type="button"
            onClick={() => {
              setActiveTab("profile");
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "profile"
                ? "bg-white text-[#181C2E] shadow-xs"
                : "text-[#646982] hover:text-[#181C2E]"
            }`}
          >
            Edit Profil
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("password");
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "password"
                ? "bg-white text-[#181C2E] shadow-xs"
                : "text-[#646982] hover:text-[#181C2E]"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Ganti Password</span>
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {activeTab === "profile" ? (
          <form onSubmit={handleSaveProfile} className="space-y-3.5">
            {session.role === "consumer" ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#181C2E] mb-1">Nama Lengkap</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={consumerName}
                      onChange={(e) => setConsumerName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600"
                      placeholder="Nama lengkap Anda"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#181C2E] mb-1">Nomor WhatsApp</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={consumerPhone}
                      onChange={(e) => setConsumerPhone(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600"
                      placeholder="081234567890"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#181C2E] mb-1">Nama Gerai / Usaha</label>
                  <div className="relative">
                    <Store className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#181C2E] mb-1">Kategori Kuliner</label>
                    <div className="relative">
                      <Utensils className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        list="nw-store-categories"
                        value={storeCategory}
                        onChange={(e) => setStoreCategory(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600"
                        placeholder="Kategori kuliner"
                      />
                      <datalist id="nw-store-categories">
                        {STORE_CATEGORIES.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#181C2E] mb-1">Jam Tutup (24 Jam)</label>
                    <div className="relative">
                      <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="time"
                        value={storeClosingTime}
                        onChange={(e) => setStoreClosingTime(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#181C2E] mb-1">Label Alamat / Lokasi</label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={storeLocationName}
                      onChange={(e) => setStoreLocationName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600"
                      placeholder="Contoh: Kantin FTUI Depok"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#181C2E] mb-1">Deskripsi Singkat Gerai</label>
                  <div className="relative">
                    <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <textarea
                      rows={2}
                      value={storeDescription}
                      onChange={(e) => setStoreDescription(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600"
                      placeholder="Ceritakan keunggulan makanan surplus gerai Anda..."
                    />
                  </div>
                  <p className="text-[11px] text-[#646982] mt-1">
                    Catatan BPOM: Memundurkan jam tutup tidak memperpanjang batas aman konsumsi makanan yang sudah tayang.
                  </p>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? "Menyimpan..." : "Simpan Perubahan Profil"}</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleSavePassword} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#181C2E] mb-1">Password Lama</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showCurrentPw ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600"
                  placeholder="Masukkan password saat ini"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                >
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#181C2E] mb-1">Password Baru (Min. 6 Karakter)</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showNewPw ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600"
                  placeholder="Minimal 6 karakter"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                >
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#181C2E] mb-1">Konfirmasi Password Baru</label>
              <input
                type={showNewPw ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600"
                placeholder="Ulangi password baru"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3 px-4 rounded-xl bg-[#181C2E] hover:bg-[#252a44] text-white text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>{isSaving ? "Memperbarui..." : "Ubah Password"}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
