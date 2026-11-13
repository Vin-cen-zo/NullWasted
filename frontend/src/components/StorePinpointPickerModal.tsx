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
      <div style="width:32px;height:32px;border-radius:9999px;background:#059669;border:3px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#ffffff;font-weight:900;font-size:14px;">📍</div>
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
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
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
      resizeObserver.disconnect();
      markerRef.current = null;
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const q = searchQuery.trim();
    if (!q) return;

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
      }).catch(() => null);

      if (nomRes && nomRes.ok) {
        const nomData: NominatimResult[] = await nomRes.json();
        results.push(...nomData);
      }

      // Fallback/augment with Photon OSM geocoder for specific street/building queries
      if (results.length === 0) {
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lat=-6.2088&lon=106.8456`;
        const phoRes = await fetch(photonUrl).catch(() => null);
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

      setSearchResults(results);
      if (results.length > 0) {
        const first = results[0];
        const firstLat = parseFloat(first.lat);
        const firstLng = parseFloat(first.lon);
        if (Number.isFinite(firstLat) && Number.isFinite(firstLng)) {
          placeMarker(firstLat, firstLng, { pan: true, zoom: 16 });
          if (!locationLabel.trim()) {
            const shortName = first.display_name.split(",").slice(0, 2).join(", ").trim();
            setLocationLabel(shortName);
          }
        }
      } else {
        setStatusError("Lokasi tidak ditemukan. Coba nama jalan/kecamatan atau tempel koordinat Google Maps.");
      }
    } catch {
      setStatusError("Pencarian peta gagal. Ketuk langsung pada peta untuk menaruh pin gerai.");
    } finally {
      setIsSearching(false);
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
    try {
      if (markerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      setSelectedLat(null);
      setSelectedLng(null);
      await onSave(null, null, locationLabel.trim() || undefined);
      onClose();
    } catch (err: any) {
      setStatusError(err?.message || "Gagal menghapus pin lokasi.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-[#F8F6F0] rounded-3xl shadow-2xl border border-[#D8D2C5] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-4 py-3.5 bg-white border-b border-[#E7E1D4] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-[#1F1D1A] truncate">
                Pinpoint Lokasi Gerai · {storeName}
              </h3>
              <p className="text-[11px] text-[#6B655B] truncate">
                Cari area, tempel tautan Google Maps, atau ketuk peta untuk menaruh pin permanen.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-stone-100 text-stone-500"
            aria-label="Tutup pemilih pin lokasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & GPS Controls (uses div + type="button" so it never triggers parent forms) */}
        <div className="p-3 bg-white border-b border-[#E7E1D4] space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
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
                placeholder="Cari area (mis: Bekasi Timur), koordinat, atau link Google Maps..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F8F6F0] text-xs font-medium text-[#1F1D1A] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              type="button"
              onClick={(e) => void handleSearch(e)}
              disabled={isSearching}
              className="px-3.5 py-2 rounded-xl bg-[#1F1D1A] hover:bg-stone-800 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Cari</span>
            </button>
            <button
              type="button"
              onClick={handleUseGps}
              disabled={isLocatingGps}
              className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
              title="Lompat ke koordinat GPS perangkat saat ini"
            >
              {isLocatingGps ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">GPS Saya</span>
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-xl border border-[#D8D2C5] bg-white divide-y divide-stone-100">
              {searchResults.map((item) => (
                <button
                  key={item.place_id}
                  type="button"
                  onClick={() => {
                    const lat = parseFloat(item.lat);
                    const lng = parseFloat(item.lon);
                    placeMarker(lat, lng, { pan: true, zoom: 16 });
                    if (!locationLabel.trim()) {
                      const shortName = item.display_name.split(",").slice(0, 2).join(", ").trim();
                      setLocationLabel(shortName);
                    }
                    setSearchResults([]);
                  }}
                  className="w-full text-left px-3 py-2 text-[11px] hover:bg-emerald-50 text-[#1F1D1A] transition-colors cursor-pointer"
                >
                  {item.display_name}
                </button>
              ))}
            </div>
          )}

          {statusError && (
            <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-medium">
              {statusError}
            </div>
          )}
        </div>

        {/* Interactive Leaflet Map */}
        <div className="relative flex-1 min-h-[260px] sm:min-h-[320px] bg-stone-200">
          <div ref={mapContainerRef} className="w-full h-full min-h-[260px] sm:min-h-[320px] z-0" />
          {selectedLat === null && (
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-[400] px-3 py-1.5 rounded-full bg-white/95 border border-[#D8D2C5] shadow text-[11px] font-bold text-[#1F1D1A]">
              Ketuk titik mana saja di peta untuk menaruh pin gerai
            </div>
          )}
        </div>

        {/* Footer details & Actions */}
        <div className="p-3.5 bg-white border-t border-[#E7E1D4] space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
            <div>
              <label className="block text-[10px] font-bold text-[#6B655B] mb-1">
                Label Singkat Area (Opsional)
              </label>
              <input
                type="text"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="Mis: Bekasi Timur / Jl. Sudirman"
                className="w-full px-3 py-1.5 rounded-xl border border-[#D8D2C5] bg-[#F8F6F0] text-xs font-medium text-[#1F1D1A]"
              />
            </div>
            <div className="text-[11px] bg-[#F8F6F0] rounded-xl px-3 py-2 border border-[#E7E1D4] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="block text-[10px] font-bold text-[#6B655B]">Koordinat Pinpoint</span>
                <span className="font-mono font-bold text-[#1F1D1A] truncate block">
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
                  className="text-[10px] font-bold text-emerald-700 hover:underline flex items-center gap-0.5 shrink-0"
                >
                  <span>Cek GMaps</span>
                  <ExternalLink className="w-3 h-3" />
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
                className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Pin Lokasi</span>
              </button>
            ) : (
              <span className="text-[11px] text-[#6B655B]">
                Pin bisa diubah atau dihapus kapan saja saat gerai pindah.
              </span>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl border border-[#D8D2C5] bg-white hover:bg-stone-50 text-xs font-bold text-[#1F1D1A]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSavePin}
                disabled={isSaving || selectedLat === null}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
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
