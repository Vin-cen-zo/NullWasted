import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Camera, Clock, Loader2, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { createStoreMenuItem, deleteStoreMenuItem, fetchStoreMenu, uploadMenuImage } from "../services/api";
import { resolveImageUrl, StoreMenuItem } from "../types/listing";
import { compressImageFile } from "../utils/imageCompressor";

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
  const [submitting, setSubmitting] = useState(false);

  // Optional image upload states
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [compressedSizeKb, setCompressedSizeKb] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const revokePreviewUrl = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      revokePreviewUrl();
    };
  }, []);

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImageUploading(true);
      setErrorMsg(null);
      const compressed = await compressImageFile(file, 800, 0.8);
      setCompressedSizeKb(Math.round(compressed.size / 1024));

      revokePreviewUrl();
      const preview = URL.createObjectURL(compressed);
      previewUrlRef.current = preview;
      setImagePreviewUrl(preview);

      const res = await uploadMenuImage(compressed);
      setUploadedImageUrl(res.image_url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mengunggah foto makanan.";
      setErrorMsg(msg);
      revokePreviewUrl();
      setImagePreviewUrl(null);
      setUploadedImageUrl(null);
      setCompressedSizeKb(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setImageUploading(false);
    }
  };

  const handleRemoveImage = () => {
    revokePreviewUrl();
    setUploadedImageUrl(null);
    setImagePreviewUrl(null);
    setCompressedSizeKb(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
        default_hours_cooked: 1.0,
        ingredients: ingredients.trim(),
        portion_size: "Reguler",
        image_url: uploadedImageUrl,
      });
      setFoodName("");
      setPrice("");
      setIngredients("");
      handleRemoveImage();
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
    if (deletingId) return;
    try {
      setDeletingId(menuId);
      setErrorMsg(null);
      await deleteStoreMenuItem(storeId, menuId);
      setConfirmDeleteId(null);
      await loadMenu();
      if (onMenuUpdated) onMenuUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus menu.";
      setErrorMsg(msg);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-stone-50 rounded-xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
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
                <label className="block text-xs font-semibold text-stone-600 mb-0.5">
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
                <label className="block text-xs font-semibold text-stone-600 mb-0.5">
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
                <label className="block text-xs font-semibold text-stone-600 mb-0.5">
                  Jam Masak (24 Jam) <span className="text-red-500">*</span>
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

              <div className="col-span-2">
                <p className="text-xs text-[#646982] bg-[#F0F5FA] rounded-lg px-3 py-2 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Klasifikasi keamanan & batas simpan BPOM dideteksi otomatis oleh AI dari nama & komposisi menu.</span>
                </p>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-semibold text-stone-600 mb-0.5">
                  Komposisi / Bahan <span className="text-red-500">*</span>
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

              {/* Optional Photo Upload */}
              <div className="col-span-2 pt-1 border-t border-stone-100">
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  Foto Makanan (Opsional)
                </label>
                <div className="flex items-center gap-3">
                  {imagePreviewUrl ? (
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-stone-200 shrink-0 bg-stone-100 shadow-xs">
                      <img src={imagePreviewUrl} alt="Pratinjau Foto" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute top-1 right-1 p-0.5 bg-black/60 hover:bg-black/80 text-white rounded-lg transition"
                        title="Hapus Foto"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-16 h-16 rounded-xl border-2 border-dashed border-stone-300 hover:border-emerald-500 hover:bg-emerald-50/50 flex flex-col items-center justify-center cursor-pointer transition shrink-0 text-stone-400 hover:text-emerald-600">
                      <Camera className="w-5 h-5 mb-0.5" />
                      <span className="text-[11px] font-semibold">Upload</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleImageFileChange}
                        disabled={imageUploading}
                      />
                    </label>
                  )}
                  <div className="flex-1 text-xs">
                    {imageUploading ? (
                      <div className="flex items-center space-x-1.5 text-emerald-600 font-semibold text-xs">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Mengompresi & mengunggah foto...</span>
                      </div>
                    ) : imagePreviewUrl ? (
                      <p className="text-xs text-emerald-700 font-semibold">
                        Foto siap disimpan {compressedSizeKb ? `(~${compressedSizeKb} KB WebP)` : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-stone-500">
                        Upload foto (JPG, PNG, dst).
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || imageUploading}
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
              <span className="text-xs font-normal text-stone-500">Katalog Rutin Aktif</span>
            </h3>

            {loading ? (
              <p className="text-sm text-[#646982] py-4 text-center">Memuat daftar menu gerai...</p>
            ) : menuItems.length === 0 ? (
              <div className="py-6 px-4 bg-white rounded-xl flex flex-col items-center justify-center text-center space-y-2">
                <img
                  src="/assets/empty_store.jpg"
                  alt="Belum ada menu tersimpan"
                  className="w-24 h-24 object-contain"
                />
                <p className="text-sm font-bold text-[#222222]">Belum Ada Menu Tersimpan</p>
                <p className="text-xs text-[#646982]">
                  Tambahkan hidangan rutin gerai Anda pada form di atas.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {menuItems.map((item) => {
                  const resolvedImg = resolveImageUrl(item.image_url);
                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-white rounded-xl border border-stone-200 shadow-sm flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {resolvedImg && (
                          <img
                            src={resolvedImg}
                            alt={item.food_name}
                            className="w-12 h-12 rounded-lg object-cover border border-stone-200 shrink-0 bg-stone-100"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="font-normal text-sm text-[#222222] truncate">{item.food_name}</span>
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 flex items-center space-x-1 shrink-0">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              <span>BPOM · Maks {item.bpom_max_hours}j</span>
                            </span>
                          </div>
                          <div className="text-xs text-stone-500 flex items-center space-x-3 mt-1">
                            <span className="font-semibold text-stone-700">Rp {item.original_price.toLocaleString("id-ID")}</span>
                            <span className="flex items-center space-x-0.5 text-stone-400">
                              <Clock className="w-3 h-3" />
                              <span>Masak {item.typical_cooking_time}</span>
                            </span>
                            <span className="text-stone-400 truncate max-w-[120px]">{item.canonical_bpom_dish}</span>
                          </div>
                        </div>
                      </div>
                      {confirmDeleteId === item.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => handleDelete(item.id)}
                            className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold disabled:opacity-50 cursor-pointer"
                          >
                            {deletingId === item.id ? "..." : "Ya"}
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 text-[10px] font-bold cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={deletingId !== null}
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="text-stone-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-stone-100 transition shrink-0 disabled:opacity-40 cursor-pointer"
                          title="Hapus dari Buku Menu"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
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
