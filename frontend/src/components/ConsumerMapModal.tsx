import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ItemListing, StoreProfile } from "../types/listing";
import { fetchStores } from "../services/api";
import { X, MapPin, Store, ShoppingBag, ArrowRight, ExternalLink, Maximize2 } from "lucide-react";

interface ConsumerMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  listings: ItemListing[];
  onSelectItem: (item: ItemListing) => void;
  userCoords?: [number, number] | null; // [lat, lng]
}

const DEFAULT_OVERVIEW_CENTER: [number, number] = [-6.2588, 106.8856];

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const phi1 = (lat2 * Math.PI) / 180;
  const phi2 = (lat1 * Math.PI) / 180;
  const dPhi = ((lat1 - lat2) * Math.PI) / 180;
  const dLambda = ((lng1 - lng2) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export const ConsumerMapModal: React.FC<ConsumerMapModalProps> = ({
  isOpen,
  onClose,
  listings,
  onSelectItem,
  userCoords = null,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const hasInitialFitRef = useRef<boolean>(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [registeredStores, setRegisteredStores] = useState<StoreProfile[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    fetchStores()
      .then((stores) => {
        if (active) setRegisteredStores(stores);
      })
      .catch(() => {
        // Fallback silently to listings-derived stores if /stores unavailable
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  // Group all pinned registered stores + active listings
  const storeMap = useMemo(() => {
    const map = new Map<
      string,
      {
        storeName: string;
        locationBadge: string;
        lat: number;
        lng: number;
        items: ItemListing[];
      }
    >();

    registeredStores.forEach((st) => {
      if (typeof st.latitude === "number" && typeof st.longitude === "number") {
        map.set(st.store_id, {
          storeName: st.name,
          locationBadge: st.location_name || st.name,
          lat: st.latitude,
          lng: st.longitude,
          items: [],
        });
      }
    });

    listings.forEach((item) => {
      const sId = item.store_id || item.store_name;
      const existing = map.get(sId);
      if (existing) {
        existing.items.push(item);
        return;
      }
      if (typeof item.latitude === "number" && typeof item.longitude === "number") {
        map.set(sId, {
          storeName: item.store_name,
          locationBadge: item.location_badge || item.store_name,
          lat: item.latitude,
          lng: item.longitude,
          items: [item],
        });
      }
    });

    return map;
  }, [registeredStores, listings]);

  const fitAllPinnedStores = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const points: [number, number][] = [];
    if (userCoords) points.push(userCoords);
    storeMap.forEach((s) => points.push([s.lat, s.lng]));
    if (points.length === 1) {
      map.setView(points[0], 14, { animate: true });
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15, animate: true });
    }
  };

  // 1. Initialize Leaflet Map instance ONLY ONCE when modal opens
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    hasInitialFitRef.current = false;

    const map = L.map(mapContainerRef.current, {
      center: userCoords || DEFAULT_OVERVIEW_CENTER,
      zoom: userCoords ? 14 : 11,
      zoomControl: true,
    });
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    const timeout = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timeout);
      resizeObserver.disconnect();
      markersLayerRef.current = null;
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [isOpen]);

  // 2. Update markers in-place without destroying the map or resetting user pan/zoom
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!isOpen || !map || !markersLayer) return;

    markersLayer.clearLayers();

    const storePoints: [number, number][] = [];
    storeMap.forEach((s) => storePoints.push([s.lat, s.lng]));

    if (userCoords) {
      L.circle(userCoords, {
        radius: 500,
        color: "#3B82F6",
        fillColor: "#60A5FA",
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: "4, 6",
      })
        .addTo(markersLayer)
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
        .addTo(markersLayer)
        .bindPopup("<b>Posisi GPS Anda</b><br>Lokasi perangkat saat ini");
    }

    storeMap.forEach((storeData, sId) => {
      const hasSurplus = storeData.items.length > 0;
      const storeIcon = L.divIcon({
        className: "custom-store-marker",
        html: `
          <div style="background-color: ${hasSurplus ? "#059669" : "#57534E"}; color: white; padding: 4px 8px; border-radius: 12px; font-weight: bold; font-size: 11px; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.25); border: 2px solid white; cursor: pointer; white-space: nowrap;">
            <span>${storeData.storeName.slice(0, 14)}${storeData.storeName.length > 14 ? "…" : ""}:</span>
            <span>${storeData.items.length} Surplus</span>
          </div>
        `,
        iconSize: [130, 28],
        iconAnchor: [65, 14],
      });

      const marker = L.marker([storeData.lat, storeData.lng], { icon: storeIcon }).addTo(markersLayer);
      marker.on("click", () => {
        setSelectedStoreId(sId);
      });
    });

    // Only auto-position the camera once when store/GPS data first arrives
    if (!hasInitialFitRef.current && (userCoords || storePoints.length > 0)) {
      hasInitialFitRef.current = true;
      if (userCoords) {
        map.setView(userCoords, 14);
      } else if (storePoints.length === 1) {
        map.setView(storePoints[0], 14);
      } else if (storePoints.length > 1) {
        map.fitBounds(L.latLngBounds(storePoints), { padding: [48, 48], maxZoom: 15 });
      }
    }
  }, [isOpen, storeMap, userCoords]);

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
              <h2 className="font-bold text-sm">Peta Gerai Makanan Surplus</h2>
              <p className="text-[11px] text-emerald-100">
                {storeMap.size} gerai terpin di peta · OpenStreetMap Explorer
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {storeMap.size > 0 && (
              <button
                type="button"
                onClick={fitAllPinnedStores}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Lihat Semua ({storeMap.size})</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-emerald-600 transition text-emerald-100 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Map Viewport Container */}
        <div className="flex-1 relative">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Quick instructions & floating legend */}
          <div className="absolute top-3 left-3 right-3 z-[400] pointer-events-none space-y-1">
            <div className="bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-xl shadow-md border border-stone-200 text-center space-y-0.5">
              <div className="text-[10px] font-bold text-stone-800 flex items-center justify-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                <span>Radius Jalan Kaki 500m (± 5 Menit)</span>
              </div>
              <div className="text-[10px] text-stone-600 flex items-center justify-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                <span>Pin Hijau: Gerai Surplus (Klik pin untuk detail & navigasi)</span>
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
                <p className="text-[10px] text-stone-500">
                  {activeStoreData.locationBadge}
                  {userCoords && (
                    <>
                      {" · "}
                      {(() => {
                        const distM = haversineMeters(
                          activeStoreData.lat,
                          activeStoreData.lng,
                          userCoords[0],
                          userCoords[1]
                        );
                        return distM < 1000 ? `${distM}m dari Anda` : `${(distM / 1000).toFixed(1)}km dari Anda`;
                      })()}
                    </>
                  )}
                </p>
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
              <span>Buka Petunjuk Arah di Google Maps</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {activeStoreData.items.length === 0 ? (
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-[11px] text-stone-600 text-center">
                Belum ada hidangan surplus aktif di gerai ini saat ini.
              </div>
            ) : (
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
            )}
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
