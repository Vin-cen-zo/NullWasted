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
} from "lucide-react";
import {
  loginMerchant,
  registerMerchant,
  loginConsumer,
  registerConsumer,
} from "../services/api";

interface AuthScreenProps {
  onLogin: (session: UserSession) => void;
}

export interface SavedMerchantAccount {
  storeId: string;
  storeName: string;
  pin?: string;
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
  const [regAddress, setRegAddress] = useState("");
  const [regLandmark, setRegLandmark] = useState("");
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

  // Consumer Login State
  const [customerPhone, setCustomerPhone] = useState("");
  const [consumerError, setConsumerError] = useState("");
  const [isSubmittingConsumer, setIsSubmittingConsumer] = useState(false);

  // Consumer Register State
  const [regCustomerName, setRegCustomerName] = useState("");
  const [regCustomerPhone, setRegCustomerPhone] = useState("");
  const [regCustomerAddress, setRegCustomerAddress] = useState("Kawasan Kampus UI Depok");
  const [regConsumerError, setRegConsumerError] = useState("");
  const [isSubmittingRegConsumer, setIsSubmittingRegConsumer] = useState(false);

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

    // Physical Address validation (Min 10 chars, alphabetic check, no single character repetition)
    const cleanAddress = regAddress.trim();
    if (cleanAddress.length < 10) {
      setRegError("Alamat lengkap gerai minimal 10 karakter.");
      return;
    }
    if (!/[a-zA-Z]{3,}/.test(cleanAddress)) {
      setRegError("Alamat gerai harus memuat nama jalan atau gedung yang jelas.");
      return;
    }
    if (/^(.)\1+$/.test(cleanAddress)) {
      setRegError("Alamat gerai tidak boleh berupa pengulangan satu karakter.");
      return;
    }

    const fullLocation = regLandmark.trim()
      ? `${cleanAddress} (${regLandmark.trim()})`
      : cleanAddress;

    if (regPin.trim().length < 4) {
      setRegError("PIN Kasir baru minimal 4 digit.");
      return;
    }

    try {
      setIsSubmittingRegStore(true);
      setRegError("");
      const auth = await registerMerchant({
        name: regStoreName.trim(),
        pin: regPin.trim(),
        location_name: fullLocation,
        closing_time: regClosingTime.trim() || "20:30",
        category: resolvedCategory,
      });

      const effectiveStoreId = auth.store_id || "FTUI-001";
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
        locationName: auth.location_name || fullLocation,
        latitude: auth.latitude,
        longitude: auth.longitude,
      };

      setRegisteredStoreData({
        storeId: effectiveStoreId,
        storeName: effectiveStoreName,
        closingTime: auth.closing_time || regClosingTime.trim(),
        locationName: auth.location_name || fullLocation,
        session: newSession,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mendaftarkan gerai baru.";
      setRegError(msg);
    } finally {
      setIsSubmittingRegStore(false);
    }
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
      onLogin({
        token: auth.token,
        role: "consumer",
        userId: auth.user_id,
        customerName: auth.customer_name || "Konsumen NullWasted",
        customerPhone: auth.customer_phone || customerPhone.trim(),
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
        address: regCustomerAddress.trim() || "Kawasan Kampus UI Depok",
      });
      onLogin({
        token: auth.token,
        role: "consumer",
        userId: auth.user_id,
        customerName: auth.customer_name || regCustomerName.trim(),
        customerPhone: auth.customer_phone || regCustomerPhone.trim(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mendaftarkan akun konsumen.";
      setRegConsumerError(msg);
    } finally {
      setIsSubmittingRegConsumer(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-[#F8F6F0] overflow-y-auto">
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
      <div className="my-4">
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
                        <button
                          key={item.storeId}
                          type="button"
                          onClick={() => handleSelectQuickMerchant(item)}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-300 text-[11px] font-medium text-stone-800 transition-colors flex items-center gap-1 shadow-2xs"
                        >
                          <span className="font-mono font-bold text-emerald-700">{item.storeId}</span>
                          <span className="text-stone-600 truncate max-w-[120px]">· {item.storeName}</span>
                        </button>
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

                    {/* Column 1: Physical Full Address (Mandatory) */}
                    <div>
                      <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">
                        Alamat Lengkap Gerai <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute top-2.5 left-3 flex items-start pointer-events-none text-gray-400">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <textarea
                          rows={2}
                          value={regAddress}
                          onChange={(e) => setRegAddress(e.target.value)}
                          minLength={10}
                          maxLength={150}
                          placeholder="Contoh: Kantin Utama FTUI Gedung Dekanat Lantai 1, Kampus UI Depok"
                          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 resize-none"
                        />
                      </div>
                      <span className="text-[10px] text-stone-400 block mt-0.5">Minimal 10 karakter jalan / nama gedung fisik.</span>
                    </div>

                    {/* Column 2: Landmark / Pickup Detail (Optional) */}
                    <div>
                      <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">
                        Patokan / Detail Lokasi Penjemputan <span className="text-stone-400 font-normal">(Opsional)</span>
                      </label>
                      <input
                        type="text"
                        value={regLandmark}
                        onChange={(e) => setRegLandmark(e.target.value)}
                        placeholder="Contoh: Depan lift barang, sebelah ATM center, stan no. 4"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                      />
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

                <div>
                  <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Wilayah / Domisili</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={regCustomerAddress}
                      onChange={(e) => setRegCustomerAddress(e.target.value)}
                      placeholder="Contoh: Kawasan Kampus UI Depok"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                    />
                  </div>
                </div>

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
          Universitas Indonesia · UI Depok Area V1
        </p>
      </div>
    </div>
  );
};
