import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ItemListing, StoreProfile, cleanLocationBadge, resolveImageUrl } from "../types/listing";
import { fetchStores } from "../services/api";
import { X, MapPin, Store, ShoppingBag, ArrowRight, ExternalLink, Maximize2 } from "lucide-react";

interface ConsumerMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  listings: ItemListing[];
  onSelectItem: (item: ItemListing) => void;
  userCoords?: [number, number] | null; // [lat, lng]
}

const DEFAULT_OVERVIEW_CENTER: [number, number] = [-6.3621, 106.8246];

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function filterOutlierPoints(
  points: [number, number][],
  anchor: [number, number] | null
): [number, number][] {
  if (points.length <= 1) return points;
  const refPoint = anchor || DEFAULT_OVERVIEW_CENTER;
  const nearby = points.filter(
    ([lat, lng]) => haversineMeters(lat, lng, refPoint[0], refPoint[1]) <= 100_000
  );
  return nearby.length > 0 ? nearby : points;
}

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

export const ConsumerMapModal: React.FC<ConsumerMapModalProps> = React.memo(({
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
  const lastMarkersSignatureRef = useRef<string>("");
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
    const safePoints = filterOutlierPoints(points, userCoords);
    if (safePoints.length === 1) {
      map.setView(safePoints[0], 14, { animate: true });
    } else if (safePoints.length > 1) {
      map.fitBounds(L.latLngBounds(safePoints), { padding: [48, 48], maxZoom: 15, animate: true });
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
      lastMarkersSignatureRef.current = "";
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [isOpen]);

  // Stable signature so periodic polling does not destroy/recreate identical Leaflet markers
  const markersSignature = useMemo(() => {
    const userSig = userCoords ? `${userCoords[0].toFixed(5)},${userCoords[1].toFixed(5)}` : "none";
    const storeSigs = Array.from(storeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sId, s]) => `${sId}|${s.storeName}|${s.lat.toFixed(5)}|${s.lng.toFixed(5)}|${s.items.length}`)
      .join(";");
    return `${userSig}::${storeSigs}`;
  }, [storeMap, userCoords]);

  // 2. Update markers in-place ONLY when store/GPS signature actually changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!isOpen || !map || !markersLayer) return;

    if (lastMarkersSignatureRef.current === markersSignature) {
      return;
    }
    lastMarkersSignatureRef.current = markersSignature;

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

    const placedCoords: Array<[number, number]> = [];

    storeMap.forEach((storeData, sId) => {
      const hasSurplus = storeData.items.length > 0;

      // Offset slightly if another store shares near-identical coordinates so pins don't stack invisibly
      let lat = storeData.lat;
      let lng = storeData.lng;
      const overlapCount = placedCoords.filter(
        ([pLat, pLng]) => Math.abs(pLat - lat) < 0.00025 && Math.abs(pLng - lng) < 0.00025
      ).length;
      if (overlapCount > 0) {
        const angle = (overlapCount * 2 * Math.PI) / 6;
        const offset = 0.00022;
        lat += Math.sin(angle) * offset;
        lng += Math.cos(angle) * offset;
      }
      placedCoords.push([lat, lng]);

      const pinColor = hasSurplus ? "#059669" : "#64748B";
      const storeIcon = L.divIcon({
        className: "custom-store-marker",
        html: `
          <div style="width:32px;height:40px;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
            <div style="width:30px;height:30px;border-radius:9999px;background:${pinColor};border:2.5px solid #ffffff;box-shadow:0 2px 5px rgba(0,0,0,0.25);color:#ffffff;font-family:'Roboto',sans-serif;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;">
              ${storeData.items.length}
            </div>
            <div style="width:0;height:0;margin-top:-3px;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid ${pinColor};"></div>
          </div>
        `,
        iconSize: [32, 40],
        iconAnchor: [16, 40],
      });

      const marker = L.marker([lat, lng], {
        icon: storeIcon,
        zIndexOffset: hasSurplus ? 500 : 100,
      }).addTo(markersLayer);

      const safeStoreName = escapeHtml(storeData.storeName);
      marker.bindTooltip(
        `<div style="font-family:'Roboto',sans-serif;font-size:12px;font-weight:700;color:#181C2E;padding:2px 4px;">
          ${safeStoreName} <span style="font-weight:600;color:${hasSurplus ? "#059669" : "#64748B"};">· ${storeData.items.length} Surplus</span>
        </div>`,
        {
          direction: "top",
          offset: [0, -38],
          opacity: 1,
        }
      );

      marker.on("click", () => {
        setSelectedStoreId(sId);
      });
    });

    // Only auto-position the camera once when store/GPS data first arrives
    if (!hasInitialFitRef.current && (userCoords || storePoints.length > 0)) {
      hasInitialFitRef.current = true;
      const safeStorePoints = filterOutlierPoints(storePoints, userCoords);
      if (userCoords) {
        map.setView(userCoords, 14);
      } else if (safeStorePoints.length === 1) {
        map.setView(safeStorePoints[0], 14);
      } else if (safeStorePoints.length > 1) {
        map.fitBounds(L.latLngBounds(safeStorePoints), { padding: [48, 48], maxZoom: 15 });
      }
    }
  }, [isOpen, markersSignature, storeMap, userCoords]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
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
            <div className="bg-white/95 px-3.5 py-2 rounded-xl shadow-md border border-stone-200 text-center space-y-1">
              <div className="text-xs font-bold text-stone-800 flex items-center justify-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                <span>Radius Jalan Kaki 500m (± 5 Menit)</span>
              </div>
              <div className="text-xs text-stone-600 flex items-center justify-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
                <span>Pin Angka: Jumlah Surplus (Arahkan kursor untuk nama gerai, klik untuk detail)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Store Bottom Sheet Details */}
        {activeStoreData ? (
          <div className="p-4 bg-white border-t border-slate-100 shadow-lg space-y-3 shrink-0 max-h-80 overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm text-[#181C2E] flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{activeStoreData.storeName}</span>
                </h3>
                <p className="text-xs text-[#646982] mt-0.5">
                  {cleanLocationBadge(activeStoreData.locationBadge)}
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
                className="text-xs font-semibold text-[#646982] hover:text-[#181C2E] underline cursor-pointer shrink-0"
              >
                Tutup Detail
              </button>
            </div>

            {/* Google Maps Directions Button */}
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${activeStoreData.lat},${activeStoreData.lng}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 px-3 rounded-lg bg-[#F0F5FA] hover:bg-slate-200/70 text-[#181C2E] text-xs font-bold transition"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              <span>Buka Petunjuk Arah di Google Maps</span>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
            </a>

            {activeStoreData.items.length === 0 ? (
              <div className="py-4 px-4 bg-white flex flex-col items-center justify-center text-center space-y-2">
                <img
                  src="/assets/empty_store.jpg"
                  alt="Gerai belum memiliki hidangan surplus"
                  className="w-28 h-28 object-contain"
                />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-[#181C2E]">
                    Belum Ada Hidangan Surplus
                  </p>
                  <p className="text-xs text-[#646982] max-w-xs">
                    Stok makanan surplus di gerai ini sedang habis atau belum diterbitkan hari ini.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStoreId(null)}
                  className="text-xs font-bold text-emerald-600 hover:underline pt-0.5 cursor-pointer"
                >
                  Pilih gerai lain di peta
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeStoreData.items.map((item) => {
                  const resolvedImg = resolveImageUrl(item.image_url, item.is_bundle);
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        onClose();
                        onSelectItem(item);
                      }}
                      className="rounded-xl overflow-hidden bg-[#F0F5FA] hover:bg-slate-200/60 transition flex items-stretch min-h-[104px] cursor-pointer"
                    >
                      {/* Food Image (~40% width of card) */}
                      <div className="w-[40%] shrink-0 bg-[#E2E8F0] relative overflow-hidden">
                        {resolvedImg ? (
                          <img
                            src={resolvedImg}
                            alt={item.food_name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#646982]">
                            <ShoppingBag className="w-6 h-6" />
                          </div>
                        )}
                      </div>

                      {/* Details & CTA (~60% width) */}
                      <div className="flex-1 p-3 flex flex-col justify-between gap-2 min-w-0">
                        <div>
                          <span className="font-normal text-[#181C2E] block text-[13px] leading-snug line-clamp-1">
                            {item.food_name}
                          </span>
                          <div className="mt-0.5 flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-emerald-600 font-extrabold text-sm">
                              Rp {item.discounted_price.toLocaleString("id-ID")}
                            </span>
                            <span className="text-xs text-[#A0A5BA] line-through">
                              Rp {item.original_price.toLocaleString("id-ID")}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                            onSelectItem(item);
                          }}
                          className="w-full sm:w-fit flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-xs cursor-pointer"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>Pilih & Pesan</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
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
});
