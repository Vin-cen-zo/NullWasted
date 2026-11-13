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
  createSmartBundle,
  fetchActiveListings,
  fetchActiveOrders,
  reserveOrder,
  completeOrderPickup,
  cancelOrder,
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
  const [session, setSession] = useState<UserSession | null>(() => {
    try {
      const saved = localStorage.getItem("nw_user_session");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Tab Navigation State
  const [merchantTab, setMerchantTab] = useState<"create" | "inventory" | "cashier">("create");
  const [consumerTab, setConsumerTab] = useState<"explore" | "orders">("explore");

  // Data States
  const [activeDraft, setActiveDraft] = useState<DraftResponse | null>(null);
  const [lastInputText, setLastInputText] = useState<string>("");
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
      const storeFilter = session?.role === "merchant" ? session.storeId : undefined;
      const data = await fetchActiveListings(storeFilter);
      setActiveListings(data);
    } catch (err) {
      console.error("Gagal memuat katalog:", err);
    }
  };

  const refreshOrders = async () => {
    try {
      const filters =
        session?.role === "merchant"
          ? { storeId: session.storeId }
          : session?.role === "consumer"
          ? { customerPhone: session.customerPhone, customerName: session.customerName }
          : undefined;
      const data = await fetchActiveOrders(filters);
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
    try {
      localStorage.setItem("nw_user_session", JSON.stringify(newSession));
      if (newSession.token) {
        localStorage.setItem("nw_session_token", newSession.token);
      }
    } catch (e) {
      console.error("Failed to persist session:", e);
    }

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
    try {
      localStorage.removeItem("nw_user_session");
      localStorage.removeItem("nw_session_token");
    } catch (e) {
      console.error("Failed to clear session:", e);
    }
    setActiveDraft(null);
    setSelectedFeedItem(null);
  };

  // Merchant Actions
  const handleAnalyzeText = async (text: string) => {
    setIsLoadingDraft(true);
    setLastInputText(text);
    try {
      const storeId = session?.storeId || "FTUI-001";
      const draft = await createDraft(text, undefined, storeId);
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
      setLastInputText("");
      await refreshListings();
      setMerchantTab("inventory");
      showToast("Listing resmi berhasil diterbitkan ke marketplace!", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menerbitkan.", "error");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCreateSmartBundle = async () => {
    try {
      const storeId = session?.storeId || "FTUI-001";
      const newBundle = await createSmartBundle(storeId, 65);
      await refreshListings();
      showToast(`Sukses membuat ${newBundle.food_name} dengan diskon 65%!`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal membuat Mystery Bag.", "error");
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
      const storeId = session?.storeId || "FTUI-001";
      const ticket = await completeOrderPickup(orderCode, storeId);
      await refreshOrders();
      await refreshListings();
      showToast(`Pesanan ${ticket.order_code} berhasil diselesaikan!`, "success");
      return ticket;
    } finally {
      setIsVerifying(false);
    }
  };

  // Consumer Actions
  const handleReserve = async (listingId: string, quantity: number, paymentMethod: string = "CASH_ON_PICKUP") => {
    setIsReserving(true);
    try {
      const custName = session?.customerName || "Budi Santoso";
      const custPhone = session?.customerPhone || "0812-8899-0011";
      const ticket = await reserveOrder(listingId, quantity, custName, custPhone, paymentMethod);
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

  const handleCancelOrder = async (orderId: string) => {
    try {
      await cancelOrder(orderId);
      await refreshOrders();
      await refreshListings();
      showToast("Pesanan berhasil dibatalkan dan stok dikembalikan ke gerai.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal membatalkan pesanan.", "error");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F0] font-sans text-[#1F1D1A] flex flex-col">
      {/* Toast Notification Float */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] animate-bounce pointer-events-none">
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

      {/* Sticky Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E2DDD3] shadow-sm shrink-0">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4 w-full">
          {/* Sisi Kiri: Brand & Identity */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
              NW
            </div>
            <div>
              <h1 className="text-xs font-black tracking-tight text-[#1F1D1A]">NullWasted</h1>
              {session ? (
                <div className="flex items-center gap-1 text-[10px] text-[#6B655B]">
                  {session.role === "merchant" ? (
                    <>
                      <Store className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate max-w-[140px] sm:max-w-xs">{session.storeName}</span>
                    </>
                  ) : (
                    <>
                      <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate max-w-[140px] sm:max-w-xs">{session.customerName}</span>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-[#6B655B]">Zero-Waste Food PWA</p>
              )}
            </div>
          </div>

          {/* Sisi Tengah (Desktop Only Nav Tabs) */}
          {session && (
            <div className="hidden md:flex items-center gap-1.5 bg-[#F8F6F0] p-1 rounded-xl border border-[#E2DDD3]">
              {session.role === "merchant" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMerchantTab("create");
                      setActiveDraft(null);
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      merchantTab === "create"
                        ? "bg-emerald-600 text-white font-bold shadow-sm"
                        : "text-[#6B655B] hover:text-[#1F1D1A] hover:bg-white/60 font-semibold"
                    }`}
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Buat Listing</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMerchantTab("inventory")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      merchantTab === "inventory"
                        ? "bg-emerald-600 text-white font-bold shadow-sm"
                        : "text-[#6B655B] hover:text-[#1F1D1A] hover:bg-white/60 font-semibold"
                    }`}
                  >
                    <ClipboardList className="w-4 h-4" />
                    <span>Inventaris ({activeListings.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMerchantTab("cashier")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      merchantTab === "cashier"
                        ? "bg-emerald-600 text-white font-bold shadow-sm"
                        : "text-[#6B655B] hover:text-[#1F1D1A] hover:bg-white/60 font-semibold"
                    }`}
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Kasir QR</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConsumerTab("explore")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      consumerTab === "explore"
                        ? "bg-emerald-600 text-white font-bold shadow-sm"
                        : "text-[#6B655B] hover:text-[#1F1D1A] hover:bg-white/60 font-semibold"
                    }`}
                  >
                    <UtensilsCrossed className="w-4 h-4" />
                    <span>Jelajah ({activeListings.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConsumerTab("orders")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      consumerTab === "orders"
                        ? "bg-emerald-600 text-white font-bold shadow-sm"
                        : "text-[#6B655B] hover:text-[#1F1D1A] hover:bg-white/60 font-semibold"
                    }`}
                  >
                    <Ticket className="w-4 h-4" />
                    <span>Pesanan Saya ({activeOrders.length})</span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* Sisi Kanan: Logout / Switch Role */}
          {session ? (
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 transition-colors shrink-0 cursor-pointer"
              title="Ganti Peran / Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Ganti Akun</span>
            </button>
          ) : (
            <div className="w-16" />
          )}
        </div>
      </header>

      {/* Dynamic Screen Viewport */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-4 md:py-6 flex flex-col pb-24 md:pb-10">
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
                  storeId={session.storeId || "FTUI-001"}
                  closingTime={session.closingTime || "20:30"}
                  locationName={session.locationName}
                  latitude={session.latitude}
                  longitude={session.longitude}
                />
              ) : (
                <MerchantInputScreen
                  onAnalyze={handleAnalyzeText}
                  isLoading={isLoadingDraft}
                  storeName={session.storeName || "Dapur Barokah"}
                  storeId={session.storeId || "FTUI-001"}
                  onDirectPublish={handlePublish}
                  isPublishing={isPublishing}
                  closingTime={session.closingTime || "20:30"}
                  locationName={session.locationName || ""}
                  latitude={session.latitude ?? null}
                  longitude={session.longitude ?? null}
                  onStoreLocationUpdated={(lat, lng, label) => {
                    const updated: UserSession = {
                      ...session,
                      latitude: lat,
                      longitude: lng,
                      locationName: label ?? session.locationName,
                    };
                    setSession(updated);
                    try {
                      localStorage.setItem("nw_user_session", JSON.stringify(updated));
                    } catch {
                      // ignore storage failure
                    }
                    refreshListings();
                    showToast(lat != null ? "Pin lokasi gerai diperbarui." : "Pin lokasi gerai dihapus.");
                  }}
                  initialText={lastInputText}
                  onTextChange={(val) => setLastInputText(val)}
                />
              ))}

            {merchantTab === "inventory" && (
              <MerchantInventoryScreen
                listings={activeListings}
                onDeleteListing={handleDeleteListing}
                onNavigateToCreate={() => setMerchantTab("create")}
                onCreateSmartBundle={handleCreateSmartBundle}
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
                onCancelOrder={handleCancelOrder}
                onRefreshOrders={refreshOrders}
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
        <nav className="flex md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2DDD3] px-3 py-2 items-center justify-around shadow-lg">
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
  );
};

export default App;
