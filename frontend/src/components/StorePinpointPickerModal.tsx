import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Search, Crosshair, Trash2, Check, X, Loader2, ExternalLink } from "lucide-react";

interface StorePinpointPickerModalProps {
  isOpen: boolean;
  initialLat?: number | null;
  initialLng?: number | null;
  initialLabel?: string;
  storeName?: string;
  allowRemove?: boolean;
  onSave: (lat: number | null, lng: number | null, label?: string) => Promise<void> | void;
  onClose: () => void;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

const DEFAULT_INDONESIA_CENTER: [number, number] = [-6.2088, 106.8456];

function createCustomPinIcon(): L.DivIcon {
  return L.divIcon({
    className: "nullwasted-pinpoint-marker",
    html: `<div style="width:32px;height:40px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;pointer-events:none;">
      <div style="width:32px;height:32px;border-radius:9999px;background:#059669;border:3px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#ffffff;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>
      <div style="width:4px;height:8px;background:#059669;border-radius:0 0 4px 4px;"></div>
    </div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
  });
}

function parseCoordinatesOrGoogleMapsUrl(raw: string): { lat: number; lng: number } | null {
  const trimmed = raw.trim();
  // Match Google Maps @lat,lng or q=lat,lng
  const atMatch = trimmed.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  const qMatch = trimmed.match(/[?&](?:q|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (qMatch) {
    const lat = Number(qMatch[1]);
    const lng = Number(qMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  // Match plain "lat, lng"
  const plainMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (plainMatch) {
    const lat = Number(plainMatch[1]);
    const lng = Number(plainMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

export const StorePinpointPickerModal: React.FC<StorePinpointPickerModalProps> = ({
  isOpen,
  initialLat,
  initialLng,
  initialLabel = "",
  storeName = "Gerai Mitra",
  allowRemove = true,
  onSave,
  onClose,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [selectedLat, setSelectedLat] = useState<number | null>(initialLat ?? null);
  const [selectedLng, setSelectedLng] = useState<number | null>(initialLng ?? null);
  const [locationLabel, setLocationLabel] = useState<string>(initialLabel);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedLat(initialLat ?? null);
    setSelectedLng(initialLng ?? null);
    setLocationLabel(initialLabel || "");
    setSearchQuery("");
    setStatusError(null);
    setSearchResults([]);
  }, [isOpen, initialLat, initialLng, initialLabel]);

  const placeMarker = (
    lat: number,
    lng: number,
    options: { pan?: boolean; zoom?: number } = { pan: true, zoom: 16 }
  ) => {
    setSelectedLat(Number(lat.toFixed(6)));
    setSelectedLng(Number(lng.toFixed(6)));
    setStatusError(null);

    const map = mapInstanceRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], {
        draggable: true,
        icon: createCustomPinIcon(),
      }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        setSelectedLat(Number(pos.lat.toFixed(6)));
        setSelectedLng(Number(pos.lng.toFixed(6)));
      });
      markerRef.current = marker;
    }

    if (options.pan !== false) {
      const targetZoom = options.zoom ?? 16;
      map.setView([lat, lng], Math.max(map.getZoom(), targetZoom), { animate: true });
    }
  };

  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    const hasInitial = typeof initialLat === "number" && typeof initialLng === "number";
    const startCenter: [number, number] = hasInitial
      ? [initialLat as number, initialLng as number]
      : DEFAULT_INDONESIA_CENTER;

    const map = L.map(mapContainerRef.current, {
      center: startCenter,
      zoom: hasInitial ? 16 : 11,
      minZoom: 2,
      maxBounds: [
        [-85, -180],
        [85, 180],
      ],
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
      noWrap: true,
    }).addTo(map);

    mapInstanceRef.current = map;

    if (hasInitial) {
      placeMarker(initialLat as number, initialLng as number, { pan: true, zoom: 16 });
    }

    map.on("click", (e: L.LeafletMouseEvent) => {
      placeMarker(e.latlng.lat, e.latlng.lng, { pan: false });
    });

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timer);
      searchAbortRef.current?.abort();
      resizeObserver.disconnect();
      markerRef.current = null;
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [isOpen]);

  const searchAbortRef = useRef<AbortController | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const q = searchQuery.trim();
    if (!q) return;

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setStatusError(null);
    const directCoords = parseCoordinatesOrGoogleMapsUrl(q);
    if (directCoords) {
      placeMarker(directCoords.lat, directCoords.lng, { pan: true, zoom: 16 });
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results: NominatimResult[] = [];
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&accept-language=id&countrycodes=id&limit=6&q=${encodeURIComponent(q)}`;
      const nomRes = await fetch(nominatimUrl, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }).catch(() => null);

      if (controller.signal.aborted) return;

      if (nomRes && nomRes.ok) {
        const nomData: NominatimResult[] = await nomRes.json();
        results.push(...nomData);
      }

      // Fallback/augment with Photon OSM geocoder for specific street/building queries
      if (results.length === 0) {
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lat=-6.2088&lon=106.8456`;
        const phoRes = await fetch(photonUrl, { signal: controller.signal }).catch(() => null);
        if (controller.signal.aborted) return;
        if (phoRes && phoRes.ok) {
          const phoJson = await phoRes.json();
          const features = Array.isArray(phoJson?.features) ? phoJson.features : [];
          features.forEach((f: any, idx: number) => {
            const coords = f?.geometry?.coordinates;
            const props = f?.properties || {};
            if (Array.isArray(coords) && coords.length >= 2) {
              const parts = [props.name, props.street, props.district, props.city, props.state]
                .filter(Boolean)
                .join(", ");
              results.push({
                place_id: Date.now() + idx,
                display_name: parts || q,
                lat: String(coords[1]),
                lon: String(coords[0]),
              });
            }
          });
        }
      }

      if (controller.signal.aborted) return;

      setSearchResults(results);
      if (results.length > 0) {
        const first = results[0];
        const firstLat = parseFloat(first.lat);
        const firstLng = parseFloat(first.lon);
        if (Number.isFinite(firstLat) && Number.isFinite(firstLng)) {
          placeMarker(firstLat, firstLng, { pan: true, zoom: 16 });
          const shortName = first.display_name.split(",").slice(0, 2).join(", ").trim();
          if (shortName) {
            setLocationLabel(shortName);
          }
        }
      } else {
        setStatusError("Lokasi tidak ditemukan. Coba nama jalan/kecamatan atau tempel koordinat Google Maps.");
      }
    } catch {
      if (!controller.signal.aborted) {
        setStatusError("Pencarian peta gagal. Ketuk langsung pada peta untuk menaruh pin gerai.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setStatusError("Browser tidak mendukung GPS.");
      return;
    }
    setIsLocatingGps(true);
    setStatusError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGps(false);
        placeMarker(pos.coords.latitude, pos.coords.longitude, { pan: true, zoom: 17 });
      },
      () => {
        setIsLocatingGps(false);
        setStatusError("Izin GPS ditolak atau gagal membaca lokasi. Ketuk langsung di peta.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSavePin = async () => {
    if (selectedLat === null || selectedLng === null) {
      setStatusError("Ketuk peta atau pilih lokasi terlebih dahulu sebelum menyimpan pin.");
      return;
    }
    setIsSaving(true);
    try {
      await onSave(selectedLat, selectedLng, locationLabel.trim() || undefined);
      onClose();
    } catch (err: any) {
      setStatusError(err?.message || "Gagal menyimpan pin lokasi.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemovePin = async () => {
    setIsSaving(true);
    setStatusError(null);
    try {
      await onSave(null, null, locationLabel.trim() || undefined);
      if (markerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      setSelectedLat(null);
      setSelectedLng(null);
      onClose();
    } catch (err: any) {
      setStatusError(err?.message || "Gagal menghapus pin lokasi.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-4 py-3.5 bg-white border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#F0F5FA] flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#222222] truncate">
                Pinpoint Lokasi · {storeName}
              </h3>
              <p className="text-xs text-[#646982] truncate">
                Cari area atau ketuk peta untuk menaruh pin gerai
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[#F0F5FA] text-[#646982] cursor-pointer"
            aria-label="Tutup pemilih pin lokasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & GPS Controls */}
        <div className="p-3 bg-white border-b border-slate-100 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleSearch();
                  }
                }}
                placeholder="Cari area atau link Google Maps..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-[#F0F5FA] focus:bg-white text-xs font-medium text-[#222222] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
            </div>
            <button
              type="button"
              onClick={(e) => void handleSearch(e)}
              disabled={isSearching}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Cari</span>
            </button>
            <button
              type="button"
              onClick={handleUseGps}
              disabled={isLocatingGps}
              className="px-3 py-2 rounded-lg bg-[#F0F5FA] hover:bg-slate-200/70 text-[#222222] text-xs font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
              title="Lompat ke koordinat GPS perangkat saat ini"
            >
              {isLocatingGps ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" /> : <Crosshair className="w-3.5 h-3.5 text-emerald-600" />}
              <span className="hidden sm:inline">GPS Saya</span>
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
              {searchResults.map((item) => (
                <button
                  key={item.place_id}
                  type="button"
                  onClick={() => {
                    const lat = parseFloat(item.lat);
                    const lng = parseFloat(item.lon);
                    placeMarker(lat, lng, { pan: true, zoom: 16 });
                    const shortName = item.display_name.split(",").slice(0, 2).join(", ").trim();
                    if (shortName) {
                      setLocationLabel(shortName);
                    }
                    setSearchResults([]);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[#F0F5FA] text-[#222222] transition-colors cursor-pointer"
                >
                  {item.display_name}
                </button>
              ))}
            </div>
          )}

          {statusError && (
            <div className="px-3 py-2 rounded-lg bg-red-50 text-xs text-red-700 font-medium">
              {statusError}
            </div>
          )}
        </div>

        {/* Interactive Leaflet Map */}
        <div className="relative flex-1 min-h-[260px] sm:min-h-[320px] bg-slate-100">
          <div ref={mapContainerRef} className="w-full h-full min-h-[260px] sm:min-h-[320px] z-0" />
          {selectedLat === null && (
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-[400] px-3 py-1.5 rounded-lg bg-white/95 shadow text-xs font-semibold text-[#222222]">
              Ketuk titik mana saja di peta untuk menaruh pin
            </div>
          )}
        </div>

        {/* Footer details & Actions */}
        <div className="p-4 bg-white border-t border-slate-100 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
            <div>
              <label className="block text-xs font-semibold text-[#646982] mb-1">
                Label Area (Opsional)
              </label>
              <input
                type="text"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="Mis: Bekasi Timur / Jl. Sudirman"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-[#F0F5FA] focus:bg-white text-xs font-medium text-[#222222] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="text-xs bg-[#F0F5FA] rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-[#646982]">Koordinat</span>
                <span className="tabular-nums font-bold text-[#222222] truncate block">
                  {selectedLat !== null && selectedLng !== null
                    ? `${selectedLat}, ${selectedLng}`
                    : "Belum ada pin"}
                </span>
              </div>
              {selectedLat !== null && selectedLng !== null && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${selectedLat},${selectedLng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1 shrink-0"
                >
                  <span>GMaps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {allowRemove && (initialLat != null || selectedLat !== null) ? (
              <button
                type="button"
                onClick={handleRemovePin}
                disabled={isSaving}
                className="px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Pin</span>
              </button>
            ) : (
              <span className="text-xs text-[#646982]">
                Pin bisa diubah atau dihapus kapan saja.
              </span>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg bg-[#F0F5FA] hover:bg-slate-200/70 text-xs font-bold text-[#222222] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSavePin}
                disabled={isSaving || selectedLat === null}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Simpan Pinpoint</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
