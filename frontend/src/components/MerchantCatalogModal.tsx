import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  bulkCreateStoreMenuItems,
  BulkMenuImportPreviewItem,
  createStoreMenuItem,
  deleteStoreMenuItem,
  fetchStoreMenu,
  previewBulkMenuImport,
  updateStoreMenuItem,
  uploadMenuImage,
} from "../services/api";
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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Mode toggle: single vs bulk AI import
  const [inputMode, setInputMode] = useState<"single" | "bulk">("single");

  // Bulk AI import states
  const [bulkText, setBulkText] = useState("");
  const [bulkImageFile, setBulkImageFile] = useState<File | null>(null);
  const [bulkImagePreview, setBulkImagePreview] = useState<string | null>(null);
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const [bulkPreviewItems, setBulkPreviewItems] = useState<BulkMenuImportPreviewItem[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);
  const bulkPreviewUrlRef = useRef<string | null>(null);

  // Form states
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [foodName, setFoodName] = useState("");
  const [price, setPrice] = useState("");
  const [cookHour, setCookHour] = useState("16");
  const [cookMinute, setCookMinute] = useState("00");
  const [ingredients, setIngredients] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minuteOptions = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

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

  const revokeBulkPreviewUrl = () => {
    if (bulkPreviewUrlRef.current) {
      URL.revokeObjectURL(bulkPreviewUrlRef.current);
      bulkPreviewUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      revokePreviewUrl();
      revokeBulkPreviewUrl();
    };
  }, []);

  const handleBulkImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setErrorMsg(null);
      const compressed = await compressImageFile(file, 1600, 0.85);
      revokeBulkPreviewUrl();
      const preview = URL.createObjectURL(compressed);
      bulkPreviewUrlRef.current = preview;
      setBulkImagePreview(preview);
      setBulkImageFile(compressed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memproses foto buku menu.";
      setErrorMsg(msg);
    }
  };

  const handleRemoveBulkImage = () => {
    revokeBulkPreviewUrl();
    setBulkImagePreview(null);
    setBulkImageFile(null);
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
  };

  const handleBulkAnalyze = async () => {
    if (!bulkText.trim() && !bulkImageFile) {
      setErrorMsg("Tempel daftar menu atau unggah foto buku menu terlebih dahulu.");
      return;
    }
    try {
      setBulkAnalyzing(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await previewBulkMenuImport(storeId, {
        rawText: bulkText,
        imageFile: bulkImageFile,
      });
      setBulkPreviewItems(res.items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menganalisis daftar menu dengan AI.";
      setErrorMsg(msg);
    } finally {
      setBulkAnalyzing(false);
    }
  };

  const inferPreviewBpom = (foodNameVal: string, ingredientsVal: string, fallback: BulkMenuImportPreviewItem) => {
    const combined = `${foodNameVal} ${ingredientsVal}`.toLowerCase();
    const highRiskKeywords = [
      "santan", "susu", "krim", "cream", "vla", "mayones", "mayo",
      "sushi", "sashimi", "mentah", "gulai", "opor", "rendang", "lodeh", "soto betawi", "cendol",
    ];
    const lowRiskKeywords = [
      "roti", "croissant", "donat", "pastry", "bolu", "brownies", "kue kering", "cookies", "baguette",
    ];
    if (highRiskKeywords.some((k) => combined.includes(k))) {
      return { category: "HIGH_PERISHABILITY", bpom_max_hours: 4.0 };
    }
    if (lowRiskKeywords.some((k) => combined.includes(k))) {
      return { category: "LOW_PERISHABILITY", bpom_max_hours: 24.0 };
    }
    return {
      category: fallback.category === "HIGH_PERISHABILITY" || fallback.category === "LOW_PERISHABILITY"
        ? "MEDIUM_PERISHABILITY"
        : fallback.category,
      bpom_max_hours: 8.0,
    };
  };

  const handleUpdateBulkItem = (
    idx: number,
    patch: Partial<BulkMenuImportPreviewItem>
  ) => {
    setBulkPreviewItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const next = { ...item, ...patch };
        if (patch.ingredients !== undefined || patch.food_name !== undefined) {
          const bpom = inferPreviewBpom(next.food_name, next.ingredients, item);
          next.category = bpom.category;
          next.bpom_max_hours = bpom.bpom_max_hours;
        }
        return next;
      })
    );
  };

  const handleRemoveBulkItem = (idx: number) => {
    setBulkPreviewItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleBulkSaveAll = async () => {
    const validItems = bulkPreviewItems.filter(
      (it) =>
        it.can_save &&
        it.food_name.trim().length >= 2 &&
        it.ingredients.trim().length >= 3 &&
        it.original_price >= 1000
    );
    if (validItems.length === 0) {
      setErrorMsg("Tidak ada menu valid untuk disimpan. Pastikan nama, harga (>= Rp 1.000), dan komposisi terisi.");
      return;
    }
    try {
      setBulkSaving(true);
      setErrorMsg(null);
      await bulkCreateStoreMenuItems(
        storeId,
        validItems.map((it) => ({
          food_name: it.food_name.trim(),
          original_price: Math.max(1000, Math.min(2000000, Math.round(it.original_price))),
          ingredients: it.ingredients.trim(),
          typical_cooking_time: it.typical_cooking_time || "16:00",
          default_hours_cooked: 1.0,
        }))
      );
      setSuccessMsg(`Berhasil menyimpan ${validItems.length} menu sekaligus ke Buku Menu Gerai!`);
      setBulkText("");
      handleRemoveBulkImage();
      setBulkPreviewItems([]);
      await loadMenu();
      if (onMenuUpdated) onMenuUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan menu massal.";
      setErrorMsg(msg);
    } finally {
      setBulkSaving(false);
    }
  };

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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingMenuId(null);
    setFoodName("");
    setPrice("");
    setCookHour("16");
    setCookMinute("00");
    setIngredients("");
    handleRemoveImage();
  };

  const handleStartEdit = (item: StoreMenuItem) => {
    setInputMode("single");
    setEditingMenuId(item.id);
    setFoodName(item.food_name);
    setPrice(String(item.original_price));
    const [h, m] = (item.typical_cooking_time || "16:00").split(":");
    setCookHour((h || "16").padStart(2, "0"));
    setCookMinute((m || "00").padStart(2, "0"));
    setIngredients(item.ingredients || "");
    revokePreviewUrl();
    setUploadedImageUrl(item.image_url || null);
    setImagePreviewUrl(resolveImageUrl(item.image_url));
    setCompressedSizeKb(null);
    setErrorMsg(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodName.trim() || !price) return;

    const numPrice = parseInt(price, 10);
    if (isNaN(numPrice) || numPrice < 1000 || numPrice > 2000000) {
      setErrorMsg("Harga normal harus antara Rp 1.000 hingga Rp 2.000.000.");
      return;
    }

    const cookingTime = `${cookHour}:${cookMinute}`;
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(cookingTime)) {
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
      if (editingMenuId) {
        await updateStoreMenuItem(storeId, editingMenuId, {
          food_name: foodName.trim(),
          original_price: numPrice,
          typical_cooking_time: cookingTime,
          ingredients: ingredients.trim(),
          image_url: uploadedImageUrl,
        });
      } else {
        await createStoreMenuItem(storeId, {
          food_name: foodName.trim(),
          original_price: numPrice,
          typical_cooking_time: cookingTime,
          default_hours_cooked: 1.0,
          ingredients: ingredients.trim(),
          image_url: uploadedImageUrl,
        });
      }
      resetForm();
      await loadMenu();
      if (onMenuUpdated) onMenuUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan menu.";
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#F0F5FA] flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm text-[#181C2E] truncate">Buku Menu Gerai (Store Master)</h2>
              <p className="text-xs text-[#646982] truncate">{storeName} ({storeId})</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup buku menu gerai"
            className="p-2 rounded-lg hover:bg-[#F0F5FA] text-[#646982] hover:text-[#181C2E] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto space-y-5 bg-[#FAFBFC]">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                {successMsg}
              </span>
              <button
                type="button"
                onClick={() => setSuccessMsg(null)}
                className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Mode Toggle Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setInputMode("single");
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                inputMode === "single"
                  ? "bg-white text-[#181C2E] shadow-xs"
                  : "text-[#646982] hover:text-[#181C2E]"
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tambah Satuan</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMode("bulk");
                setEditingMenuId(null);
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                inputMode === "bulk"
                  ? "bg-white text-[#181C2E] shadow-xs"
                  : "text-[#646982] hover:text-[#181C2E]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Impor Massal (Teks / Foto AI)</span>
            </button>
          </div>

          {inputMode === "bulk" ? (
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-xs uppercase tracking-wider text-[#181C2E] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Impor Daftar Menu Lengkap via AI</span>
                </h3>
                {bulkPreviewItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBulkPreviewItems([])}
                    className="text-xs font-bold text-[#646982] hover:text-[#181C2E] cursor-pointer"
                  >
                    Reset Pratinjau
                  </button>
                )}
              </div>

              <p className="text-xs text-[#646982] bg-[#F0F5FA] rounded-xl px-3 py-2 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Tempel daftar menu (teks) dan/atau unggah foto buku menu. AI otomatis mengekstrak nama, harga, estimasi komposisi, serta batas simpan BPOM untuk Anda tinjau sebelum disimpan sekaligus.
                </span>
              </p>

              {bulkPreviewItems.length === 0 ? (
                <>
                  <div>
                    <label htmlFor="bulk-menu-text" className="block text-xs font-semibold text-[#646982] mb-1">
                      Daftar Menu (Teks / Copy-Paste)
                    </label>
                    <textarea
                      id="bulk-menu-text"
                      rows={4}
                      placeholder={"Contoh:\nNasi Goreng Spesial 25rb\nAyam Bakar Madu 28rb\nGulai Kambing 35rb\nRoti Keju 12rb, Es Teh Manis 6rb"}
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#F0F5FA] focus:bg-white text-[#181C2E] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 transition resize-y"
                    />
                  </div>

                  {/* Photo Upload for Menu Book */}
                  <div>
                    <label htmlFor="bulk-menu-photo" className="block text-xs font-semibold text-[#646982] mb-1.5">
                      Atau Unggah Foto Buku Menu (Opsional)
                    </label>
                    <div className="flex items-center gap-3">
                      {bulkImagePreview ? (
                        <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-slate-100 shadow-xs">
                          <img src={bulkImagePreview} alt="Foto Buku Menu" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={handleRemoveBulkImage}
                            className="absolute top-1 right-1 p-0.5 bg-black/60 hover:bg-black/80 text-white rounded-lg transition cursor-pointer"
                            title="Hapus Foto"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor="bulk-menu-photo"
                          className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/50 flex flex-col items-center justify-center cursor-pointer transition shrink-0 text-[#A0A5BA] hover:text-emerald-600"
                        >
                          <Upload className="w-5 h-5 mb-0.5" />
                          <span className="text-[11px] font-semibold">Foto Menu</span>
                          <input
                            id="bulk-menu-photo"
                            ref={bulkFileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={handleBulkImageChange}
                          />
                        </label>
                      )}
                      <div className="text-xs text-[#646982]">
                        {bulkImageFile ? (
                          <p className="font-semibold text-emerald-700">
                            Foto buku menu siap dibaca AI ({Math.round(bulkImageFile.size / 1024)} KB)
                          </p>
                        ) : (
                          <p>Unggah foto daftar menu yang jelas (JPG, PNG, WebP). Bisa digabung dengan teks di atas.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleBulkAnalyze}
                    disabled={bulkAnalyzing || (!bulkText.trim() && !bulkImageFile)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {bulkAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>AI Sedang Membaca & Mengecek BPOM...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Analisis Daftar Menu dengan AI</span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#181C2E]">
                      Pratinjau 1-Tap Confirmation ({bulkPreviewItems.length} Menu)
                    </span>
                    <span className="text-[#646982]">Edit jika perlu, lalu simpan semua</span>
                  </div>

                  <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {bulkPreviewItems.map((item, idx) => {
                      const isHigh = item.category === "HIGH_PERISHABILITY";
                      const isLow = item.category === "LOW_PERISHABILITY";
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border space-y-2 ${
                            item.can_save
                              ? "bg-[#FAFBFC] border-slate-200"
                              : "bg-red-50/70 border-red-200"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div className="sm:col-span-2">
                                <label className="block text-[10px] font-bold uppercase text-[#646982] mb-0.5">
                                  Nama Menu
                                </label>
                                <input
                                  type="text"
                                  value={item.food_name}
                                  onChange={(e) =>
                                    handleUpdateBulkItem(idx, { food_name: e.target.value })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-[#181C2E] focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-[#646982] mb-0.5">
                                  Harga (Rp)
                                </label>
                                <input
                                  type="number"
                                  min={1000}
                                  max={2000000}
                                  step={500}
                                  value={item.original_price || ""}
                                  onChange={(e) => {
                                    const raw = parseInt(e.target.value, 10);
                                    handleUpdateBulkItem(idx, {
                                      original_price: Number.isNaN(raw) ? 0 : Math.min(2000000, Math.max(0, raw)),
                                    });
                                  }}
                                  onBlur={() => {
                                    if (!item.original_price || item.original_price < 1000) {
                                      handleUpdateBulkItem(idx, { original_price: 1000 });
                                    }
                                  }}
                                  className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-[#181C2E] tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveBulkItem(idx)}
                              className="p-1.5 mt-4 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                              title="Hapus dari pratinjau"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold uppercase text-[#646982] mb-0.5">
                              Komposisi / Bahan Utama (Auto AI — bisa diedit)
                            </label>
                            <input
                              type="text"
                              value={item.ingredients}
                              onChange={(e) =>
                                handleUpdateBulkItem(idx, { ingredients: e.target.value })
                              }
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-[#181C2E] focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            {item.can_save ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold ${
                                  isHigh
                                    ? "bg-amber-100 text-amber-800"
                                    : isLow
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-sky-100 text-sky-800"
                                }`}
                              >
                                <ShieldCheck className="w-3 h-3" />
                                BPOM Maks {item.bpom_max_hours}j ({item.food_type})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700">
                                <AlertTriangle className="w-3 h-3" />
                                Ditolak: {item.safety_reason}
                              </span>
                            )}
                            <span className="text-[#A0A5BA] truncate max-w-[160px]">
                              Ref: {item.canonical_bpom_dish}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleBulkSaveAll}
                    disabled={bulkSaving || bulkPreviewItems.filter((i) => i.can_save).length === 0}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {bulkSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menyimpan Semua Menu...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          Simpan Semua ({bulkPreviewItems.filter((i) => i.can_save).length} Menu) ke Buku Menu
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
          /* Form Tambah Menu Rutin */
          <form onSubmit={handleCreate} className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-[#181C2E] flex items-center gap-1.5">
                {editingMenuId ? <Pencil className="w-3.5 h-3.5 text-emerald-600" /> : <Plus className="w-3.5 h-3.5 text-emerald-600" />}
                <span>{editingMenuId ? "Edit Hidangan Buku Menu" : "Tambah Hidangan Rutin ke Katalog"}</span>
              </h3>
              {editingMenuId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-bold text-[#646982] hover:text-[#181C2E] cursor-pointer"
                >
                  Batal Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="catalog-food-name" className="block text-xs font-semibold text-[#646982] mb-1">
                  Nama Hidangan <span className="text-red-500">*</span>
                </label>
                <input
                  id="catalog-food-name"
                  name="foodName"
                  type="text"
                  placeholder="mis. Rendang Daging Sapi"
                  value={foodName}
                  onChange={(e) => setFoodName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#F0F5FA] focus:bg-white text-[#181C2E] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 transition"
                  required
                />
              </div>

              <div>
                <label htmlFor="catalog-price" className="block text-xs font-semibold text-[#646982] mb-1">
                  Harga Normal (Rp) <span className="text-red-500">*</span>
                </label>
                <input
                  id="catalog-price"
                  name="originalPrice"
                  type="number"
                  min={1000}
                  max={2000000}
                  placeholder="24000"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#F0F5FA] focus:bg-white text-[#181C2E] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 transition"
                  required
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-[#646982] mb-1">
                  Jam Masak Default (Opsional)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    id="catalog-cook-hour"
                    name="cookHour"
                    aria-label="Jam masak (00 sampai 23)"
                    value={cookHour}
                    onChange={(e) => setCookHour(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-[#F0F5FA] focus:bg-white tabular-nums font-bold text-[#181C2E] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                  >
                    {hourOptions.map((h) => (
                      <option key={h} value={h}>
                        {h}:00
                      </option>
                    ))}
                  </select>
                  <select
                    id="catalog-cook-minute"
                    name="cookMinute"
                    aria-label="Menit masak (00 sampai 55)"
                    value={cookMinute}
                    onChange={(e) => setCookMinute(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-[#F0F5FA] focus:bg-white tabular-nums font-bold text-[#181C2E] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                  >
                    {minuteOptions.map((m) => (
                      <option key={m} value={m}>
                        :{m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="sm:col-span-2">
                <p className="text-xs text-[#646982] bg-[#F0F5FA] rounded-xl px-3 py-2 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Klasifikasi keamanan & batas simpan BPOM dideteksi otomatis oleh AI dari nama & komposisi menu.</span>
                </p>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="catalog-ingredients" className="block text-xs font-semibold text-[#646982] mb-1">
                  Komposisi / Bahan <span className="text-red-500">*</span>
                </label>
                <input
                  id="catalog-ingredients"
                  name="ingredients"
                  type="text"
                  placeholder="Daging sapi, santan kelapa, bumbu rempah padang"
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value)}
                  minLength={3}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#F0F5FA] focus:bg-white text-[#181C2E] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 transition"
                  required
                />
              </div>

              {/* Optional Photo Upload */}
              <div className="sm:col-span-2 pt-2 border-t border-slate-200">
                <label htmlFor="catalog-photo-upload" className="block text-xs font-semibold text-[#646982] mb-1.5">
                  Foto Makanan (Opsional)
                </label>
                <div className="flex items-center gap-3">
                  {imagePreviewUrl ? (
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-slate-100 shadow-xs">
                      <img src={imagePreviewUrl} alt="Pratinjau Foto" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute top-1 right-1 p-0.5 bg-black/60 hover:bg-black/80 text-white rounded-lg transition cursor-pointer"
                        title="Hapus Foto"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="catalog-photo-upload"
                      className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/50 flex flex-col items-center justify-center cursor-pointer transition shrink-0 text-[#A0A5BA] hover:text-emerald-600"
                    >
                      <Camera className="w-5 h-5 mb-0.5" />
                      <span className="text-[11px] font-semibold">Upload</span>
                      <input
                        id="catalog-photo-upload"
                        name="photoUpload"
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
                      <p className="text-xs text-[#646982]">
                        Upload foto (JPG, PNG, WebP).
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || imageUploading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {editingMenuId ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>
                {submitting
                  ? "Menyimpan ke BPOM Guardrail..."
                  : editingMenuId
                  ? "Simpan Perubahan Menu"
                  : "Simpan ke Buku Menu"}
              </span>
            </button>
          </form>
          )}

          {/* Daftar Menu Aktif */}
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#646982] mb-2.5 flex items-center justify-between">
              <span>Menu Terdaftar ({menuItems.length})</span>
              <span className="text-xs font-normal text-[#A0A5BA]">Katalog Rutin Aktif</span>
            </h3>

            {loading ? (
              <p className="text-sm text-[#646982] py-4 text-center">Memuat daftar menu gerai...</p>
            ) : menuItems.length === 0 ? (
              <div className="py-6 px-4 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center space-y-2">
                <img
                  src="/assets/empty_store.jpg"
                  alt="Belum ada menu tersimpan"
                  className="w-24 h-24 object-contain"
                />
                <p className="text-sm font-bold text-[#181C2E]">Belum Ada Menu Tersimpan</p>
                <p className="text-xs text-[#646982]">
                  Tambahkan hidangan rutin gerai Anda pada form di atas.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {menuItems.map((item) => {
                  const resolvedImg = resolveImageUrl(item.image_url);
                  const isHighRisk = item.bpom_max_hours <= 4;
                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {resolvedImg && (
                          <img
                            src={resolvedImg}
                            alt={item.food_name}
                            className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm text-[#181C2E] truncate">{item.food_name}</span>
                            <span
                              className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md border flex items-center gap-1 shrink-0 ${
                                isHighRisk
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              <ShieldCheck className={`w-2.5 h-2.5 ${isHighRisk ? "text-amber-600" : "text-emerald-600"}`} />
                              <span>BPOM · Maks {item.bpom_max_hours}j</span>
                            </span>
                          </div>
                          <div className="text-xs text-[#646982] flex items-center gap-2.5 mt-1 flex-wrap">
                            <span className="font-bold text-[#181C2E]">Rp {item.original_price.toLocaleString("id-ID")}</span>
                            <span className="flex items-center gap-0.5 text-[#646982]">
                              <Clock className="w-3 h-3 text-[#A0A5BA]" />
                              <span>Masak {item.typical_cooking_time}</span>
                            </span>
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
                            className="px-2 py-1 rounded-lg bg-[#F0F5FA] hover:bg-slate-200/70 text-[#181C2E] text-[10px] font-bold cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={deletingId !== null}
                            onClick={() => handleStartEdit(item)}
                            className="text-[#646982] hover:text-emerald-600 p-1.5 rounded-lg hover:bg-emerald-50 transition shrink-0 disabled:opacity-40 cursor-pointer"
                            title="Edit menu"
                            aria-label={`Edit ${item.food_name}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={deletingId !== null}
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="text-[#A0A5BA] hover:text-red-500 p-1.5 rounded-lg hover:bg-[#F0F5FA] transition shrink-0 disabled:opacity-40 cursor-pointer"
                            title="Hapus dari Buku Menu"
                            aria-label={`Hapus ${item.food_name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white px-5 py-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#F0F5FA] hover:bg-slate-200/70 text-[#181C2E] rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
