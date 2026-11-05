import React, { useEffect, useState } from "react";
import { BookOpen, Clock, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { createStoreMenuItem, deleteStoreMenuItem, fetchStoreMenu } from "../services/api";
import { StoreMenuItem } from "../types/listing";

interface MerchantCatalogModalProps {
  storeId: string;
  storeName: string;
  isOpen: boolean;
  onClose: () => void;
  onMenuUpdated?: () => void;
}

export const MerchantCatalogModal: React.FC<MerchantCatalogModalProps> = ({
  storeId,
  storeName,
  isOpen,
  onClose,
  onMenuUpdated,
}) => {
  const [menuItems, setMenuItems] = useState<StoreMenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [foodName, setFoodName] = useState("");
  const [price, setPrice] = useState("");
  const [cookingTime, setCookingTime] = useState("16:00");
  const [ingredients, setIngredients] = useState("");
  const [riskCategory, setRiskCategory] = useState<"HIGH_PERISHABILITY" | "MEDIUM_PERISHABILITY" | "LOW_PERISHABILITY">("MEDIUM_PERISHABILITY");
  const [portionSize, setPortionSize] = useState<string>("Reguler");
  const [submitting, setSubmitting] = useState(false);

  const loadMenu = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await fetchStoreMenu(storeId);
      setMenuItems(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memuat buku menu.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMenu();
    }
  }, [isOpen, storeId]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodName.trim() || !price) return;

    const numPrice = parseInt(price, 10);
    if (isNaN(numPrice) || numPrice < 1000 || numPrice > 2000000) {
      setErrorMsg("Harga normal harus antara Rp 1.000 hingga Rp 2.000.000.");
      return;
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(cookingTime.trim())) {
      setErrorMsg("Format jam masak harus 24 jam (HH:MM), contoh: 16:00.");
      return;
    }

    if (ingredients.trim().length < 3) {
      setErrorMsg("Komposisi / bahan utama wajib diisi (minimal 3 karakter) untuk verifikasi BPOM.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      await createStoreMenuItem(storeId, {
        food_name: foodName.trim(),
        original_price: numPrice,
        typical_cooking_time: cookingTime.trim(),
        default_hours_cooked: riskCategory === "HIGH_PERISHABILITY" ? 1.5 : 2.0,
        ingredients: ingredients.trim(),
        portion_size: portionSize,
      });
      setFoodName("");
      setPrice("");
      setIngredients("");
      setPortionSize("Reguler");
      await loadMenu();
      if (onMenuUpdated) onMenuUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menambah menu.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (menuId: string) => {
    try {
      await deleteStoreMenuItem(storeId, menuId);
      await loadMenu();
      if (onMenuUpdated) onMenuUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus menu.";
      setErrorMsg(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-stone-50 rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-emerald-700 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-emerald-200" />
            <div>
              <h2 className="font-bold text-base">Buku Menu Gerai (Store Master)</h2>
              <p className="text-xs text-emerald-100">{storeName} ({storeId})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-emerald-600 transition text-emerald-100 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {/* Form Tambah Menu Rutin */}
          <form onSubmit={handleCreate} className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-stone-700 flex items-center space-x-1">
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tambah Hidangan Rutin ke Katalog</span>
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                  Nama Hidangan <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="mis. Rendang Daging Sapi"
                  value={foodName}
                  onChange={(e) => setFoodName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                  Harga Normal (Rp) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1000}
                  max={2000000}
                  placeholder="24000"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                  Jam Masak Harian (24 Jam) <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  step={60}
                  value={cookingTime}
                  onChange={(e) => setCookingTime(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-0.5">Klasifikasi Risiko BPOM</label>
                <select
                  value={riskCategory}
                  onChange={(e) => setRiskCategory(e.target.value as any)}
                  className="w-full px-2 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="HIGH_PERISHABILITY">Santan / Susu / Krim (Maks 4 Jam)</option>
                  <option value="MEDIUM_PERISHABILITY">Siap Saji / Tumis (Maks 8 Jam)</option>
                  <option value="LOW_PERISHABILITY">Roti / Pastry Kering (Maks 24 Jam)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-0.5">Ukuran Porsi</label>
                <select
                  value={portionSize}
                  onChange={(e) => setPortionSize(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="Reguler">Reguler</option>
                  <option value="Kecil / Hemat">Kecil / Hemat</option>
                  <option value="Besar / Jumbo">Besar / Jumbo</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                  Komposisi / Bahan Utama (Wajib untuk Guardrail BPOM) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Daging sapi, santan kelapa, bumbu rempah padang"
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value)}
                  minLength={3}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-3 rounded-lg text-xs transition shadow-sm flex items-center justify-center space-x-1 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{submitting ? "Menyimpan ke BPOM Guardrail..." : "Simpan ke Buku Menu"}</span>
            </button>
          </form>

          {/* Daftar Menu Aktif */}
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-stone-600 mb-2 flex items-center justify-between">
              <span>Menu Terdaftar ({menuItems.length})</span>
              <span className="text-[11px] font-normal text-stone-500">Katalog Rutin Aktif</span>
            </h3>

            {loading ? (
              <p className="text-xs text-stone-400 py-3 text-center">Memuat daftar menu gerai...</p>
            ) : menuItems.length === 0 ? (
              <p className="text-xs text-stone-500 py-4 text-center bg-white rounded-xl border border-stone-200">
                Belum ada menu tersimpan di Buku Menu. Tambahkan hidangan di atas.
              </p>
            ) : (
              <div className="space-y-2">
                {menuItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-white rounded-xl border border-stone-200 shadow-sm flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs text-stone-800">{item.food_name}</span>
                        {item.portion_size && item.portion_size !== "Reguler" && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                            {item.portion_size}
                          </span>
                        )}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 flex items-center space-x-1">
                          <ShieldCheck className="w-2.5 h-2.5" />
                          <span>Max {item.bpom_max_hours}j</span>
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-500 flex items-center space-x-3 mt-1">
                        <span className="font-semibold text-stone-700">Rp {item.original_price.toLocaleString("id-ID")}</span>
                        <span className="flex items-center space-x-0.5 text-stone-400">
                          <Clock className="w-3 h-3" />
                          <span>Masak {item.typical_cooking_time}</span>
                        </span>
                        <span className="text-stone-400 truncate max-w-[140px]">{item.canonical_bpom_dish}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-stone-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-stone-100 transition"
                      title="Hapus dari Buku Menu"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-stone-100 px-5 py-3 border-t border-stone-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-300 hover:bg-stone-400 text-stone-800 rounded-lg text-xs font-semibold transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
