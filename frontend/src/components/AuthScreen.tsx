import React, { useState } from "react";
import { UserSession } from "../types/listing";
import { Store, ShoppingBag, ShieldCheck, ArrowRight, KeyRound, User, Phone, Sparkles } from "lucide-react";
import { loginMerchant, loginConsumer } from "../services/api";

interface AuthScreenProps {
  onLogin: (session: UserSession) => void;
}

interface PresetStore {
  id: string;
  name: string;
  desc: string;
  pin: string;
}

const PRESET_STORES: PresetStore[] = [
  { id: "FTUI-001", name: "Dapur Barokah FTUI", desc: "Kantin FTUI · Lauk Nusantara", pin: "1234" },
  { id: "MARGONDA-042", name: "Roti Unyil & Pastry Margonda", desc: "Margonda Raya · Bakery & Pastry", pin: "1234" },
  { id: "KUTEK-007", name: "Warkop & Snack Kutek", desc: "Kukusan Teknik · Mie & Kopi", pin: "1234" },
];

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [role, setRole] = useState<"merchant" | "consumer">("merchant");

  // Merchant state
  const [storeId, setStoreId] = useState("FTUI-001");
  const [storeName, setStoreName] = useState("Dapur Barokah FTUI");
  const [storePin, setStorePin] = useState("1234");
  const [merchantError, setMerchantError] = useState("");
  const [isSubmittingMerchant, setIsSubmittingMerchant] = useState(false);

  // Consumer state
  const [customerName, setCustomerName] = useState("Budi Santoso");
  const [customerPhone, setCustomerPhone] = useState("0812-8899-0011");
  const [consumerError, setConsumerError] = useState("");
  const [isSubmittingConsumer, setIsSubmittingConsumer] = useState(false);

  const selectStorePreset = (p: PresetStore) => {
    setStoreId(p.id);
    setStoreName(p.name);
    setStorePin(p.pin);
    setMerchantError("");
  };

  const handleMerchantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId.trim()) {
      setMerchantError("Store ID wajib diisi.");
      return;
    }
    if (storePin.length < 4) {
      setMerchantError("PIN Staf Dapur minimal 4 digit.");
      return;
    }

    try {
      setIsSubmittingMerchant(true);
      setMerchantError("");
      const auth = await loginMerchant(storeId.trim(), storePin.trim());
      onLogin({
        token: auth.token,
        role: "merchant",
        storeId: auth.store_id || storeId.trim(),
        storeName: auth.store_name || storeName.trim(),
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

  const handleConsumerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      setConsumerError("Nama lengkap dan nomor telepon wajib diisi.");
      return;
    }

    try {
      setIsSubmittingConsumer(true);
      setConsumerError("");
      const auth = await loginConsumer(customerName.trim(), customerPhone.trim());
      onLogin({
        token: auth.token,
        role: "consumer",
        userId: auth.user_id,
        customerName: auth.customer_name || customerName.trim(),
        customerPhone: auth.customer_phone || customerPhone.trim(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal masuk sebagai konsumen.";
      setConsumerError(msg);
    } finally {
      setIsSubmittingConsumer(false);
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

        {/* Merchant Login Form */}
        {role === "merchant" ? (
          <form onSubmit={handleMerchantSubmit} className="mt-4 space-y-3">
            {/* Quick Preset Selector for Evaluators */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-stone-600 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>Pilih Gerai Mitra Uji (1-Klik):</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {PRESET_STORES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectStorePreset(p)}
                    className={`p-1.5 text-left rounded-xl border transition-all text-[10px] ${
                      storeId === p.id
                        ? "bg-emerald-50 border-emerald-500 font-bold text-emerald-950 shadow-xs"
                        : "bg-white border-stone-200 text-stone-600 hover:border-emerald-300"
                    }`}
                  >
                    <span className="block font-mono text-[9px] text-emerald-700">{p.id}</span>
                    <span className="truncate block font-semibold">{p.name.split(" ")[0]}</span>
                  </button>
                ))}
              </div>
            </div>

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
                  placeholder="FTUI-001"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Nama Gerai</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Dapur Barokah FTUI"
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">PIN Kasir / Dapur (Default: 1234)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  maxLength={6}
                  value={storePin}
                  onChange={(e) => setStorePin(e.target.value)}
                  placeholder="1234"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
              </div>
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
          /* Consumer Login Form */
          <form onSubmit={handleConsumerSubmit} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Nama Lengkap</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Budi Santoso"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D8D2C5] bg-white text-[#1F1D1A] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Nomor WhatsApp</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0812-8899-0011"
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
              <span>{isSubmittingConsumer ? "Menghubungkan..." : "Mulai Jelajah Makanan Surplus"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
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
