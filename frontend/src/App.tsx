import React, { useState, useEffect, useCallback, useRef } from "react";
import { CartItem, UserSession, ItemListing, OrderTicket, DraftResponse, PublishRequest } from "./types/listing";
import { AuthScreen } from "./components/AuthScreen";
import { NullWastedLogo } from "./components/NullWastedLogo";
import { MerchantInputScreen } from "./components/MerchantInputScreen";
import { MerchantPreviewScreen } from "./components/MerchantPreviewScreen";
import { MerchantInventoryScreen } from "./components/MerchantInventoryScreen";
import { MerchantCashierScreen } from "./components/MerchantCashierScreen";
import { ConsumerFeedScreen } from "./components/ConsumerFeedScreen";
import { ConsumerDetailModal } from "./components/ConsumerDetailModal";
import { ConsumerCartModal } from "./components/ConsumerCartModal";
import { ConsumerOrdersScreen } from "./components/ConsumerOrdersScreen";
import { ProfileModal } from "./components/ProfileModal";
import { PublicStoreModal } from "./components/PublicStoreModal";
import { TimeSimulatorPill } from "./components/TimeSimulatorPill";
import {
  NW_AUTH_EXPIRED_EVENT,
  addFavoriteStore,
  createBatchDraft,
  publishListing,
  createSmartBundle,
  fetchActiveListings,
  fetchActiveOrders,
  fetchFavoriteStores,
  removeFavoriteStore,
  reserveCartOrder,
  reserveOrder,
  completeOrderPickup,
  cancelOrder,
  deleteListing,
  updateListingStock,
} from "./services/api";
import {
  NW_CLOCK_CHANGE_EVENT,
  computeEffectiveSecondsUntilClosing,
  formatWibHHMM,
  getEffectiveNow,
  isTimeSimulated,
  isTimeSimulationFeatureEnabled,
  resetSimulatedClock,
} from "./utils/clock";
import {
  PlusCircle,
  ClipboardList,
  QrCode,
  UtensilsCrossed,
  Ticket,
  LogOut,
  LogIn,
  MapPin,
  Store,
  UserCircle2,
  ShoppingCart,
  Clock,
  RotateCcw,
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

  // Tab & Route Navigation State
  const [showAuthScreen, setShowAuthScreen] = useState<boolean>(() => window.location.pathname === "/login");
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [pendingItemAfterLogin, setPendingItemAfterLogin] = useState<ItemListing | null>(null);
  const [merchantTab, setMerchantTab] = useState<"create" | "inventory" | "cashier">(() => {
    const p = window.location.pathname;
    if (p === "/merchant/inventory") return "inventory";
    if (p === "/merchant/cashier") return "cashier";
    return "create";
  });
  const [consumerTab, setConsumerTab] = useState<"explore" | "orders">(() =>
    window.location.pathname === "/orders" ? "orders" : "explore"
  );
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(() => window.location.pathname === "/profile");
  const [selectedStoreProfileId, setSelectedStoreProfileId] = useState<string | null>(() => {
    const m = window.location.pathname.match(/^\/store\/([^/]+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  });

  // Data States
  const [activeDraft, setActiveDraft] = useState<DraftResponse | null>(null);
  const [batchDrafts, setBatchDrafts] = useState<DraftResponse[]>([]);
  const [lastInputText, setLastInputText] = useState<string>("");
  const [activeListings, setActiveListings] = useState<ItemListing[]>([]);
  const [activeOrders, setActiveOrders] = useState<OrderTicket[]>([]);
  const [favoriteStoreIds, setFavoriteStoreIds] = useState<string[]>([]);
  const [selectedFeedItem, setSelectedFeedItem] = useState<ItemListing | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem("nw_cart_items");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("nw_cart_items", JSON.stringify(cartItems));
    } catch {
      // ignore storage errors
    }
  }, [cartItems]);

  // Loading States
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Toast feedback state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [clockTick, setClockTick] = useState<number>(() => getEffectiveNow().getTime());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Push URL path helper (no-op if already on target path)
  const navigateToPath = useCallback((path: string, replace = false) => {
    if (window.location.pathname === path) return;
    if (replace) {
      window.history.replaceState({ path }, "", path);
    } else {
      window.history.pushState({ path }, "", path);
    }
  }, []);

  // Synchronize data from backend (works in Guest Mode too for public listings!)
  const refreshListings = useCallback(async () => {
    try {
      const storeFilter = session?.role === "merchant" ? session.storeId : undefined;
      const data = await fetchActiveListings(storeFilter);
      setActiveListings(data);
    } catch (err) {
      console.error("Gagal memuat katalog:", err);
    }
  }, [session]);

  const refreshOrders = useCallback(async () => {
    if (!session) {
      setActiveOrders([]);
      return;
    }
    try {
      const filters =
        session.role === "merchant"
          ? { storeId: session.storeId }
          : session.role === "consumer"
          ? { customerPhone: session.customerPhone, customerName: session.customerName }
          : undefined;
      const data = await fetchActiveOrders(filters);
      setActiveOrders(data);
    } catch (err) {
      console.error("Gagal memuat pesanan:", err);
    }
  }, [session]);

  const refreshFavorites = useCallback(async () => {
    if (session?.role !== "consumer") {
      setFavoriteStoreIds([]);
      return;
    }
    try {
      const ids = await fetchFavoriteStores();
      setFavoriteStoreIds(ids);
    } catch {
      // ignore non-critical favorite fetch failure
    }
  }, [session]);

  useEffect(() => {
    refreshListings();
    refreshOrders();
    refreshFavorites();
  }, [session, refreshListings, refreshOrders, refreshFavorites]);

  // Browser Back / Forward URL synchronization
  useEffect(() => {
    const syncFromUrl = () => {
      const p = window.location.pathname;
      const storeMatch = p.match(/^\/store\/([^/]+)$/);

      // Close item modal on back navigation
      setSelectedFeedItem(null);

      if (storeMatch) {
        setSelectedStoreProfileId(decodeURIComponent(storeMatch[1]));
        setIsProfileOpen(false);
        setShowAuthScreen(false);
        return;
      }

      setSelectedStoreProfileId(null);

      if (p === "/login") {
        setShowAuthScreen(true);
        setIsProfileOpen(false);
      } else if (p === "/profile") {
        if (session) {
          setIsProfileOpen(true);
          setShowAuthScreen(false);
        } else {
          setShowAuthScreen(true);
        }
      } else if (p === "/orders") {
        setIsProfileOpen(false);
        if (session?.role === "consumer") {
          setConsumerTab("orders");
          setShowAuthScreen(false);
        } else {
          setShowAuthScreen(true);
        }
      } else if (p === "/merchant/inventory") {
        setIsProfileOpen(false);
        setMerchantTab("inventory");
        setShowAuthScreen(false);
      } else if (p === "/merchant/cashier") {
        setIsProfileOpen(false);
        setMerchantTab("cashier");
        setShowAuthScreen(false);
      } else if (p === "/merchant/create") {
        setIsProfileOpen(false);
        setMerchantTab("create");
        setShowAuthScreen(false);
      } else {
        setIsProfileOpen(false);
        setShowAuthScreen(false);
        setConsumerTab("explore");
      }
    };

    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [session]);

  useEffect(() => {
    const handleClockChange = () => {
      setClockTick(getEffectiveNow().getTime());
      refreshListings();
      refreshOrders();
    };
    const handleAuthExpired = () => {
      handleLogout();
      showToast("Sesi telah kedaluwarsa, silakan masuk kembali.", "error");
    };
    window.addEventListener(NW_CLOCK_CHANGE_EVENT, handleClockChange);
    window.addEventListener(NW_AUTH_EXPIRED_EVENT, handleAuthExpired);
    const tickTimer = setInterval(() => setClockTick(getEffectiveNow().getTime()), 10000);
    return () => {
      window.removeEventListener(NW_CLOCK_CHANGE_EVENT, handleClockChange);
      window.removeEventListener(NW_AUTH_EXPIRED_EVENT, handleAuthExpired);
      clearInterval(tickTimer);
    };
  }, [session]);

  useEffect(() => {
    if ((session && session.role !== "consumer") || consumerTab !== "explore" || showAuthScreen) return;
    const pollTimer = setInterval(() => {
      refreshListings();
    }, 12000);
    return () => clearInterval(pollTimer);
  }, [session, consumerTab, showAuthScreen, refreshListings]);

  const nonExpiredListingsCount = activeListings.filter((item) => {
    void clockTick;
    return computeEffectiveSecondsUntilClosing(item.closing_time || "20:30", item.expires_at) > 0;
  }).length;

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
    setLastInputText("");
    setDraftError(null);
    setShowAuthScreen(false);
    setLoginNotice(null);

    if (newSession.role === "merchant") {
      setPendingItemAfterLogin(null);
      setSelectedFeedItem(null);
      setMerchantTab("create");
      navigateToPath("/merchant/create");
    } else {
      setConsumerTab("explore");
      navigateToPath("/");
      if (pendingItemAfterLogin) {
        setSelectedFeedItem(pendingItemAfterLogin);
        setPendingItemAfterLogin(null);
      }
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
    setLastInputText("");
    setDraftError(null);
    setSelectedFeedItem(null);
    setIsProfileOpen(false);
    setFavoriteStoreIds([]);
    setShowAuthScreen(false);
    setConsumerTab("explore");
    navigateToPath("/");
  };

  const handleSessionUpdated = (updated: UserSession) => {
    setSession(updated);
    try {
      localStorage.setItem("nw_user_session", JSON.stringify(updated));
    } catch {
      // ignore storage failure
    }
    refreshListings();
  };

  const handleToggleFavoriteStore = async (storeId: string) => {
    if (!session) {
      setLoginNotice("Masuk sebagai Konsumen untuk menyimpan gerai favorit Anda.");
      setShowAuthScreen(true);
      navigateToPath("/login");
      return;
    }
    if (session.role !== "consumer") {
      showToast("Fitur favorit gerai hanya tersedia untuk akun Konsumen.", "error");
      return;
    }
    const isFav = favoriteStoreIds.includes(storeId);
    try {
      const updated = isFav
        ? await removeFavoriteStore(storeId)
        : await addFavoriteStore(storeId);
      setFavoriteStoreIds(updated);
      showToast(isFav ? "Gerai dihapus dari favorit." : "Gerai disimpan ke favorit!", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui gerai favorit.", "error");
    }
  };

  const handleOpenStoreProfile = (storeId: string) => {
    setSelectedStoreProfileId(storeId);
    navigateToPath(`/store/${encodeURIComponent(storeId)}`);
  };

  const handleCloseStoreProfile = () => {
    setSelectedStoreProfileId(null);
    if (window.location.pathname.startsWith("/store/")) {
      navigateToPath("/");
    }
  };

  const handleOpenProfile = () => {
    if (!session) return;
    setIsProfileOpen(true);
    navigateToPath("/profile");
  };

  const handleCloseProfile = () => {
    setIsProfileOpen(false);
    if (window.location.pathname === "/profile") {
      navigateToPath(session?.role === "merchant" ? `/merchant/${merchantTab}` : "/");
    }
  };

  const handleRequireLoginForOrder = (item: ItemListing) => {
    setPendingItemAfterLogin(item);
    setSelectedFeedItem(null);
    setLoginNotice(`Masuk sebagai Konsumen untuk memesan "${item.food_name}".`);
    setShowAuthScreen(true);
    navigateToPath("/login");
  };

  // Merchant Actions (Supports single or multi-menu AI voice/text batch extraction)
  const handleAnalyzeText = async (text: string) => {
    setIsLoadingDraft(true);
    setDraftError(null);
    setLastInputText(text);
    try {
      const storeId = session?.storeId || "FTUI-001";
      const batch = await createBatchDraft(text, undefined, storeId);
      if (batch.items.length === 1) {
        const draft = batch.items[0];
        setBatchDrafts([]);
        setActiveDraft(draft);
        if (draft.safety_status === "REJECTED") {
          showToast("Peringatan: Makanan ditolak oleh Guardrail BPOM!", "error");
        } else {
          showToast("Analisis AI sukses. Periksa hasil audit BPOM.", "success");
        }
      } else {
        setActiveDraft(null);
        setBatchDrafts(batch.items);
        showToast(
          `AI mengekstrak ${batch.total_count} menu (${batch.safe_count} lolos BPOM). Tinjau sebelum terbitkan.`,
          batch.safe_count > 0 ? "success" : "error"
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menganalisis.";
      setDraftError(msg);
      showToast(msg, "error");
    } finally {
      setIsLoadingDraft(false);
    }
  };

  const handlePublishBatchDrafts = async () => {
    const safeDrafts = batchDrafts.filter((d) => d.safety_status === "SAFE" && d.can_publish);
    if (safeDrafts.length === 0 || !session) return;
    setIsPublishing(true);
    try {
      let publishedCount = 0;
      for (const d of safeDrafts) {
        await publishListing({
          store_id: session.storeId || "FTUI-001",
          food_name: d.food_name,
          matched_canonical_dish: d.matched_canonical_dish,
          category: d.category,
          food_type: d.food_type || "MEAL",
          quantity: d.quantity,
          original_price: d.original_price,
          discount_percent: d.recommended_discount_percent,
          discounted_price: d.discounted_price,
          hours_since_cooked: d.hours_since_cooked,
          bpom_max_hours: d.bpom_max_hours,
          minutes_until_closing: d.minutes_until_closing,
          safety_status: d.safety_status,
          safety_reason: d.safety_reason,
          hazard_description: d.hazard_description,
          regulation_ref: d.regulation_ref,
          similarity_score: d.similarity_score,
          store_name: session.storeName || "Dapur Barokah",
          location_badge: session.locationName,
          closing_time: d.closing_time || session.closingTime || "20:30",
          latitude: session.latitude,
          longitude: session.longitude,
          image_url: d.image_url ?? null,
        });
        publishedCount += 1;
      }
      setBatchDrafts([]);
      setLastInputText("");
      await refreshListings();
      setMerchantTab("inventory");
      navigateToPath("/merchant/inventory");
      showToast(`${publishedCount} menu surplus berhasil diterbitkan sekaligus!`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menerbitkan sebagian menu.", "error");
    } finally {
      setIsPublishing(false);
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
      navigateToPath("/merchant/inventory");
      showToast("Listing resmi berhasil diterbitkan ke marketplace!", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menerbitkan.", "error");
      throw err;
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCreateSmartBundle = async (
    discountPercent: number = 65,
    customName?: string,
    listingIds?: string[]
  ) => {
    try {
      const storeId = session?.storeId || "FTUI-001";
      const newBundle = await createSmartBundle(storeId, discountPercent, customName, listingIds);
      await refreshListings();
      showToast(`Sukses membuat ${newBundle.food_name} dengan diskon ${discountPercent}%!`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal membuat Mystery Bag.", "error");
      throw err;
    }
  };

  const handleDeleteListing = async (id: string) => {
    try {
      await deleteListing(id);
      await refreshListings();
      showToast("Listing berhasil ditarik dari katalog.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus listing.", "error");
    }
  };

  const handleUpdateListingStock = async (id: string, quantity: number) => {
    try {
      await updateListingStock(id, quantity);
      await refreshListings();
      showToast(quantity === 0 ? "Stok diset 0 & listing dinonaktifkan." : `Stok diperbarui menjadi ${quantity} porsi.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui stok listing.", "error");
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
      navigateToPath("/orders");
      showToast(`Reservasi sukses! Tiket ${ticket.order_code} siap diambil.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal melakukan reservasi.", "error");
    } finally {
      setIsReserving(false);
    }
  };

  const handleAddToCart = (item: ItemListing, quantity: number) => {
    if (cartItems.length > 0 && cartItems[0].listing.store_id !== item.store_id) {
      const confirmed = window.confirm(
        `Keranjang Anda saat ini berisi menu dari ${cartItems[0].listing.store_name}. Ganti keranjang dengan menu dari ${item.store_name}?`
      );
      if (!confirmed) return;
      setCartItems([{ listing: item, quantity: Math.min(quantity, item.quantity) }]);
      showToast(`Keranjang diganti ke ${item.store_name} (+${quantity} ${item.food_name}).`, "success");
      return;
    }

    setCartItems((prev) => {
      const existing = prev.find((c) => c.listing.id === item.id);
      if (existing) {
        const nextQty = Math.min(item.quantity, existing.quantity + quantity);
        return prev.map((c) => (c.listing.id === item.id ? { listing: item, quantity: nextQty } : c));
      }
      return [...prev, { listing: item, quantity: Math.min(quantity, item.quantity) }];
    });
    showToast(`+${quantity} ${item.food_name} ditambahkan ke keranjang.`, "success");
  };

  const handleUpdateCartQty = (listingId: string, nextQty: number) => {
    if (nextQty <= 0) {
      setCartItems((prev) => prev.filter((c) => c.listing.id !== listingId));
      return;
    }
    setCartItems((prev) =>
      prev.map((c) =>
        c.listing.id === listingId
          ? { ...c, quantity: Math.min(c.listing.quantity, nextQty) }
          : c
      )
    );
  };

  const handleCheckoutCart = async (paymentMethod: string = "CASH_ON_PICKUP") => {
    if (!session) {
      setIsCartOpen(false);
      setLoginNotice("Masuk sebagai Konsumen untuk menyelesaikan checkout keranjang Anda.");
      setShowAuthScreen(true);
      navigateToPath("/login");
      return;
    }
    if (cartItems.length === 0) return;

    setIsReserving(true);
    try {
      const custName = session.customerName || "Konsumen NullWasted";
      const custPhone = session.customerPhone || "";
      const ticket = await reserveCartOrder(
        cartItems.map((c) => ({ listing_id: c.listing.id, quantity: c.quantity })),
        custName,
        custPhone,
        paymentMethod
      );
      setCartItems([]);
      setIsCartOpen(false);
      await refreshListings();
      await refreshOrders();
      setConsumerTab("orders");
      navigateToPath("/orders");
      showToast(`Checkout keranjang sukses! Tiket terpadu ${ticket.order_code} diterbitkan.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal checkout keranjang.", "error");
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
    <div className="min-h-screen bg-white font-sans text-[#181C2E] flex flex-col">
      {/* Toast Notification Float */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] animate-nw-toast pointer-events-none">
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
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-[0_4px_20px_rgba(150,150,154,0.06)] shrink-0">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2 sm:gap-4 w-full">
          {/* Sisi Kiri: Brand & Identity */}
          <div className="flex items-center gap-2.5 min-w-0">
            <NullWastedLogo className="w-10 h-10" />
            <div className="min-w-0">
              <h1
                className="text-[20px] tracking-[0.05em] leading-none uppercase truncate"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                <span className="text-[#222222]">NULL</span>
                <span className="text-emerald-600">WASTED</span>
              </h1>
              {session ? (
                <div className="flex items-center gap-1 text-[11px] text-[#646982] min-w-0">
                  {session.role === "merchant" ? (
                    <>
                      <Store className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate max-w-[96px] sm:max-w-[160px] md:max-w-xs">{session.storeName}</span>
                    </>
                  ) : (
                    <>
                      <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate max-w-[96px] sm:max-w-[160px] md:max-w-xs">{session.customerName}</span>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-[#646982] truncate">Zero-Waste Food PWA</p>
              )}
            </div>
          </div>

          {/* Sisi Tengah (Desktop Only Nav Tabs) */}
          {session && (
            <div className="hidden md:flex items-center gap-1.5 bg-[#F0F5FA] p-1 rounded-lg">
              {session.role === "merchant" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMerchantTab("create");
                      setActiveDraft(null);
                      navigateToPath("/merchant/create");
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      merchantTab === "create"
                        ? "bg-emerald-600 text-white font-bold shadow-sm"
                        : "text-[#646982] hover:text-[#181C2E] font-semibold"
                    }`}
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Buat Listing</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMerchantTab("inventory");
                      navigateToPath("/merchant/inventory");
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      merchantTab === "inventory"
                        ? "bg-emerald-600 text-white font-bold shadow-sm"
                        : "text-[#646982] hover:text-[#181C2E] font-semibold"
                    }`}
                  >
                    <ClipboardList className="w-4 h-4" />
                    <span>Inventaris ({activeListings.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMerchantTab("cashier");
                      navigateToPath("/merchant/cashier");
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      merchantTab === "cashier"
                        ? "bg-emerald-600 text-white font-bold shadow-sm"
                        : "text-[#646982] hover:text-[#181C2E] font-semibold"
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
                    onClick={() => {
                      setConsumerTab("explore");
                      navigateToPath("/");
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      consumerTab === "explore"
                        ? "bg-emerald-600 text-white font-bold shadow-sm"
                        : "text-[#646982] hover:text-[#181C2E] font-semibold"
                    }`}
                  >
                    <UtensilsCrossed className="w-4 h-4" />
                    <span>Jelajah ({nonExpiredListingsCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setConsumerTab("orders");
                      navigateToPath("/orders");
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      consumerTab === "orders"
                        ? "bg-emerald-600 text-white font-bold shadow-sm"
                        : "text-[#646982] hover:text-[#181C2E] font-semibold"
                    }`}
                  >
                    <Ticket className="w-4 h-4" />
                    <span>Pesanan Saya ({activeOrders.length})</span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* Sisi Kanan: Time Simulator + Profil + Login/Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isTimeSimulationFeatureEnabled() && <TimeSimulatorPill />}
            {session ? (
              <>
                <button
                  type="button"
                  onClick={handleOpenProfile}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#F0F5FA] hover:bg-emerald-50 text-[11px] sm:text-xs font-bold text-[#181C2E] transition-colors shrink-0 cursor-pointer"
                  title="Edit profil & ganti password"
                  aria-label="Profil"
                >
                  <UserCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Profil</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#ECF0F4] hover:bg-slate-200 text-[11px] sm:text-xs font-bold text-[#181C2E] transition-colors shrink-0 cursor-pointer"
                  title="Keluar dari akun"
                  aria-label="Keluar"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar</span>
                </button>
              </>
            ) : !showAuthScreen ? (
              <button
                type="button"
                onClick={() => {
                  setLoginNotice(null);
                  setShowAuthScreen(true);
                  navigateToPath("/login");
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] sm:text-xs font-bold transition-colors shrink-0 cursor-pointer shadow-xs"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Masuk / Daftar</span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* Active Time Simulation Safety Banner (prevents users getting stuck in closed/empty hours) */}
      {isTimeSimulationFeatureEnabled() && isTimeSimulated() && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 shrink-0">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 text-xs text-amber-950">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="font-semibold truncate">
                Mode Simulasi Jam Uji aktif ({formatWibHHMM(getEffectiveNow())} WIB) — katalog &amp; jam tutup mengikuti jam simulasi.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                resetSimulatedClock();
                showToast("Jam dikembalikan ke waktu asli (WIB).", "success");
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shrink-0 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset ke Waktu Asli</span>
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Screen Viewport */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-4 md:py-6 flex flex-col pb-24 md:pb-10">
        {!session && showAuthScreen ? (
          <AuthScreen
            onLogin={handleLogin}
            loginNotice={loginNotice}
            onBackToExplore={() => {
              setShowAuthScreen(false);
              setLoginNotice(null);
              navigateToPath("/");
            }}
          />
        ) : !session ? (
          /* Guest Discovery Mode on "/" */
          <>
            <ConsumerFeedScreen
              listings={activeListings}
              onSelectItem={(item) => setSelectedFeedItem(item)}
              customerName="Tamu"
              isGuest={true}
              onOpenLogin={() => {
                setLoginNotice(null);
                setShowAuthScreen(true);
                navigateToPath("/login");
              }}
              favoriteStoreIds={[]}
              onToggleFavoriteStore={handleToggleFavoriteStore}
              onOpenStoreProfile={handleOpenStoreProfile}
            />
            <ConsumerDetailModal
              item={selectedFeedItem}
              onClose={() => setSelectedFeedItem(null)}
              onReserve={handleReserve}
              onAddToCart={handleAddToCart}
              isReserving={isReserving}
              isGuest={true}
              onRequireLogin={handleRequireLoginForOrder}
              onOpenStoreProfile={handleOpenStoreProfile}
            />
          </>
        ) : session.role === "merchant" ? (
          /* Merchant Screens */
          <>
            {merchantTab === "create" &&
              (batchDrafts.length > 0 ? (
                <div className="space-y-4">
                  <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-base font-bold text-[#181C2E]">
                        Pratinjau Multi-Menu AI ({batchDrafts.length} Menu Terdeteksi)
                      </h2>
                      <p className="text-xs text-[#646982]">
                        Periksa hasil validasi BPOM & diskon dinamis tiap menu sebelum diterbitkan.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBatchDrafts([])}
                      className="px-3 py-1.5 rounded-lg bg-[#F0F5FA] hover:bg-slate-200 text-xs font-bold text-[#181C2E] cursor-pointer"
                    >
                      &larr; Ubah Prompt
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {batchDrafts.map((d, idx) => {
                      const isSafe = d.safety_status === "SAFE" && d.can_publish;
                      const updateItem = (patch: Partial<typeof d>) => {
                        setBatchDrafts((prev) =>
                          prev.map((item, i) => {
                            if (i !== idx) return item;
                            const nextQty = patch.quantity !== undefined ? Math.max(1, Math.min(200, patch.quantity)) : item.quantity;
                            const nextPrice = patch.original_price !== undefined ? Math.max(0, Math.min(2000000, patch.original_price)) : item.original_price;
                            const nextHours = patch.hours_since_cooked !== undefined ? Math.max(0, Math.min(48, Number(patch.hours_since_cooked.toFixed(1)))) : item.hours_since_cooked;
                            const nextDiscounted = Math.max(
                              100,
                              Math.floor((nextPrice * (1 - item.recommended_discount_percent / 100)) / 100) * 100
                            );
                            const isNonTimeReject = item.safety_status === "REJECTED" && item.bpom_max_hours <= 0;
                            let nextStatus = item.safety_status;
                            let nextCanPublish = item.can_publish;
                            let nextReason = item.safety_reason;
                            if (!isNonTimeReject && item.bpom_max_hours > 0) {
                              if (nextHours > item.bpom_max_hours) {
                                nextStatus = "REJECTED";
                                nextCanPublish = false;
                                nextReason = `DITOLAK BPOM: Waktu simpan (${nextHours} jam) melampaui batas aman suhu ruang maks ${item.bpom_max_hours} jam.`;
                              } else {
                                nextStatus = "SAFE";
                                nextCanPublish = true;
                                nextReason = `Aman dikonsumsi: waktu simpan ${nextHours} jam masih dalam batas aman BPOM (maks ${item.bpom_max_hours} jam).`;
                              }
                            }
                            return {
                              ...item,
                              quantity: nextQty,
                              original_price: nextPrice,
                              hours_since_cooked: nextHours,
                              discounted_price: nextDiscounted,
                              needs_manual_price: patch.original_price !== undefined ? false : item.needs_manual_price,
                              safety_status: nextStatus,
                              can_publish: nextCanPublish,
                              safety_reason: nextReason,
                            };
                          })
                        );
                      };

                      return (
                        <div
                          key={`${d.food_name}-${idx}`}
                          className={`p-4 rounded-xl border bg-white space-y-3 ${
                            isSafe ? "border-emerald-200" : "border-red-300 bg-red-50/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span
                                className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold mb-1 ${
                                  isSafe ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                                }`}
                              >
                                {isSafe ? "BPOM SAFE" : "DITOLAK BPOM"}
                              </span>
                              <h3 className="text-sm font-bold text-[#181C2E]">{d.food_name}</h3>
                            </div>
                            <button
                              type="button"
                              onClick={() => setBatchDrafts((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-xs font-bold text-slate-400 hover:text-red-600 cursor-pointer"
                            >
                              Hapus
                            </button>
                          </div>

                          {/* Inline Editable Fields: Quantity, Normal Price, Hours Since Cooked */}
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[11px] font-semibold text-[#646982] mb-0.5">
                                Porsi
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={200}
                                value={d.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!Number.isNaN(val)) updateItem({ quantity: val });
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-[#F0F5FA] focus:bg-white text-xs font-bold text-[#181C2E] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-[#646982] mb-0.5 flex items-center justify-between">
                                <span>Harga (Rp)</span>
                                {d.needs_manual_price && (
                                  <span className="text-[10px] font-bold text-amber-700">!</span>
                                )}
                              </label>
                              <input
                                type="number"
                                step={500}
                                min={1000}
                                max={2000000}
                                value={d.original_price === 0 ? "" : d.original_price}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === "") {
                                    updateItem({ original_price: 0 });
                                    return;
                                  }
                                  const val = parseInt(raw, 10);
                                  if (!Number.isNaN(val)) updateItem({ original_price: val });
                                }}
                                onBlur={() => {
                                  if (d.original_price < 1000) {
                                    updateItem({ original_price: 1000 });
                                  }
                                }}
                                className={`w-full px-2 py-1.5 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 ${
                                  d.needs_manual_price
                                    ? "border-2 border-amber-400 bg-amber-50 text-amber-950 focus:ring-amber-500"
                                    : "border border-slate-200 bg-[#F0F5FA] focus:bg-white text-[#181C2E] focus:ring-emerald-500"
                                }`}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-[#646982] mb-0.5">
                                Matang (Jam)
                              </label>
                              <input
                                type="number"
                                step={0.5}
                                min={0}
                                max={48}
                                value={d.hours_since_cooked}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!Number.isNaN(val)) updateItem({ hours_since_cooked: val });
                                }}
                                className={`w-full px-2 py-1.5 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 ${
                                  d.bpom_max_hours > 0 && d.hours_since_cooked > d.bpom_max_hours
                                    ? "border-2 border-red-400 bg-red-50 text-red-900 focus:ring-red-500"
                                    : "border border-slate-200 bg-[#F0F5FA] focus:bg-white text-[#181C2E] focus:ring-emerald-500"
                                }`}
                              />
                            </div>
                          </div>

                          <p className="text-xs text-[#646982]">{d.safety_reason}</p>

                          {isSafe && (
                            <div className="p-2.5 rounded-lg bg-[#F0F5FA] flex items-center justify-between text-xs">
                              <span className="font-semibold text-emerald-700">
                                Diskon {d.recommended_discount_percent}% OFF
                              </span>
                              <span className="font-extrabold text-[#181C2E] tabular-nums">
                                Rp {d.discounted_price.toLocaleString("id-ID")} / porsi
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={
                      isPublishing ||
                      batchDrafts.filter((d) => d.safety_status === "SAFE" && d.can_publish).length === 0
                    }
                    onClick={() => void handlePublishBatchDrafts()}
                    className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-md disabled:opacity-50 cursor-pointer"
                  >
                    {isPublishing
                      ? "Menerbitkan Semua Menu..."
                      : `Terbitkan Semua yang Lolos BPOM (${
                          batchDrafts.filter((d) => d.safety_status === "SAFE" && d.can_publish).length
                        } Menu)`}
                  </button>
                </div>
              ) : activeDraft ? (
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
                  onTextChange={(val) => {
                    setLastInputText(val);
                    if (draftError) setDraftError(null);
                  }}
                  analyzeError={draftError}
                  onClearAnalyzeError={() => setDraftError(null)}
                />
              ))}

            {merchantTab === "inventory" && (
              <MerchantInventoryScreen
                listings={activeListings}
                onDeleteListing={handleDeleteListing}
                onUpdateStock={handleUpdateListingStock}
                onNavigateToCreate={() => {
                  setMerchantTab("create");
                  navigateToPath("/merchant/create");
                }}
                onCreateSmartBundle={handleCreateSmartBundle}
                storeName={session.storeName || "Dapur Barokah"}
              />
            )}

            {merchantTab === "cashier" && (
              <MerchantCashierScreen
                orders={activeOrders}
                onCompletePickup={handleCompletePickup}
                onCancelOrder={handleCancelOrder}
                onRefreshOrders={refreshOrders}
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
                customerName={session.customerName || "Konsumen NullWasted"}
                favoriteStoreIds={favoriteStoreIds}
                onToggleFavoriteStore={handleToggleFavoriteStore}
                onOpenStoreProfile={handleOpenStoreProfile}
              />
            )}

            {consumerTab === "orders" && (
              <ConsumerOrdersScreen
                orders={activeOrders}
                listings={activeListings}
                customerName={session.customerName || "Konsumen NullWasted"}
                onCancelOrder={handleCancelOrder}
                onRefreshOrders={refreshOrders}
              />
            )}

            {/* Detail Sheet Modal */}
            <ConsumerDetailModal
              item={selectedFeedItem}
              onClose={() => {
                setSelectedFeedItem(null);
                void refreshOrders();
                void refreshListings();
              }}
              onReserve={handleReserve}
              onAddToCart={handleAddToCart}
              onQrisPaid={async (orderCode) => {
                setSelectedFeedItem(null);
                await refreshListings();
                await refreshOrders();
                setConsumerTab("orders");
                navigateToPath("/orders");
                showToast(`Pembayaran QRIS lunas! Tiket ${orderCode} siap diambil.`, "success");
              }}
              customerName={session.customerName || "Konsumen NullWasted"}
              customerPhone={session.customerPhone || ""}
              isReserving={isReserving}
              onOpenStoreProfile={handleOpenStoreProfile}
            />
          </>
        )}

        {/* Floating Single-Store Cart Trigger Bar (Consumer & Guest Mode) */}
        {(!session || session.role === "consumer") && !showAuthScreen && cartItems.length > 0 && (
          <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md">
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="w-full px-4 py-3 rounded-2xl bg-[#181C2E] hover:bg-[#252a44] text-white shadow-xl flex items-center justify-between gap-3 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                  {cartItems.reduce((s, c) => s + c.quantity, 0)}
                </span>
                <div className="text-left min-w-0">
                  <p className="text-xs font-bold truncate">
                    Keranjang · {cartItems[0]?.listing.store_name}
                  </p>
                  <p className="text-[11px] text-emerald-300 font-semibold">
                    {cartItems.length} menu · Ketuk untuk Checkout
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-sm font-extrabold tabular-nums">
                  Rp{" "}
                  {cartItems
                    .reduce((s, c) => s + c.listing.discounted_price * c.quantity, 0)
                    .toLocaleString("id-ID")}
                </span>
                <ShoppingCart className="w-4 h-4 text-emerald-400" />
              </div>
            </button>
          </div>
        )}

        <ConsumerCartModal
          isOpen={isCartOpen}
          items={cartItems}
          onClose={() => {
            setIsCartOpen(false);
            void refreshOrders();
            void refreshListings();
          }}
          onUpdateQty={handleUpdateCartQty}
          onRemoveItem={(lid) => setCartItems((prev) => prev.filter((c) => c.listing.id !== lid))}
          onClearCart={() => setCartItems([])}
          onCheckout={handleCheckoutCart}
          onRequireLogin={() => {
            setIsCartOpen(false);
            setLoginNotice("Masuk sebagai Konsumen untuk menyelesaikan checkout keranjang Anda.");
            setShowAuthScreen(true);
            navigateToPath("/login");
          }}
          onQrisPaid={async (orderCode) => {
            setCartItems([]);
            setIsCartOpen(false);
            await refreshListings();
            await refreshOrders();
            setConsumerTab("orders");
            navigateToPath("/orders");
            showToast(`Pembayaran QRIS keranjang lunas! Tiket ${orderCode} siap diambil.`, "success");
          }}
          customerName={session?.customerName || "Konsumen NullWasted"}
          customerPhone={session?.customerPhone || ""}
          isCheckingOut={isReserving}
          isGuest={!session}
        />

        {/* Global Modals: User/Merchant Profile & Public Store Profile */}
        <ProfileModal
          isOpen={isProfileOpen}
          session={session}
          onClose={handleCloseProfile}
          onSessionUpdated={handleSessionUpdated}
          onToast={showToast}
        />
        <PublicStoreModal
          storeId={selectedStoreProfileId}
          onClose={handleCloseStoreProfile}
          onSelectItem={(item) => setSelectedFeedItem(item)}
          isFavorite={Boolean(selectedStoreProfileId && favoriteStoreIds.includes(selectedStoreProfileId))}
          onToggleFavorite={handleToggleFavoriteStore}
        />
      </main>

      {/* Bottom Navigation Bar */}
      {session && (
        <nav className="flex md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-100 px-3 py-2 items-center justify-around shadow-[0_-8px_24px_rgba(150,150,154,0.1)]">
          {session.role === "merchant" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMerchantTab("create");
                  setActiveDraft(null);
                  navigateToPath("/merchant/create");
                }}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                  merchantTab === "create"
                    ? "text-emerald-600 font-bold"
                    : "text-[#A0A5BA] hover:text-[#646982]"
                }`}
              >
                <PlusCircle className="w-5 h-5" />
                <span className="text-[10px]">Buat Listing</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMerchantTab("inventory");
                  navigateToPath("/merchant/inventory");
                }}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all relative ${
                  merchantTab === "inventory"
                    ? "text-emerald-600 font-bold"
                    : "text-[#A0A5BA] hover:text-[#646982]"
                }`}
              >
                <ClipboardList className="w-5 h-5" />
                <span className="text-[10px]">Inventaris ({activeListings.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMerchantTab("cashier");
                  navigateToPath("/merchant/cashier");
                }}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all relative ${
                  merchantTab === "cashier"
                    ? "text-emerald-600 font-bold"
                    : "text-[#A0A5BA] hover:text-[#646982]"
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
                onClick={() => {
                  setConsumerTab("explore");
                  navigateToPath("/");
                }}
                className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all ${
                  consumerTab === "explore"
                    ? "text-emerald-600 font-bold"
                    : "text-[#A0A5BA] hover:text-[#646982]"
                }`}
              >
                <UtensilsCrossed className="w-5 h-5" />
                <span className="text-[10px]">Jelajah ({nonExpiredListingsCount})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setConsumerTab("orders");
                  navigateToPath("/orders");
                }}
                className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all relative ${
                  consumerTab === "orders"
                    ? "text-emerald-600 font-bold"
                    : "text-[#A0A5BA] hover:text-[#646982]"
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
