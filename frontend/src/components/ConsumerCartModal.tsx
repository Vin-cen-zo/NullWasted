import React from "react";
import { CartItem, resolveImageUrl } from "../types/listing";
import { X, ShoppingCart, Plus, Minus, Trash2, Banknote, Store, ArrowRight } from "lucide-react";

interface ConsumerCartModalProps {
  isOpen: boolean;
  items: CartItem[];
  onClose: () => void;
  onUpdateQty: (listingId: string, nextQty: number) => void;
  onRemoveItem: (listingId: string) => void;
  onClearCart: () => void;
  onCheckout: (paymentMethod: string) => Promise<void>;
  isCheckingOut: boolean;
  isGuest: boolean;
}

export const ConsumerCartModal: React.FC<ConsumerCartModalProps> = ({
  isOpen,
  items,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onCheckout,
  isCheckingOut,
  isGuest,
}) => {
  const paymentMethod = "CASH_ON_PICKUP";

  if (!isOpen) return null;

  const storeName = items[0]?.listing.store_name || "Gerai Mitra";
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const totalOriginal = items.reduce((s, i) => s + i.listing.original_price * i.quantity, 0);
  const totalPrice = items.reduce((s, i) => s + i.listing.discounted_price * i.quantity, 0);
  const totalSavings = Math.max(0, totalOriginal - totalPrice);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#181C2E]">Keranjang Belanja ({totalQty})</h2>
              {items.length > 0 && (
                <p className="text-xs text-[#646982] flex items-center gap-1">
                  <Store className="w-3 h-3 text-emerald-600" />
                  <span>{storeName} (1 Gerai · 1 Tiket QR)</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup keranjang"
            className="w-9 h-9 rounded-lg bg-[#ECF0F4] hover:bg-slate-200 flex items-center justify-center text-[#181C2E] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-[#181C2E]">Keranjang Masih Kosong</p>
            <p className="text-xs text-[#646982]">
              Tambahkan beberapa menu dari 1 gerai yang sama untuk checkout sekaligus dalam 1 tiket QR.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2.5">
              {items.map(({ listing, quantity }) => {
                const img = resolveImageUrl(listing.image_url, listing.is_bundle);
                return (
                  <div
                    key={listing.id}
                    className="p-3 rounded-xl bg-[#F0F5FA] border border-slate-200 flex items-center gap-3"
                  >
                    {img && (
                      <img
                        src={img}
                        alt={listing.food_name}
                        className="w-14 h-14 rounded-lg object-cover shrink-0 bg-white"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#181C2E] truncate">{listing.food_name}</p>
                      <p className="text-xs font-bold text-emerald-700 tabular-nums">
                        Rp {listing.discounted_price.toLocaleString("id-ID")} / porsi
                      </p>
                      <p className="text-[11px] text-[#646982]">Maks tersedia: {listing.quantity} porsi</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onUpdateQty(listing.id, quantity - 1)}
                        className="w-7 h-7 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center cursor-pointer"
                        aria-label="Kurangi"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold tabular-nums w-5 text-center">{quantity}</span>
                      <button
                        type="button"
                        disabled={quantity >= listing.quantity}
                        onClick={() => onUpdateQty(listing.id, quantity + 1)}
                        className="w-7 h-7 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                        aria-label="Tambah"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(listing.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                        aria-label="Hapus item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-[#646982]">
                <span>Harga Normal ({totalQty} porsi)</span>
                <span className="line-through tabular-nums">Rp {totalOriginal.toLocaleString("id-ID")}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Total Hemat Surplus</span>
                <span className="tabular-nums">- Rp {totalSavings.toLocaleString("id-ID")}</span>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-[#181C2E] pt-2 border-t border-slate-200">
                <span>Total Bayar</span>
                <span className="text-emerald-600 tabular-nums">Rp {totalPrice.toLocaleString("id-ID")}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-bold text-emerald-900">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>Metode: Tunai di Kasir (Cash on Pickup)</span>
              </div>
              <button
                type="button"
                onClick={onClearCart}
                className="text-red-600 hover:underline font-semibold cursor-pointer"
              >
                Kosongkan
              </button>
            </div>

            <button
              type="button"
              disabled={isCheckingOut}
              onClick={() => void onCheckout(paymentMethod)}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
            >
              <span>
                {isCheckingOut
                  ? "Memproses Reservasi Atomik..."
                  : isGuest
                  ? "Masuk untuk Checkout Keranjang"
                  : `Checkout ${totalQty} Porsi · Rp ${totalPrice.toLocaleString("id-ID")}`}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
