import React, { useState } from "react";
import { ItemListing, getFriendlyCategory } from "../types/listing";
import { Trash2, PlusCircle, ShieldCheck, Sparkles, Package, ChevronDown, Minus, Plus, X, Check } from "lucide-react";
import { ClosingCountdownBadge } from "./ClosingCountdownBadge";

interface MerchantInventoryScreenProps {
  listings: ItemListing[];
  onDeleteListing: (id: string) => Promise<void>;
  onUpdateStock?: (id: string, quantity: number) => Promise<void>;
  onNavigateToCreate: () => void;
  onCreateSmartBundle?: (discountPercent: number, customName?: string, listingIds?: string[]) => Promise<void>;
  storeName: string;
}

export const MerchantInventoryScreen: React.FC<MerchantInventoryScreenProps> = ({
  listings,
  onDeleteListing,
  onUpdateStock,
  onNavigateToCreate,
  onCreateSmartBundle,
  storeName,
}) => {
  const [isBundling, setIsBundling] = useState(false);
  const [isBundleModalOpen, setIsBundleModalOpen] = useState(false);
  const [selectedBundleIds, setSelectedBundleIds] = useState<string[]>([]);
  const [bundleName, setBundleName] = useState("");
  const [bundleDiscount, setBundleDiscount] = useState(65);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingStockId, setUpdatingStockId] = useState<string | null>(null);
  const [expandedBundleIds, setExpandedBundleIds] = useState<Record<string, boolean>>({});

  const handleStepStock = async (id: string, nextQty: number) => {
    if (!onUpdateStock || updatingStockId) return;
    if (nextQty < 0 || nextQty > 200) return;
    if (nextQty === 0) {
      const ok = window.confirm("Set stok ke 0 akan menonaktifkan listing ini dari katalog. Lanjutkan?");
      if (!ok) return;
    }
    try {
      setUpdatingStockId(id);
      await onUpdateStock(id, nextQty);
    } finally {
      setUpdatingStockId(null);
    }
  };

  const toggleBundleExpanded = (id: string) => {
    setExpandedBundleIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConfirmDelete = async (id: string) => {
    if (deletingId) return;
    try {
      setDeletingId(id);
      await onDeleteListing(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  // Count items eligible for mystery bag bundling (qty 1 or 2, not already a bundle, safe)
  const eligibleItems = listings.filter(
    (item) => !item.is_bundle && item.is_active && item.quantity >= 1 && item.quantity <= 2
  );

  const openBundleBuilder = () => {
    if (eligibleItems.length < 2) return;
    // Auto-select largest group sharing the same food_type (e.g. BAKERY or MEAL)
    const groups: Record<string, ItemListing[]> = {};
    eligibleItems.forEach((item) => {
      const ft = (item.food_type || "MEAL").toUpperCase();
      if (!groups[ft]) groups[ft] = [];
      groups[ft].push(item);
    });
    const bestGroup = Object.values(groups).sort((a, b) => b.length - a.length)[0] || eligibleItems;
    const defaultSelected = bestGroup.length >= 2 ? bestGroup : eligibleItems;
    setSelectedBundleIds(defaultSelected.map((i) => i.id));
    const allBakery = defaultSelected.every((i) => (i.food_type || "").toUpperCase() === "BAKERY");
    setBundleName(allBakery ? "Mystery Bakery & Pastry Bag" : "Paket Kejutan Lauk & Makanan Hemat");
    setBundleDiscount(65);
    setIsBundleModalOpen(true);
  };

  const toggleBundleItemSelection = (id: string) => {
    setSelectedBundleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectedBundleItems = eligibleItems.filter((i) => selectedBundleIds.includes(i.id));
  const previewNormalTotal = selectedBundleItems.reduce((sum, i) => sum + i.original_price * i.quantity, 0);
  const previewBundlePrice = Math.floor((previewNormalTotal * (1 - bundleDiscount / 100)) / 100) * 100;
  const previewMinBpom =
    selectedBundleItems.length > 0
      ? Math.min(...selectedBundleItems.map((i) => i.bpom_max_hours))
      : 0;

  const handleConfirmBundle = async () => {
    if (!onCreateSmartBundle || isBundling || selectedBundleIds.length < 2) return;
    try {
      setIsBundling(true);
      await onCreateSmartBundle(bundleDiscount, bundleName.trim() || undefined, selectedBundleIds);
      setIsBundleModalOpen(false);
    } catch (err: unknown) {
      console.error("Gagal membuat mystery bag:", err);
    } finally {
      setIsBundling(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col space-y-4">
      {/* Header Info */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-[#181C2E]">Inventaris Aktif Gerai</h2>
          <p className="text-xs text-[#646982]">{storeName} · Katalog Live</p>
        </div>
        <button
          type="button"
          onClick={onNavigateToCreate}
          className="flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Tambah Menu</span>
        </button>
      </div>

      {/* Smart Mystery Bag Bundling Action Banner */}
      <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-emerald-50 p-3.5 rounded-xl border border-purple-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <h3 className="text-xs font-bold text-purple-950">Smart Mystery Bag Bundling</h3>
          </div>
          <p className="text-xs text-purple-800">
            {eligibleItems.length >= 2
              ? `${eligibleItems.length} menu berporsi kecil siap digabung dengan diskon 65%!`
              : "Perlu minimal 2 menu porsi kecil (1-2 porsi) untuk paket kejutan."}
          </p>
        </div>

        <button
          type="button"
          disabled={eligibleItems.length < 2 || isBundling || !onCreateSmartBundle}
          onClick={openBundleBuilder}
          className={`flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition shadow-xs shrink-0 ${
            eligibleItems.length < 2 || !onCreateSmartBundle
              ? "bg-[#ECF0F4] text-[#A0A5BA] cursor-not-allowed border border-slate-200"
              : isBundling
              ? "bg-purple-300 text-white cursor-wait"
              : "bg-purple-600 hover:bg-purple-700 text-white active:scale-95 shadow-purple-500/20 cursor-pointer"
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>{isBundling ? "Menggabungkan..." : "Atur & Buat Mystery Bag"}</span>
        </button>
      </div>

      {/* Listing Cards */}
      {listings.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 px-6 text-center bg-white space-y-2.5">
          <img
            src="/assets/empty_store.jpg"
            alt="Belum ada makanan aktif"
            className="w-32 h-32 object-contain"
          />
          <div className="space-y-1">
            <p className="text-base font-bold text-[#222222]">Belum Ada Makanan Aktif</p>
            <p className="text-sm text-[#646982] max-w-xs">
              Gunakan tab Buat Listing untuk mempublikasikan menu surplus hari ini.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateToCreate}
            className="text-sm font-bold text-emerald-600 hover:underline pt-1 cursor-pointer"
          >
            Buat Listing Sekarang
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {listings.map((item) => {
            let bundledList: Array<{ food_name: string; quantity: number }> = [];
            if (item.is_bundle && item.bundled_items_json) {
              try {
                bundledList = JSON.parse(item.bundled_items_json);
              } catch {
                bundledList = [];
              }
            }

            const isBundleExpanded = Boolean(expandedBundleIds[item.id]);

            return (
              <div
                key={item.id}
                className={`bg-white p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                  item.is_bundle
                    ? "border-purple-300 bg-gradient-to-b from-purple-50/40 to-white shadow-[0_2px_8px_rgba(147,51,234,0.08)] hover:border-purple-400"
                    : "border-slate-300/80 shadow-[0_2px_8px_rgba(15,23,42,0.06)] hover:border-emerald-400 hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {item.is_bundle && (
                        <span className="px-2 py-0.5 rounded-lg bg-purple-600 text-white text-xs font-extrabold tracking-wide flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          MYSTERY BAG
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold">
                        {item.discount_percent}% OFF
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        BPOM Safe
                      </span>
                      <ClosingCountdownBadge
                        closingTime={item.closing_time || "20:30"}
                        fallbackMinutes={item.minutes_until_closing}
                        expiresAt={item.expires_at}
                      />
                    </div>
                    <h3 className="text-[15px] font-normal text-[#222222] leading-snug">{item.food_name}</h3>
                    <p className="text-xs text-[#646982]">
                      {getFriendlyCategory(item.category, item.is_bundle).label}
                    </p>

                    {/* Rincian item mystery bag (collapsible) */}
                    {item.is_bundle && bundledList.length > 0 && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => toggleBundleExpanded(item.id)}
                          aria-expanded={isBundleExpanded}
                          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-purple-50/80 hover:bg-purple-100/70 border border-purple-200/90 text-xs font-semibold text-purple-900 transition-colors cursor-pointer"
                        >
                          <span>Isi Paket Kejutan ({bundledList.length} menu)</span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-purple-700 shrink-0 transition-transform duration-200 ${
                              isBundleExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                        {isBundleExpanded && (
                          <div className="mt-1.5 p-2.5 bg-purple-50/60 border border-purple-200/80 rounded-xl text-xs text-purple-900">
                            <ul className="list-disc list-inside space-y-0.5">
                              {bundledList.map((b, idx) => (
                                <li key={idx}>
                                  {b.quantity}x {b.food_name}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {confirmDeleteId === item.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={deletingId === item.id}
                        onClick={() => handleConfirmDelete(item.id)}
                        className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold disabled:opacity-50 cursor-pointer"
                      >
                        {deletingId === item.id ? "..." : "Tarik"}
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
                    <button
                      type="button"
                      disabled={deletingId !== null}
                      onClick={() => setConfirmDeleteId(item.id)}
                      title="Tarik menu dari pasar"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 text-xs pt-2 border-t border-slate-200/80">
                  <div>
                    <span className="text-xs text-gray-400 line-through mr-1.5">
                      Rp {item.original_price.toLocaleString("id-ID")}
                    </span>
                    <span className="font-bold text-emerald-600">
                      Rp {item.discounted_price.toLocaleString("id-ID")}
                    </span>
                  </div>
                  {onUpdateStock ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={updatingStockId === item.id || item.quantity <= 0}
                        onClick={() => handleStepStock(item.id, item.quantity - 1)}
                        aria-label={`Kurangi stok ${item.food_name}`}
                        className="w-7 h-7 rounded-lg bg-[#F0F5FA] hover:bg-slate-200 flex items-center justify-center text-[#181C2E] disabled:opacity-40 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-bold text-[#181C2E] tabular-nums min-w-[54px] text-center">
                        {item.quantity} porsi
                      </span>
                      <button
                        type="button"
                        disabled={updatingStockId === item.id || item.quantity >= 200}
                        onClick={() => handleStepStock(item.id, item.quantity + 1)}
                        aria-label={`Tambah stok ${item.food_name}`}
                        className="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-right">
                      <span className="text-xs font-semibold text-[#222222]">
                        Tersisa: {item.quantity} / {item.initial_quantity} porsi
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Smart Mystery Bag 1-Tap Confirmation Modal */}
      {isBundleModalOpen && (
        <div
          onClick={() => setIsBundleModalOpen(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600" />
                <div>
                  <h3 className="text-base font-bold text-[#181C2E]">Pratinjau Smart Mystery Bag</h3>
                  <p className="text-xs text-[#646982]">Pilih minimal 2 menu porsi kecil yang cocok digabung</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBundleModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-[#ECF0F4] hover:bg-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-bold text-[#181C2E]">
                Pilih Menu ({selectedBundleIds.length} terpilih)
              </span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {eligibleItems.map((item) => {
                  const checked = selectedBundleIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleBundleItemSelection(item.id)}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                        checked
                          ? "bg-purple-50 border-purple-400"
                          : "bg-white border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                            checked ? "bg-purple-600 text-white" : "border border-slate-300 bg-white"
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#181C2E] truncate">
                            {item.quantity}x {item.food_name}
                          </p>
                          <p className="text-[11px] text-[#646982]">
                            {item.food_type || "MEAL"} · Maks BPOM {item.bpom_max_hours} jam
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-[#646982] tabular-nums shrink-0">
                        Rp {(item.original_price * item.quantity).toLocaleString("id-ID")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-bold text-[#181C2E] mb-1">Nama Paket Mystery Bag</label>
                <input
                  type="text"
                  value={bundleName}
                  onChange={(e) => setBundleName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-bold text-[#181C2E] mb-1">
                  <span>Diskon Paket Kejutan (60%–70%)</span>
                  <span className="text-purple-700">{bundleDiscount}% OFF</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={70}
                  value={bundleDiscount}
                  onChange={(e) => setBundleDiscount(Number(e.target.value))}
                  className="w-full accent-purple-600"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F0F5FA] space-y-1.5 text-xs">
              <div className="flex justify-between text-[#646982]">
                <span>Total Harga Normal</span>
                <span className="line-through tabular-nums">Rp {previewNormalTotal.toLocaleString("id-ID")}</span>
              </div>
              <div className="flex justify-between font-bold text-purple-800 text-sm">
                <span>Harga Jual Mystery Bag</span>
                <span className="tabular-nums">Rp {previewBundlePrice.toLocaleString("id-ID")}</span>
              </div>
              <div className="flex justify-between text-[11px] text-emerald-700 pt-1 border-t border-slate-200">
                <span>Batas Aman BPOM Terketat</span>
                <span className="font-bold">Maks {previewMinBpom} jam suhu ruang</span>
              </div>
            </div>

            <button
              type="button"
              disabled={selectedBundleIds.length < 2 || isBundling}
              onClick={() => void handleConfirmBundle()}
              className="w-full py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {isBundling
                  ? "Menerbitkan Mystery Bag..."
                  : `1-Tap Terbitkan Mystery Bag (${selectedBundleIds.length} Menu)`}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
