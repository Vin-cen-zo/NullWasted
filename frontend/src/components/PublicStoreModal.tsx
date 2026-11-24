import React, { useEffect, useState } from "react";
import { ItemListing, PublicStoreDetail, cleanLocationBadge, resolveImageUrl } from "../types/listing";
import { fetchPublicStoreDetail } from "../services/api";
import {
  X,
  Store,
  MapPin,
  Clock,
  Heart,
  ExternalLink,
  ShoppingBag,
  Utensils,
  Share2,
  Check,
  Loader2,
} from "lucide-react";

interface PublicStoreModalProps {
  storeId: string | null;
  onClose: () => void;
  onSelectItem: (item: ItemListing) => void;
  isFavorite: boolean;
  onToggleFavorite: (storeId: string) => void;
}

export const PublicStoreModal: React.FC<PublicStoreModalProps> = ({
  storeId,
  onClose,
  onSelectItem,
  isFavorite,
  onToggleFavorite,
}) => {
  const [detail, setDetail] = useState<PublicStoreDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!storeId) {
      setDetail(null);
      return;
    }
    let active = true;
    setIsLoading(true);
    setErrorMsg(null);
    fetchPublicStoreDetail(storeId)
      .then((res) => {
        if (active) setDetail(res);
      })
      .catch((err) => {
        if (active) setErrorMsg(err instanceof Error ? err.message : "Gagal memuat profil gerai.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [storeId, onClose]);

  if (!storeId) return null;

  const handleShare = async () => {
    const url = `${window.location.origin}/store/${encodeURIComponent(storeId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const safeMapsUrl =
    detail?.store.maps_url && /^https?:\/\//i.test(detail.store.maps_url.trim())
      ? detail.store.maps_url.trim()
      : null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-[#181C2E] truncate">
                {detail?.store.name || "Profil Gerai Mitra"}
              </h2>
              <p className="text-xs text-[#646982] truncate">
                {detail?.store.category || "Kuliner & Makanan"} · ID: {storeId}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onToggleFavorite(storeId)}
              aria-label={isFavorite ? "Hapus gerai favorit" : "Simpan gerai favorit"}
              className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
              title={isFavorite ? "Hapus dari Gerai Favorit" : "Tambahkan ke Gerai Favorit"}
            >
              <Heart
                className={`w-4 h-4 ${isFavorite ? "fill-rose-500 text-rose-500" : "text-[#646982]"}`}
              />
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="h-9 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-bold text-[#181C2E] flex items-center gap-1.5 cursor-pointer"
              title="Salin tautan profil gerai"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copiedLink ? "Tersalin" : "Bagikan"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup profil gerai"
              className="w-9 h-9 rounded-lg bg-[#ECF0F4] hover:bg-slate-200 flex items-center justify-center text-[#181C2E] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-[#646982] gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            <span className="text-xs font-medium">Memuat informasi gerai...</span>
          </div>
        ) : errorMsg ? (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
            {errorMsg}
          </div>
        ) : detail ? (
          <>
            <div className="p-4 rounded-xl bg-[#F0F5FA] space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white font-bold text-emerald-700">
                  <Utensils className="w-3.5 h-3.5" />
                  {detail.store.category || "Kuliner & Makanan"}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white font-bold text-[#181C2E]">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  Tutup {detail.store.closing_time} WIB
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5 text-[#32343E] min-w-0">
                  <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="truncate font-medium">
                    {cleanLocationBadge(detail.store.location_name)}
                  </span>
                </div>
                {safeMapsUrl && (
                  <a
                    href={safeMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-white text-[#181C2E] font-bold inline-flex items-center gap-1 shrink-0 hover:bg-slate-50"
                  >
                    <span>Maps</span>
                    <ExternalLink className="w-3 h-3 text-emerald-600" />
                  </a>
                )}
              </div>

              {detail.store.description && (
                <p className="text-[#646982] leading-relaxed pt-1 border-t border-slate-200/70">
                  {detail.store.description}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#181C2E]">
                  Menu Surplus Aktif ({detail.active_listing_count})
                </h3>
              </div>

              {detail.active_listings.length === 0 ? (
                <div className="p-6 rounded-xl bg-[#F6F6F6] text-center text-xs text-[#646982]">
                  Belum ada makanan surplus yang sedang tayang di gerai ini.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {detail.active_listings.map((item) => {
                    const img = resolveImageUrl(item.image_url, item.is_bundle);
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          onClose();
                          onSelectItem(item);
                        }}
                        className="p-3 rounded-xl border border-slate-200 hover:border-emerald-400 bg-white flex gap-3 cursor-pointer transition-all"
                      >
                        {img && (
                          <img
                            src={img}
                            alt={item.food_name}
                            className="w-16 h-16 rounded-lg object-cover shrink-0 bg-[#F0F5FA]"
                          />
                        )}
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <p className="text-sm font-bold text-[#181C2E] truncate">{item.food_name}</p>
                            <p className="text-[11px] text-[#646982]">
                              Sisa {item.quantity} porsi · {item.discount_percent}% OFF
                            </p>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-sm font-bold text-emerald-600 tabular-nums">
                              Rp {item.discounted_price.toLocaleString("id-ID")}
                            </span>
                            <span className="text-[11px] font-bold text-emerald-700 inline-flex items-center gap-1">
                              <ShoppingBag className="w-3 h-3" />
                              Pesan
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
