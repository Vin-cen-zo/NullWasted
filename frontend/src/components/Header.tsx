import React from "react";
import { Store, ShoppingBag, ShieldCheck } from "lucide-react";

interface HeaderProps {
  currentRole: "merchant" | "consumer";
  onRoleChange: (role: "merchant" | "consumer") => void;
  activeCatalogCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  activeCatalogCount,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#FFFFFF]/90 backdrop-blur-md border-b border-[#E5E0D8] px-4 lg:px-8 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Brand Logo & Subtitle */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#10B981] to-[#059669] flex items-center justify-center shadow-sm text-white font-bold text-lg">
              🌿
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-[#1F1D1A]">
                  NullWasted
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#10B981]/10 text-[#059669] border border-[#10B981]/20">
                  Sprint 1 Demo
                </span>
              </div>
              <p className="text-xs text-[#6B7280] hidden sm:block">
                AI-Powered Surplus Food Rescue Marketplace
              </p>
            </div>
          </div>

          {/* Mobile Safety Chip */}
          <div className="sm:hidden flex items-center gap-1 text-[11px] font-medium text-[#059669] bg-[#10B981]/10 px-2 py-1 rounded-md">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>BPOM Guardrail</span>
          </div>
        </div>

        {/* Global Role Switcher Pill Bar */}
        <div className="flex items-center gap-2 bg-[#F8F6F0] p-1 rounded-xl border border-[#E5E0D8] w-full sm:w-auto justify-center">
          <button
            type="button"
            onClick={() => onRoleChange("merchant")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentRole === "merchant"
                ? "bg-[#FFFFFF] text-[#1F1D1A] shadow-sm border border-[#E5E0D8]"
                : "text-[#6B7280] hover:text-[#1F1D1A]"
            }`}
          >
            <Store className={`w-3.5 h-3.5 ${currentRole === "merchant" ? "text-[#10B981]" : ""}`} />
            <span>Mode Penjual</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-normal">
              Dapur Barokah
            </span>
          </button>

          <button
            type="button"
            onClick={() => onRoleChange("consumer")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentRole === "consumer"
                ? "bg-[#FFFFFF] text-[#1F1D1A] shadow-sm border border-[#E5E0D8]"
                : "text-[#6B7280] hover:text-[#1F1D1A]"
            }`}
          >
            <ShoppingBag className={`w-3.5 h-3.5 ${currentRole === "consumer" ? "text-[#10B981]" : ""}`} />
            <span>Mode Pembeli</span>
            <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-[#10B981] text-white">
              {activeCatalogCount}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
