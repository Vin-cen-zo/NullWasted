import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ItemListing } from "../types/listing";
import { X, MapPin, Store, ShoppingBag, ArrowRight, ExternalLink } from "lucide-react";

interface ConsumerMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  listings: ItemListing[];
  onSelectItem: (item: ItemListing) => void;
  userCoords?: [number, number]; // [lat, lng]
}

const DEFAULT_CENTER: [number, number] = [-6.3626, 106.8240]; // FTUI Depok

export const ConsumerMapModal: React.FC<ConsumerMapModalProps> = ({
  isOpen,
  onClose,
  listings,
  onSelectItem,
  userCoords = DEFAULT_CENTER,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  // Group listings by store
  const storeMap = new Map<
    string,
    {
      storeName: string;
      locationBadge: string;
      lat: number;
      lng: number;
      items: ItemListing[];
    }
  >();

  listings.forEach((item) => {
    const sId = item.store_id || "FTUI-001";
    let lat = item.latitude || -6.3621;
    let lng = item.longitude || 106.8246;

    // Hard fallback coordinates for known demo stores aligning with 3 radius zones
    if (sId === "FTUI-001") {
      lat = -6.3621;
      lng = 106.8246;
    } else if (sId === "KUTEK-007") {
      lat = -6.3575;
      lng = 106.8195;
    } else if (sId === "MARGONDA-042") {
      lat = -6.3685;
      lng = 106.8375;
    }

    if (!storeMap.has(sId)) {
      storeMap.set(sId, {
        storeName: item.store_name,
        locationBadge: item.location_badge,
        lat,
        lng,
        items: [],
      });
    }
    storeMap.get(sId)!.items.push(item);
  });

  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    // Destroy existing map instance if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: userCoords,
      zoom: 15,
      zoomControl: false,
    });
    mapInstanceRef.current = map;

    // OpenStreetMap Tile Layer (Rp0 Free Tile Service)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    // 1. User Location Marker (Blue Dot & 500m Walking Perimeter Circle with Tooltip)
    L.circle(userCoords, {
      radius: 500,
      color: "#3B82F6",
      fillColor: "#60A5FA",
      fillOpacity: 0.15,
      weight: 1.5,
      dashArray: "4, 6",
    })
      .addTo(map)
      .bindTooltip("Area Jangkauan Jalan Kaki 500 Meter (± 5 Menit)", {
        sticky: true,
        direction: "top",
      });

    const userIcon = L.divIcon({
      className: "custom-user-marker",
      html: `
        <div style="background-color: #2563EB; width: 18px; height: 18px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(37,99,235,0.6);"></div>
      `,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    L.marker(userCoords, { icon: userIcon })
      .addTo(map)
      .bindPopup("<b>Posisi Anda</b><br>Kampus UI Depok Area");

    // 2. Partner Stores Markers (Emerald Pin with Item Count)
    storeMap.forEach((storeData, sId) => {
      const storeIcon = L.divIcon({
        className: "custom-store-marker",
        html: `
          <div style="background-color: #059669; color: white; padding: 4px 8px; border-radius: 12px; font-weight: bold; font-size: 11px; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.25); border: 2px solid white; cursor: pointer;">
            <span>🏪</span>
            <span>${storeData.items.length} Surplus</span>
          </div>
        `,
        iconSize: [90, 28],
        iconAnchor: [45, 14],
      });

      const marker = L.marker([storeData.lat, storeData.lng], { icon: storeIcon }).addTo(map);
      marker.on("click", () => {
        setSelectedStoreId(sId);
      });
    });

    // Invalidate size after layout settles
    const timeout = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timeout);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, listings.length, userCoords]);

  // Leaflet map invalidation on store panel toggle and responsive window resize
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 150);

    const handleResize = () => {
      mapInstanceRef.current?.invalidateSize();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen, selectedStoreId]);

  if (!isOpen) return null;

  const activeStoreData = selectedStoreId ? storeMap.get(selectedStoreId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3">
      <div className="w-full max-w-4xl bg-stone-50 rounded-2xl sm:rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col h-[85vh] sm:h-[82vh]">
        {/* Header */}
        <div className="bg-emerald-700 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <MapPin className="w-5 h-5 text-emerald-200" />
            <div>
              <h2 className="font-bold text-sm">Peta Makanan Surplus Kampus UI</h2>
              <p className="text-[11px] text-emerald-100">OpenStreetMap Interactive Explorer</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-emerald-600 transition text-emerald-100 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Map Viewport Container */}
        <div className="flex-1 relative">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Quick instructions & floating legend */}
          <div className="absolute top-3 left-3 right-3 z-[400] pointer-events-none space-y-1">
            <div className="bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-xl shadow-md border border-stone-200 text-center space-y-0.5">
              <div className="text-[10px] font-bold text-stone-800 flex items-center justify-center gap-1.5">
                <span>🔵 Lingkaran Biru: Radius Jalan Kaki 500m (± 5 Menit)</span>
              </div>
              <div className="text-[10px] text-stone-600">
                🏪 Pin Hijau: Gerai Surplus (Klik pin untuk detail & navigasi)
              </div>
            </div>
          </div>
        </div>

        {/* Selected Store Bottom Sheet Details */}
        {activeStoreData ? (
          <div className="p-4 bg-white border-t border-stone-200 shadow-lg space-y-3 shrink-0 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-emerald-600" />
                  <span>{activeStoreData.storeName}</span>
                </h3>
                <p className="text-[10px] text-stone-500">{activeStoreData.locationBadge}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStoreId(null)}
                className="text-[10px] text-stone-400 hover:text-stone-600 underline cursor-pointer"
              >
                Tutup Detail
              </button>
            </div>

            {/* Google Maps Directions Button */}
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${activeStoreData.lat},${activeStoreData.lng}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition shadow-sm"
            >
              <span>🗺️ Buka Petunjuk Arah di Google Maps</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeStoreData.items.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-stone-800 block text-[11px]">{item.food_name}</span>
                    <span className="text-emerald-600 font-extrabold text-[11px]">
                      Rp {item.discounted_price.toLocaleString("id-ID")}
                    </span>
                    <span className="text-[10px] text-stone-400 line-through ml-1.5">
                      Rp {item.original_price.toLocaleString("id-ID")}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectItem(item);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] transition shadow-sm cursor-pointer"
                  >
                    <ShoppingBag className="w-3 h-3" />
                    <span>Pilih & Pesan</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-stone-100 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-600 shrink-0">
            <span>
              Terdapat <strong>{listings.length} hidangan aktif</strong> di sekitar Anda.
            </span>
            <button
              onClick={onClose}
              className="font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
            >
              <span>Lihat Daftar Feed</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
