import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { InputPanel } from "./components/InputPanel";
import { PreviewCard } from "./components/PreviewCard";
import { ActiveListingsTable } from "./components/ActiveListingsTable";
import { ConsumerFeed } from "./components/ConsumerFeed";
import { OrderModal } from "./components/OrderModal";
import {
  createDraft,
  publishListing,
  fetchActiveListings,
  reserveOrder,
  deleteListing,
} from "./services/api";
import { DraftResponse, ItemListing, OrderTicket, PublishRequest } from "./types/listing";

export const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<"merchant" | "consumer">("merchant");
  const [inputText, setInputText] = useState<string>("");
  const [activeDraft, setActiveDraft] = useState<DraftResponse | null>(null);
  const [activeListings, setActiveListings] = useState<ItemListing[]>([]);
  const [activeTicket, setActiveTicket] = useState<OrderTicket | null>(null);

  const [isLoadingDraft, setIsLoadingDraft] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [isLoadingListings, setIsLoadingListings] = useState<boolean>(false);
  const [isReservingId, setIsReservingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const loadListings = async () => {
    try {
      setIsLoadingListings(true);
      const data = await fetchActiveListings();
      setActiveListings(data);
    } catch (err: any) {
      console.error("Failed to load listings:", err);
    } finally {
      setIsLoadingListings(false);
    }
  };

  useEffect(() => {
    loadListings();
  }, []);

  // 1. Submit Draft
  const handleDraftSubmit = async (text: string) => {
    if (!text.trim()) return;
    try {
      setIsLoadingDraft(true);
      const result = await createDraft(text);
      setActiveDraft(result);
      if (result.safety_status === "REJECTED") {
        showToast("Perhatian: Makanan terdeteksi melanggar ambang aman BPOM!", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Gagal memproses draf makanan.", "error");
    } finally {
      setIsLoadingDraft(false);
    }
  };

  // 2. Publish Listing
  const handlePublish = async (payload: PublishRequest) => {
    try {
      setIsPublishing(true);
      const published = await publishListing(payload);
      showToast(`Sukses! ${published.food_name} berhasil diterbitkan dengan harga terkunci.`);
      setActiveDraft(null);
      setInputText("");
      await loadListings();
    } catch (err: any) {
      showToast(err.message || "Gagal menerbitkan listing.", "error");
    } finally {
      setIsPublishing(false);
    }
  };

  // 3. Reserve Portion (Consumer side)
  const handleReserve = async (listingId: string) => {
    try {
      setIsReservingId(listingId);
      const ticket = await reserveOrder(listingId, 1);
      setActiveTicket(ticket);
      await loadListings();
    } catch (err: any) {
      showToast(err.message || "Gagal melakukan reservasi makanan.", "error");
    } finally {
      setIsReservingId(null);
    }
  };

  // 4. Delete / Deactivate Listing (Merchant side)
  const handleDeleteListing = async (listingId: string) => {
    try {
      await deleteListing(listingId);
      showToast("Listing berhasil dihapus dari inventaris toko.");
      await loadListings();
    } catch (err: any) {
      showToast(err.message || "Gagal menghapus listing.", "error");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F0] flex flex-col justify-between">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold border transition-all animate-bounce ${
            toastMessage.type === "error"
              ? "bg-red-600 text-white border-red-700"
              : "bg-[#10B981] text-white border-emerald-700"
          }`}
        >
          {toastMessage.text}
        </div>
      )}

      <div>
        {/* Navigation Header with Role Switcher */}
        <Header
          currentRole={currentRole}
          onRoleChange={setCurrentRole}
          activeCatalogCount={activeListings.length}
        />

        {/* Main Content Area */}
        <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
          {currentRole === "merchant" ? (
            /* MERCHANT VIEW (80% DEMO FLOW) */
            <div className="space-y-6">
              {/* Natural Language & Preset Pills Panel */}
              <InputPanel
                inputText={inputText}
                setInputText={setInputText}
                onSubmitDraft={handleDraftSubmit}
                isLoading={isLoadingDraft}
              />

              {/* 1-Tap Confirmation Preview Card & Dynamic Pricing */}
              {activeDraft && (
                <PreviewCard
                  draft={activeDraft}
                  onPublish={handlePublish}
                  isPublishing={isPublishing}
                />
              )}

              {/* Active Listings Table */}
              <ActiveListingsTable
                listings={activeListings}
                onDeleteListing={handleDeleteListing}
                isLoading={isLoadingListings}
              />
            </div>
          ) : (
            /* CONSUMER VIEW (20% DEMO FLOW) */
            <div className="space-y-6">
              <ConsumerFeed
                listings={activeListings}
                onReserve={handleReserve}
                isReservingId={isReservingId}
              />
            </div>
          )}
        </main>
      </div>

      {/* Digital Order Pass QR Modal */}
      <OrderModal
        ticket={activeTicket}
        onClose={() => setActiveTicket(null)}
      />

      {/* Footer */}
      <footer className="border-t border-[#E5E0D8] bg-[#FFFFFF] py-4 text-center text-xs text-[#6B7280]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            🌿 <strong>NullWasted</strong> — Autonomous AI-Powered Surplus Food Rescue Marketplace
          </span>
          <span className="text-[11px]">
            FastAPI · LangGraph Agentic Core · React Vite PWA · PerBPOM No. 16/2019
          </span>
        </div>
      </footer>
    </div>
  );
};

export default App;
