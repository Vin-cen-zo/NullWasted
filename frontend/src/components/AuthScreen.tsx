import React, { useState } from "react";
import { UserSession } from "../types/listing";
import {
  Store,
  ShoppingBag,
  ShieldCheck,
  ArrowRight,
  KeyRound,
  User,
  Phone,
  Clock,
  MapPin,
  Utensils,
  CheckCircle2,
  Sparkles,
  X,
} from "lucide-react";
import {
  loginMerchant,
  registerMerchant,
  loginConsumer,
  registerConsumer,
} from "../services/api";
import { StorePinpointPickerModal } from "./StorePinpointPickerModal";

interface AuthScreenProps {
  onLogin: (session: UserSession) => void;
}

export interface SavedMerchantAccount {
  storeId: string;
  storeName: string;
  pin?: string;
  lastLoginAt: string;
}

export interface SavedConsumerAccount {
  customerName: string;
  customerPhone: string;
  lastLoginAt: string;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [role, setRole] = useState<"merchant" | "consumer">("merchant");
  const [merchantTab, setMerchantTab] = useState<"login" | "register">("login");
  const [consumerTab, setConsumerTab] = useState<"login" | "register">("login");

  // Saved Merchant Accounts in localStorage
  const [savedMerchants, setSavedMerchants] = useState<SavedMerchantAccount[]>(() => {
    try {
      const raw = localStorage.getItem("nullwasted_saved_merchant");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [rememberMerchant, setRememberMerchant] = useState<boolean>(true);

  // Merchant Login State
  const [storeId, setStoreId] = useState("");
  const [storePin, setStorePin] = useState("");
  const [merchantError, setMerchantError] = useState("");
  const [isSubmittingMerchant, setIsSubmittingMerchant] = useState(false);

  // Merchant Register State
  const [regStoreName, setRegStoreName] = useState("");
  const [regCategory, setRegCategory] = useState("Lauk & Makanan Berat");
  const [customCategory, setCustomCategory] = useState("");
  const [regClosingTime, setRegClosingTime] = useState("20:30");
  const [regPinLat, setRegPinLat] = useState<number | null>(null);
  const [regPinLng, setRegPinLng] = useState<number | null>(null);
  const [regPinLabel, setRegPinLabel] = useState("");
  const [isRegPinpointOpen, setIsRegPinpointOpen] = useState(false);
  const [regPin, setRegPin] = useState("");
  const [regError, setRegError] = useState("");
  const [isSubmittingRegStore, setIsSubmittingRegStore] = useState(false);
  const [registeredStoreData, setRegisteredStoreData] = useState<{
    storeId: string;
    storeName: string;
    closingTime: string;
    locationName: string;
    session: UserSession;
  } | null>(null);

  // Saved Consumer Accounts in localStorage
  const [savedConsumers, setSavedConsumers] = useState<SavedConsumerAccount[]>(() => {
    try {
      const raw = localStorage.getItem("nullwasted_saved_consumer");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      return parsed?.customerPhone ? [parsed] : [];
    } catch {
      return [];
    }
  });
  const [rememberConsumer, setRememberConsumer] = useState<boolean>(true);

  // Consumer Login State
  const [customerPhone, setCustomerPhone] = useState("");
  const [consumerError, setConsumerError] = useState("");
  const [isSubmittingConsumer, setIsSubmittingConsumer] = useState(false);

  // Consumer Register State
  const [regCustomerName, setRegCustomerName] = useState("");
  const [regCustomerPhone, setRegCustomerPhone] = useState("");
  const [regConsumerError, setRegConsumerError] = useState("");
  const [isSubmittingRegConsumer, setIsSubmittingRegConsumer] = useState(false);

  const removeSavedMerchant = (targetStoreId: string) => {
    try {
      const updated = savedMerchants.filter((m) => m.storeId !== targetStoreId);
      setSavedMerchants(updated);
      localStorage.setItem("nullwasted_saved_merchant", JSON.stringify(updated));
    } catch {
      // ignore storage failure
    }
  };

  const saveMerchantToStorage = (account: SavedMerchantAccount) => {
    try {
      const filtered = savedMerchants.filter((m) => m.storeId !== account.storeId);
      const updated = [account, ...filtered].slice(0, 5);
      setSavedMerchants(updated);
      localStorage.setItem("nullwasted_saved_merchant", JSON.stringify(updated));
    } catch {
      // ignore storage failure
    }
  };

  // Merchant Handlers
  const handleMerchantLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId.trim()) {
      setMerchantError("Store ID wajib diisi.");
      return;
    }
    if (storePin.trim().length < 4) {
      setMerchantError("PIN Kasir / Dapur minimal 4 digit.");
      return;
    }

    try {
      setIsSubmittingMerchant(true);
      setMerchantError("");
      const auth = await loginMerchant(storeId.trim(), storePin.trim());
      const effectiveStoreName = auth.store_name || "Gerai Mitra NullWasted";

      if (rememberMerchant) {
        saveMerchantToStorage({
          storeId: auth.store_id || storeId.trim(),
          storeName: effectiveStoreName,
          pin: storePin.trim(),
          lastLoginAt: new Date().toISOString(),
        });
      }

      onLogin({
        token: auth.token,
        role: "merchant",
        storeId: auth.store_id || storeId.trim(),
        storeName: effectiveStoreName,
        closingTime: auth.closing_time,
        locationName: auth.location_name,
        latitude: auth.latitude,
        longitude: auth.longitude,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal masuk sebagai mitra toko.";
      setMerchantError(msg);
    } finally {
      setIsSubmittingMerchant(false);
    }
  };

  const handleSelectQuickMerchant = (item: SavedMerchantAccount) => {
    setStoreId(item.storeId);
    if (item.pin) {
      setStorePin(item.pin);
    }
    setMerchantError("");
  };

  const handleMerchantRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regStoreName.trim()) {
      setRegError("Nama usaha / gerai wajib diisi.");
      return;
    }

    // Category validation
    let resolvedCategory = regCategory;
    if (regCategory === "CUSTOM") {
      if (customCategory.trim().length < 3) {
        setRegError("Kategori kuliner kustom minimal 3 karakter.");
        return;
      }
      resolvedCategory = customCategory.trim();
    }

    // 24h Closing time validation
    const time24Regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!time24Regex.test(regClosingTime.trim())) {
      setRegError("Format jam tutup harus 24 jam (HH:MM), contoh: 20:30.");
      return;
    }

    if (regPin.trim().length < 4) {
      setRegError("PIN Kasir baru minimal 4 digit.");
      return;
    }

    const resolvedLocationName = regPinLabel.trim() || regStoreName.trim();

    try {
      setIsSubmittingRegStore(true);
      setRegError("");
      const auth = await registerMerchant({
        name: regStoreName.trim(),
        pin: regPin.trim(),
        location_name: resolvedLocationName,
        closing_time: regClosingTime.trim() || "20:30",
        category: resolvedCategory,
        latitude: regPinLat,
        longitude: regPinLng,
      });

      const effectiveStoreId = auth.store_id || "STORE-NEW";
      const effectiveStoreName = auth.store_name || regStoreName.trim();

      saveMerchantToStorage({
        storeId: effectiveStoreId,
        storeName: effectiveStoreName,
        pin: regPin.trim(),
        lastLoginAt: new Date().toISOString(),
      });

      const newSession: UserSession = {
        token: auth.token,
        role: "merchant",
        storeId: effectiveStoreId,
        storeName: effectiveStoreName,
        closingTime: auth.closing_time || regClosingTime.trim(),
        locationName: auth.location_name || resolvedLocationName,
        latitude: auth.latitude ?? regPinLat,
        longitude: auth.longitude ?? regPinLng,
      };

      setRegisteredStoreData({
        storeId: effectiveStoreId,
        storeName: effectiveStoreName,
        closingTime: auth.closing_time || regClosingTime.trim(),
        locationName: auth.location_name || resolvedLocationName,
        session: newSession,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mendaftarkan gerai baru.";
      setRegError(msg);
    } finally {
      setIsSubmittingRegStore(false);
    }
  };

  const removeSavedConsumer = (targetPhone: string) => {
    try {
      const updated = savedConsumers.filter((c) => c.customerPhone !== targetPhone);
      setSavedConsumers(updated);
      localStorage.setItem("nullwasted_saved_consumer", JSON.stringify(updated));
    } catch {
      // ignore storage failure
    }
  };

  const saveConsumerToStorage = (account: SavedConsumerAccount) => {
    try {
      const filtered = savedConsumers.filter((c) => c.customerPhone !== account.customerPhone);
      const updated = [account, ...filtered].slice(0, 5);
      setSavedConsumers(updated);
      localStorage.setItem("nullwasted_saved_consumer", JSON.stringify(updated));
    } catch {
      // ignore storage failure
    }
  };

  const handleSelectQuickConsumer = (item: SavedConsumerAccount) => {
    setCustomerPhone(item.customerPhone);
    setConsumerError("");
  };

  // Consumer Handlers
  const handleConsumerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerPhone.trim()) {
      setConsumerError("Nomor WhatsApp wajib diisi.");
      return;
    }

    try {
      setIsSubmittingConsumer(true);
      setConsumerError("");
      const auth = await loginConsumer(customerPhone.trim());
      const resolvedName = auth.customer_name || "Konsumen NullWasted";
      const resolvedPhone = auth.customer_phone || customerPhone.trim();

      if (rememberConsumer) {
        saveConsumerToStorage({
          customerName: resolvedName,
          customerPhone: resolvedPhone,
          lastLoginAt: new Date().toISOString(),
        });
      }

      onLogin({
        token: auth.token,
        role: "consumer",
        userId: auth.user_id,
        customerName: resolvedName,
        customerPhone: resolvedPhone,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal masuk sebagai konsumen.";
      setConsumerError(msg);
    } finally {
      setIsSubmittingConsumer(false);
    }
  };

  const handleConsumerRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regCustomerName.trim()) {
      setRegConsumerError("Nama lengkap wajib diisi.");
      return;
    }
    if (!regCustomerPhone.trim()) {
      setRegConsumerError("Nomor WhatsApp wajib diisi.");
      return;
    }

    try {
      setIsSubmittingRegConsumer(true);
      setRegConsumerError("");
      const auth = await registerConsumer({
        name: regCustomerName.trim(),
        phone: regCustomerPhone.trim(),
      });
      const resolvedName = auth.customer_name || regCustomerName.trim();
      const resolvedPhone = auth.customer_phone || regCustomerPhone.trim();

      saveConsumerToStorage({
        customerName: resolvedName,
        customerPhone: resolvedPhone,
        lastLoginAt: new Date().toISOString(),
      });

      onLogin({
        token: auth.token,
        role: "consumer",
        userId: auth.user_id,
        customerName: resolvedName,
        customerPhone: resolvedPhone,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mendaftarkan akun konsumen.";
      setRegConsumerError(msg);
    } finally {
      setIsSubmittingRegConsumer(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-2 sm:py-8">
      <div className="w-full max-w-md mx-auto p-5 sm:p-8 bg-white rounded-3xl border border-[#E2DDD3] shadow-lg flex flex-col justify-between space-y-5">
        {/* Brand & Compliance Header */}
        <div className="text-center pt-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#10B981]/15 text-[#10B981] mb-2 shadow-sm">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1D1A]">NullWasted</h1>
          <p className="text-xs text-[#6B655B] mt-0.5">Autonomous AI Surplus Food Marketplace</p>
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Standar Kepatuhan PerBPOM No. 16/2019
          </div>
        </div>

        {/* Role Switcher */}
        <div className="my-2">
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#E8E3D9]/60 rounded-xl border border-[#D8D2C5]">
            <button
              type="button"
              onClick={() => setRole("merchant")}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                role === "merchant"
                  ? "bg-white text-[#1F1D1A] shadow-sm border border-black/5"
                  : "text-[#6B655B] hover:text-[#1F1D1A]"
              }`}
            >
              <Store className="w-4 h-4 text-emerald-600" />
              Mitra Toko
            </button>
            <button
              type="button"
              onClick={() => setRole("consumer")}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                role === "consumer"
                  ? "bg-white text-[#1F1D1A] shadow-sm border border-black/5"
                  : "text-[#6B655B] hover:text-[#1F1D1A]"
              }`}
            >
              <ShoppingBag className="w-4 h-4 text-emerald-600" />
              Konsumen
            </button>
          </div>

          {/* ========================================================================= */}
          {/* MERCHANT FLOW                                                             */}
          {/* ========================================================================= */}
          {role === "merchant" ? (
            <div className="mt-4">
              {/* Merchant Sub-Tabs */}
              <div className="flex border-b border-[#D8D2C5] mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setMerchantTab("login");
                    setRegisteredStoreData(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold transition-all border-b-2 ${
                    merchantTab === "login"
                      ? "border-emerald-600 text-emerald-800"
                      : "border-transparent text-stone-500 hover:text-stone-700"
                  }`}
                >
                  Masuk ke Dapur
                </button>
                <button
                  type="button"
                  onClick={() => setMerchantTab("register")}
                  className={`flex-1 py-2 text-xs font-bold transition-all border-b-2 ${
                    merchantTab === "register"
                      ? "border-emerald-600 text-emerald-800"
                      : "border-transparent text-stone-500 hover:text-stone-700"
                  }`}
                >
                  Daftarkan Gerai Baru
                </button>
              </div>

              {merchantTab === "login" ? (
                /* Merchant Login Form */
                <form onSubmit={handleMerchantLogin} className="space-y-3">
                  {/* Quick Account Selector if available */}
                  {savedMerchants.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1.5">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        <span>Pilih Cepat Gerai Anda</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {savedMerchants.map((item) => (
                          <div
                            key={item.storeId}
                            className="inline-flex items-center rounded-lg bg-white border border-emerald-300 shadow-sm overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectQuickMerchant(item)}
                              className="px-2.5 py-1 hover:bg-emerald-100 text-[11px] font-medium text-stone-800 transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <span className="font-mono font-bold text-emerald-700">{item.storeId}</span>
                              <span className="text-stone-600 truncate max-w-[115px]">· {item.storeName}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSavedMerchant(item.storeId)}
                              aria-label={`Hapus ${item.storeName} dari daftar tersimpan`}
                              title="Hapus akun gerai tersimpan"
                              className="px-1.5 py-1 text-stone-400 hover:text-red-600 hover:bg-red-50 border-l border-emerald-200 transition-colors cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                <div>
                  <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Store ID</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Store className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={storeId}
                      onChange={(e) => setStoreId(e.target.value.toUpperCase())}
                      placeholder="Contoh: FTUI-001"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">PIN Kasir / Dapur</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      maxLength={6}
                      value={storePin}
                      onChange={(e) => setStorePin(e.target.value)}
                      placeholder="Masukkan PIN 4-6 digit"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="rememberMerchant"
                    checked={rememberMerchant}
                    onChange={(e) => setRememberMerchant(e.target.checked)}
                    className="w-3.5 h-3.5 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                  />
                  <label htmlFor="rememberMerchant" className="text-xs text-stone-600 select-none cursor-pointer">
                    Ingat Kredensial di Perangkat Ini
                  </label>
                </div>

                {merchantError && (
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-700 font-semibold">
                    {merchantError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmittingMerchant}
                  className="w-full py-3 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <span>{isSubmittingMerchant ? "Memverifikasi PIN..." : "Masuk ke Dapur Gerai"}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              /* Merchant Register Form */
              <div>
                {registeredStoreData ? (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-stone-800 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span>Gerai Berhasil Terdaftar!</span>
                    </div>
                    <p className="text-xs text-stone-600">
                      Selamat datang, mitra <strong className="text-stone-900">{registeredStoreData.storeName}</strong>. Berikut adalah Store ID resmi gerai Anda:
                    </p>
                    <div className="p-3 bg-white rounded-xl border border-emerald-200 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block mb-0.5">
                        Store ID Resmi Anda
                      </span>
                      <span className="text-xl font-mono font-black text-emerald-700 tracking-wider">
                        {registeredStoreData.storeId}
                      </span>
                      <p className="text-[10px] text-stone-500 mt-1">
                        Simpan Store ID dan PIN ini untuk login kasir dan staf dapur.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onLogin(registeredStoreData.session)}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all"
                    >
                      <span>Lanjut Masuk ke Dapur Gerai</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleMerchantRegister} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Nama Usaha / Gerai</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                          <Store className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          value={regStoreName}
                          onChange={(e) => setRegStoreName(e.target.value)}
                          placeholder="Contoh: Warung Berkah Nusantara"
                          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Kategori Kuliner</label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                            <Utensils className="w-4 h-4" />
                          </div>
                          <select
                            value={regCategory}
                            onChange={(e) => setRegCategory(e.target.value)}
                            className="w-full pl-9 pr-2 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                          >
                            <option value="Lauk & Makanan Berat">Lauk Nusantara</option>
                            <option value="Bakery & Pastry">Bakery & Roti</option>
                            <option value="Kopi & Kudapan">Kopi & Minuman</option>
                            <option value="Kuliner Umum">Kuliner Umum</option>
                            <option value="CUSTOM">Lainnya (Tulis Sendiri)...</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Jam Tutup (24 Jam)</label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                            <Clock className="w-4 h-4" />
                          </div>
                          <input
                            type="time"
                            step={60}
                            value={regClosingTime}
                            onChange={(e) => setRegClosingTime(e.target.value)}
                            className="w-full pl-9 pr-2 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Custom Category Input if selected */}
                    {regCategory === "CUSTOM" && (
                      <div>
                        <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">
                          Nama Kategori Kuliner Kustom <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={customCategory}
                          onChange={(e) => setCustomCategory(e.target.value)}
                          placeholder="Contoh: Dimsum & Chinese Food, Bento Jepang"
                          className="w-full px-3 py-2 text-xs rounded-xl border border-emerald-400 bg-white text-[#1F1D1A] focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                        />
                      </div>
                    )}

                    <div>
                      <p className="text-[10px] text-stone-500 mb-1">Format jam tutup 24 jam (00:00 - 23:59), contoh: 20:30</p>
                    </div>

                    {/* Pinpoint Lokasi Gerai via Peta Interaktif */}
                    <div>
                      <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">
                        Pin Lokasi Gerai di Peta <span className="text-stone-400 font-normal">(Bisa diubah/dihapus kapan saja)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsRegPinpointOpen(true)}
                        className="w-full px-3 py-2.5 rounded-xl border border-[#D8D2C5] bg-white hover:bg-emerald-50/60 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div className="min-w-0">
                            <span className="block text-xs font-bold text-[#1F1D1A] truncate">
                              {regPinLat !== null && regPinLng !== null
                                ? regPinLabel || "Pin Lokasi Gerai Terpasang"
                                : "Pilih Titik Lokasi Gerai di Peta"}
                            </span>
                            <span className="block text-[10px] text-[#6B655B] font-mono truncate">
                              {regPinLat !== null && regPinLng !== null
                                ? `${regPinLat.toFixed(5)}, ${regPinLng.toFixed(5)}`
                                : "Klik untuk menaruh pin agar toko tampil di peta jelajah"}
                            </span>
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-700 shrink-0">
                          {regPinLat !== null ? "Ubah Pin" : "Pasang Pin"}
                        </span>
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Buat PIN Kasir Baru (Min. 4 Digit)</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                          <KeyRound className="w-4 h-4" />
                        </div>
                        <input
                          type="password"
                          maxLength={6}
                          value={regPin}
                          onChange={(e) => setRegPin(e.target.value)}
                          placeholder="PIN 4-6 digit untuk staf dapur"
                          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    {regError && (
                      <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-700 font-semibold">
                        {regError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmittingRegStore}
                      className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      <span>{isSubmittingRegStore ? "Mendaftarkan Gerai..." : "Daftarkan Gerai & Dapatkan Store ID"}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                )}
                <StorePinpointPickerModal
                  isOpen={isRegPinpointOpen}
                  initialLat={regPinLat}
                  initialLng={regPinLng}
                  initialLabel={regPinLabel}
                  storeName={regStoreName.trim() || "Gerai Baru"}
                  allowRemove={regPinLat !== null}
                  onClose={() => setIsRegPinpointOpen(false)}
                  onSave={(lat, lng, label) => {
                    setRegPinLat(lat);
                    setRegPinLng(lng);
                    if (label !== undefined) setRegPinLabel(label);
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          /* ========================================================================= */
          /* CONSUMER FLOW                                                             */
          /* ========================================================================= */
          <div className="mt-4">
            {/* Consumer Sub-Tabs */}
            <div className="flex border-b border-[#D8D2C5] mb-4">
              <button
                type="button"
                onClick={() => setConsumerTab("login")}
                className={`flex-1 py-2 text-xs font-bold transition-all border-b-2 ${
                  consumerTab === "login"
                    ? "border-emerald-600 text-emerald-800"
                    : "border-transparent text-stone-500 hover:text-stone-700"
                }`}
              >
                Masuk Akun
              </button>
              <button
                type="button"
                onClick={() => setConsumerTab("register")}
                className={`flex-1 py-2 text-xs font-bold transition-all border-b-2 ${
                  consumerTab === "register"
                    ? "border-emerald-600 text-emerald-800"
                    : "border-transparent text-stone-500 hover:text-stone-700"
                }`}
              >
                Daftar Pengguna Baru
              </button>
            </div>

            {consumerTab === "login" ? (
              /* Consumer Login Form */
              <form onSubmit={handleConsumerLogin} className="space-y-3">
                {/* Quick Consumer Account Selector if available */}
                {savedConsumers.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1.5">
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      <span>Pilih Cepat Akun Anda</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {savedConsumers.map((item) => (
                        <div
                          key={item.customerPhone}
                          className="inline-flex items-center rounded-lg bg-white border border-emerald-300 shadow-sm overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectQuickConsumer(item)}
                            className="px-2.5 py-1 hover:bg-emerald-100 text-[11px] font-medium text-stone-800 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span className="font-bold text-emerald-700 truncate max-w-[105px]">
                              {item.customerName}
                            </span>
                            <span className="font-mono text-stone-600">· {item.customerPhone}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSavedConsumer(item.customerPhone)}
                            aria-label={`Hapus ${item.customerName} dari daftar tersimpan`}
                            title="Hapus akun konsumen tersimpan"
                            className="px-1.5 py-1 text-stone-400 hover:text-red-600 hover:bg-red-50 border-l border-emerald-200 transition-colors cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Nomor WhatsApp Terdaftar</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Phone className="w-4 h-4" />
                    </div>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Contoh: 0812-8899-0011"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="rememberConsumer"
                    checked={rememberConsumer}
                    onChange={(e) => setRememberConsumer(e.target.checked)}
                    className="w-3.5 h-3.5 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                  />
                  <label htmlFor="rememberConsumer" className="text-xs text-stone-600 select-none cursor-pointer">
                    Ingat Nomor di Perangkat Ini
                  </label>
                </div>

                {consumerError && (
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-700 font-semibold">
                    {consumerError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmittingConsumer}
                  className="w-full py-3 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <span>{isSubmittingConsumer ? "Menghubungkan..." : "Masuk & Jelajah Surplus"}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              /* Consumer Register Form */
              <form onSubmit={handleConsumerRegister} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Nama Lengkap</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={regCustomerName}
                      onChange={(e) => setRegCustomerName(e.target.value)}
                      placeholder="Contoh: Budi Santoso"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Nomor WhatsApp Aktif</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Phone className="w-4 h-4" />
                    </div>
                    <input
                      type="tel"
                      value={regCustomerPhone}
                      onChange={(e) => setRegCustomerPhone(e.target.value)}
                      placeholder="Contoh: 0812-8899-0011"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-[#6B655B] bg-[#F8F6F0] px-3 py-2 rounded-xl border border-[#E7E1D4]">
                  Setelah masuk, aplikasi akan meminta izin GPS perangkat Anda untuk menghitung jarak ke gerai sekitar.
                </p>

                {regConsumerError && (
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-700 font-semibold">
                    {regConsumerError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmittingRegConsumer}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <span>{isSubmittingRegConsumer ? "Mendaftarkan Akun..." : "Daftar & Mulai Belanja Surplus"}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="text-center pt-2 border-t border-[#E8E2D5]">
        <p className="text-[10px] text-[#7C7569]">
          Platform Marketplace Surplus Food Berbasis Agentic AI
        </p>
        <p className="text-[9px] text-[#A8A196] mt-0.5">
          Hemat Pangan · Temukan Gerai Terdekat di Sekitarmu
        </p>
      </div>
    </div>
  </div>
  );
};
