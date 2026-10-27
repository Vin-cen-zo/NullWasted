import React from "react";
import { Trash2, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";
import { ItemListing } from "../types/listing";

interface ActiveListingsTableProps {
  listings: ItemListing[];
  onDeleteListing: (id: string) => void;
  isLoading: boolean;
}

export const ActiveListingsTable: React.FC<ActiveListingsTableProps> = ({
  listings,
  onDeleteListing,
  isLoading,
}) => {
  return (
    <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E0D8] p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-[#1F1D1A]">
              Katalog Aktif Toko (Terkunci & Siap Ambil)
            </h3>
            <p className="text-[11px] text-[#6B7280]">
              Listing yang telah lolos verifikasi BPOM dan tayang untuk konsumen
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F8F6F0] text-[#1F1D1A] border border-[#E5E0D8]">
          Total: {listings.length} Menu
        </span>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-[#6B7280]">
          <span className="inline-block w-4 h-4 border-2 border-[#10B981] border-t-transparent rounded-full animate-spin mb-2" />
          <p>Memuat daftar listing toko...</p>
        </div>
      ) : listings.length === 0 ? (
        <div className="py-8 text-center text-xs text-[#6B7280] bg-[#F8F6F0] rounded-xl border border-dashed border-[#E5E0D8]">
          <AlertCircle className="w-6 h-6 text-[#6B7280] mx-auto mb-2 opacity-60" />
          <p className="font-semibold text-[#1F1D1A]">Belum ada listing aktif</p>
          <p className="text-[11px]">Gunakan panel di atas untuk menerbitkan menu surplus toko Anda.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E5E0D8] text-[#6B7280] text-[11px] uppercase">
                <th className="py-2.5 px-3 font-semibold">Menu Makanan</th>
                <th className="py-2.5 px-3 font-semibold">Sisa Porsi</th>
                <th className="py-2.5 px-3 font-semibold">Harga & Diskon</th>
                <th className="py-2.5 px-3 font-semibold">Status BPOM</th>
                <th className="py-2.5 px-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E0D8]">
              {listings.map((item) => (
                <tr key={item.id} className="hover:bg-[#FAF8F5] transition-colors">
                  <td className="py-3 px-3">
                    <span className="font-bold text-[#1F1D1A] block">
                      {item.food_name}
                    </span>
                    <span className="text-[10px] text-[#6B7280]">
                      {item.matched_canonical_dish}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {item.quantity} porsi
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[#10B981]">
                        Rp{item.discounted_price.toLocaleString("id-ID")}
                      </span>
                      <span className="text-[10px] line-through text-[#6B7280]">
                        Rp{item.original_price.toLocaleString("id-ID")}
                      </span>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded">
                        -{item.discount_percent}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                      <span>BPOM SAFE</span>
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDeleteListing(item.id)}
                      title="Hapus / Nonaktifkan listing"
                      className="p-1.5 rounded-lg text-[#6B7280] hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
