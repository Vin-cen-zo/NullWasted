import React, { useState, useEffect } from "react";
import { UserSession, ItemListing, OrderTicket, DraftResponse, PublishRequest } from "./types/listing";
import { AuthScreen } from "./components/AuthScreen";
import { MerchantInputScreen } from "./components/MerchantInputScreen";
import { MerchantPreviewScreen } from "./components/MerchantPreviewScreen";
import { MerchantInventoryScreen } from "./components/MerchantInventoryScreen";
import { MerchantCashierScreen } from "./components/MerchantCashierScreen";
import { ConsumerFeedScreen } from "./components/ConsumerFeedScreen";
import { ConsumerDetailModal } from "./components/ConsumerDetailModal";
import { ConsumerOrdersScreen } from "./components/ConsumerOrdersScreen";
import {
  createDraft,
  publishListing,
  fetchActiveListings,
  fetchActiveOrders,
  reserveOrder,
  completeOrderPickup,
  deleteListing,
} from "./services/api";
import {
  PlusCircle,
  ClipboardList,
  QrCode,
  UtensilsCrossed,
  Ticket,
  LogOut,
  MapPin,
  Store,
} from "lucide-react";

export const App: React.FC = () => {
  // Session State
  const [session, setSession] = useState<UserSession | null>(null);

  // Tab Navigation State
  const [merchantTab, setMerchantTab] = useState<"create" | "inventory" | "cashier">("create");
  const [consumerTab, setConsumerTab] = useState<"explore" | "orders">("explore");

  // Data States
  const [activeDraft, setActiveDraft] = useState<DraftResponse | null>(null);
  const [activeListings, setActiveListings] = useState<ItemListing[]>([]);
  const [activeOrders, setActiveOrders] = useState<OrderTicket[]>([]);
  const [selectedFeedItem, setSelectedFeedItem] = useState<ItemListing | null>(null);

  // Loading States
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Toast feedback state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Synchronize data from SQLite
  const refreshListings = async () => {
    try {
      const data = await fetchActiveListings();
      setActiveListings(data);
    } catch (err) {
      console.error("Gagal memuat katalog:", err);
    }
  };

  const refreshOrders = async () => {
    try {
      const data = await fetchActiveOrders();
      setActiveOrders(data);
    } catch (err) {
      console.error("Gagal memuat pesanan:", err);
    }
  };

  useEffect(() => {
    refreshListings();
    refreshOrders();
  }, [session]);

  // Auth Handler
  const handleLogin = (newSession: UserSession) => {
    setSession(newSession);
    setActiveDraft(null);
    setSelectedFeedItem(null);
    if (newSession.role === "merchant") {
      setMerchantTab("create");
    } else {
      setConsumerTab("explore");
    }
    showToast(`Masuk sebagai ${newSession.role === "merchant" ? newSession.storeName : newSession.customerName}`);
  };

  const handleLogout = () => {
    setSession(null);
    setActiveDraft(null);
    setSelectedFeedItem(null);
  };

  // Merchant Actions
  const handleAnalyzeText = async (text: string) => {
    setIsLoadingDraft(true);
    try {
      const draft = await createDraft(text);
      setActiveDraft(draft);
      if (draft.safety_status === "REJECTED") {
        showToast("Peringatan: Makanan ditolak oleh Guardrail BPOM!", "error");
      } else {
        showToast("Analisis AI sukses. Periksa hasil audit BPOM.", "success");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menganalisis.", "error");
    } finally {
      setIsLoadingDraft(false);
    }
  };

  const handlePublish = async (payload: PublishRequest) => {
    setIsPublishing(true);
    try {
      await publishListing(payload);
      setActiveDraft(null);
      await refreshListings();
      setMerchantTab("inventory");
      showToast("Listing resmi berhasil diterbitkan ke marketplace!", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menerbitkan.", "error");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteListing = async (id: string) => {
    try {
      await deleteListing(id);
      await refreshListings();
      showToast("Listing berhasil ditarik dari katalog.");
    } catch (err) {
      showToast("Gagal menghapus listing.", "error");
    }
  };

  const handleCompletePickup = async (orderCode: string): Promise<OrderTicket> => {
    setIsVerifying(true);
    try {
      const ticket = await completeOrderPickup(orderCode);
      await refreshOrders();
      await refreshListings();
      showToast(`Pesanan ${ticket.order_code} berhasil diselesaikan!`, "success");
      return ticket;
    } finally {
      setIsVerifying(false);
    }
  };

  // Consumer Actions
  const handleReserve = async (listingId: string, quantity: number) => {
    setIsReserving(true);
    try {
      const custName = session?.customerName || "Budi Santoso";
      const ticket = await reserveOrder(listingId, quantity, custName);
      setSelectedFeedItem(null);
      await refreshListings();
      await refreshOrders();
      setConsumerTab("orders");
      showToast(`Reservasi sukses! Tiket ${ticket.order_code} siap diambil.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal melakukan reservasi.", "error");
    } finally {
      setIsReserving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E8E3D9] flex items-center justify-center p-0 sm:p-4 font-sans text-[#1F1D1A]">
      {/* Toast Notification Float */}
      {toast && (
        <div className="fixed top-5 z-60 animate-bounce">
          <div
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold shadow-lg flex items-center gap-2 border ${
              toast.type === "error"
                ? "bg-red-50 text-red-800 border-red-200"
                : "bg-emerald-50 text-emerald-800 border-emerald-200"
            }`}
          >
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Mobile Smartphone Frame Container */}
      <div className="w-full max-w-[440px] h-screen sm:h-[860px] bg-[#F8F6F0] sm:rounded-[36px] shadow-2xl sm:border-[6px] border-[#1F1D1A] flex flex-col overflow-hidden relative">
        {/* Top App Bar Header */}
        <header className="px-4 py-3 bg-white border-b border-[#E2DDD3] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
              NW
            </div>
            <div>
              <h1 className="text-xs font-black tracking-tight text-[#1F1D1A]">NullWasted</h1>
              {session ? (
                <div className="flex items-center gap-1 text-[10px] text-[#6B655B]">
                  {session.role === "merchant" ? (
                    <>
                      <Store className="w-3 h-3 text-emerald-600" />
                      <span>{session.storeName}</span>
                    </>
                  ) : (
                    <>
                      <MapPin className="w-3 h-3 text-emerald-600" />
                      <span>{session.customerName} (UI Depok)</span>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-[#6B655B]">Zero-Waste Food PWA</p>
              )}
            </div>
          </div>

          {session && (
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-[11px] font-bold text-gray-700 transition-colors"
              title="Ganti Peran / Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Ganti Akun</span>
            </button>
          )}
        </header>

        {/* Dynamic Screen Viewport */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {!session ? (
            <AuthScreen onLogin={handleLogin} />
          ) : session.role === "merchant" ? (
            /* Merchant Screens */
            <>
              {merchantTab === "create" &&
                (activeDraft ? (
                  <MerchantPreviewScreen
                    draft={activeDraft}
                    onBack={() => setActiveDraft(null)}
                    onPublish={handlePublish}
                    isPublishing={isPublishing}
                    storeName={session.storeName || "Dapur Barokah"}
                  />
                ) : (
                  <MerchantInputScreen
                    onAnalyze={handleAnalyzeText}
                    isLoading={isLoadingDraft}
                    storeName={session.storeName || "Dapur Barokah"}
                  />
                ))}

              {merchantTab === "inventory" && (
                <MerchantInventoryScreen
                  listings={activeListings}
                  onDeleteListing={handleDeleteListing}
                  onNavigateToCreate={() => setMerchantTab("create")}
                  storeName={session.storeName || "Dapur Barokah"}
                />
              )}

              {merchantTab === "cashier" && (
                <MerchantCashierScreen
                  orders={activeOrders}
                  onCompletePickup={handleCompletePickup}
                  isVerifying={isVerifying}
                />
              )}
            </>
          ) : (
            /* Consumer Screens */
            <>
              {consumerTab === "explore" && (
                <ConsumerFeedScreen
                  listings={activeListings}
                  onSelectItem={(item) => setSelectedFeedItem(item)}
                  customerName={session.customerName || "Budi Santoso"}
                />
              )}

              {consumerTab === "orders" && (
                <ConsumerOrdersScreen
                  orders={activeOrders}
                  customerName={session.customerName || "Budi Santoso"}
                />
              )}

              {/* Detail Sheet Modal */}
              <ConsumerDetailModal
                item={selectedFeedItem}
                onClose={() => setSelectedFeedItem(null)}
                onReserve={handleReserve}
                isReserving={isReserving}
              />
            </>
          )}
        </main>

        {/* Bottom Navigation Bar */}
        {session && (
          <nav className="bg-white border-t border-[#E2DDD3] px-3 py-2 flex items-center justify-around shrink-0 shadow-lg">
            {session.role === "merchant" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMerchantTab("create");
                    setActiveDraft(null);
                  }}
                  className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                    merchantTab === "create"
                      ? "text-emerald-600 font-bold"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <PlusCircle className="w-5 h-5" />
                  <span className="text-[10px]">Buat Listing</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMerchantTab("inventory")}
                  className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all relative ${
                    merchantTab === "inventory"
                      ? "text-emerald-600 font-bold"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <ClipboardList className="w-5 h-5" />
                  <span className="text-[10px]">Inventaris ({activeListings.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMerchantTab("cashier")}
                  className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all relative ${
                    merchantTab === "cashier"
                      ? "text-emerald-600 font-bold"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <QrCode className="w-5 h-5" />
                  <span className="text-[10px]">Kasir QR</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConsumerTab("explore")}
                  className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all ${
                    consumerTab === "explore"
                      ? "text-emerald-600 font-bold"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <UtensilsCrossed className="w-5 h-5" />
                  <span className="text-[10px]">Jelajah ({activeListings.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConsumerTab("orders")}
                  className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all relative ${
                    consumerTab === "orders"
                      ? "text-emerald-600 font-bold"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <Ticket className="w-5 h-5" />
                  <span className="text-[10px]">Pesanan Saya ({activeOrders.length})</span>
                </button>
              </>
            )}
          </nav>
        )}
      </div>
    </div>
  );
};
export default App;
