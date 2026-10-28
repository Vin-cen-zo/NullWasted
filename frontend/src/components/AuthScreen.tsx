import React, { useState } from "react";
import { UserSession } from "../types/listing";
import { Store, ShoppingBag, ShieldCheck, ArrowRight, KeyRound, User, Phone } from "lucide-react";

interface AuthScreenProps {
  onLogin: (session: UserSession) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [role, setRole] = useState<"merchant" | "consumer">("merchant");

  // Merchant state
  const [storeId, setStoreId] = useState("MARGONDA-042");
  const [storeName, setStoreName] = useState("Dapur Barokah");
  const [storePin, setStorePin] = useState("1234");
  const [merchantError, setMerchantError] = useState("");

  // Consumer state
  const [customerName, setCustomerName] = useState("Budi Santoso");
  const [customerPhone, setCustomerPhone] = useState("0812-8899-0011");
  const [consumerError, setConsumerError] = useState("");

  const handleMerchantSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId.trim() || !storeName.trim()) {
      setMerchantError("Store ID dan Nama Toko wajib diisi.");
      return;
    }
    if (storePin.length < 4) {
      setMerchantError("PIN Staf Dapur minimal 4 digit.");
      return;
    }
    setMerchantError("");
    onLogin({
      role: "merchant",
      storeId: storeId.trim(),
      storeName: storeName.trim(),
    });
  };

  const handleConsumerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      setConsumerError("Nama lengkap dan nomor WhatsApp wajib diisi.");
      return;
    }
    setConsumerError("");
    onLogin({
      role: "consumer",
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
    });
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-[#F8F6F0]">
      {/* Brand & Compliance Header */}
      <div className="text-center pt-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#10B981]/15 text-[#10B981] mb-3 shadow-sm">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1F1D1A]">NullWasted</h1>
        <p className="text-xs text-[#6B655B] mt-1">Autonomous AI Surplus Food Marketplace</p>
        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-800">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Standar Kepatuhan PerBPOM No. 16/2019
        </div>
      </div>

      {/* Role Switcher */}
      <div className="my-6">
        <div className="grid grid-cols-2 gap-1 p-1 bg-[#E8E3D9]/60 rounded-xl border border-[#D8D2C5]">
          <button
            type="button"
            onClick={() => setRole("merchant")}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
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
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
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
          <form onSubmit={handleMerchantSubmit} className="mt-5 space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-[#E2DDD3] shadow-sm space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Store ID Gerai</label>
                <div className="relative">
                  <input
                    type="text"
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    placeholder="Contoh: MARGONDA-042"
                    className="w-full text-xs font-mono px-3 py-2.5 rounded-xl border border-[#D8D2C5] bg-[#F8F6F0] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Nama Gerai Mitra</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Contoh: Dapur Barokah"
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-[#D8D2C5] bg-[#F8F6F0] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-[#1F1D1A]">PIN Staf Dapur (4 Digit)</label>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-mono">
                    Demo: 1234
                  </span>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    maxLength={6}
                    value={storePin}
                    onChange={(e) => setStorePin(e.target.value)}
                    placeholder="****"
                    className="w-full text-xs font-mono tracking-widest pl-9 pr-3 py-2.5 rounded-xl border border-[#D8D2C5] bg-[#F8F6F0] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                  />
                </div>
              </div>
            </div>

            {merchantError && (
              <p className="text-xs text-red-600 px-1 font-medium">{merchantError}</p>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <span>Buka Dashboard Dapur</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          /* Consumer Login Form */
          <form onSubmit={handleConsumerSubmit} className="mt-5 space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-[#E2DDD3] shadow-sm space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Nama Lengkap Pembeli</label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-[#D8D2C5] bg-[#F8F6F0] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">Nomor WhatsApp / HP</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="0812-xxxx-xxxx"
                    className="w-full text-xs font-mono pl-9 pr-3 py-2.5 rounded-xl border border-[#D8D2C5] bg-[#F8F6F0] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 leading-relaxed">
                💡 <strong>Food Saver Mode:</strong> Temukan surplus makanan berkualitas di sekitar kampus dengan diskon 50%–70% menjelang toko tutup.
              </div>
            </div>

            {consumerError && (
              <p className="text-xs text-red-600 px-1 font-medium">{consumerError}</p>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <span>Mulai Menyelamatkan Makanan</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      {/* Footer Info */}
      <div className="text-center text-[11px] text-[#8C867A] pb-2">
        <p>NullWasted Zero-Waste Food Rescue · 2026</p>
      </div>
    </div>
  );
};

