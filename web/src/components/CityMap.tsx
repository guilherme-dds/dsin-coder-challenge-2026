import { useEffect, useMemo, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { TypeIcon } from "./TypeIcon";
import { HeatLayer } from "./HeatLayer";
import type { FailurePoint } from "../types";

export const DEFAULT_CENTER: [number, number] = [-22.2139, -49.9458]; // Marília/SP

export interface MapMarker {
  id: string;
  kind: "equipment" | "agent";
  latitude: number;
  longitude: number;
  /** Código do tipo de equipamento ou da função do agente (define o ícone). */
  icon: string;
  /** Cor do estado (hex: o Leaflet não resolve variáveis CSS). */
  color: string;
  pulse?: boolean;
  title: string;
  subtitle?: string;
  caption?: string;
}

interface Props {
  markers: MapMarker[];
  height?: number | string;
  center?: [number, number];
  zoom?: number;
  heat?: FailurePoint[];
  selectedId?: string | null;
  focus?: [number, number] | null;
  picking?: boolean;
  onMarkerClick?: (marker: MapMarker) => void;
  onMapClick?: (lat: number, lng: number) => void;
  children?: ReactNode;
}

// Os ícones são HTML estático; o cache evita recriar o mesmo pino a cada render.
const iconCache = new Map<string, L.DivIcon>();

function pinIcon(marker: MapMarker, selected: boolean) {
  const key = `${marker.kind}|${marker.icon}|${marker.color}|${marker.pulse}|${selected}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const classes = ["map-pin", `map-pin-${marker.kind}`, marker.pulse && "pulse", selected && "selected"].filter(Boolean).join(" ");
    icon = L.divIcon({
      className: "",
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      html: `<div class="${classes}" style="--pin-color:${marker.color}">${renderToStaticMarkup(<TypeIcon code={marker.icon} size={16} />)}</div>`,
    });
    iconCache.set(key, icon);
  }
  return icon;
}

function ClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function FlyTo({ focus }: { focus: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(focus, Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [map, focus]);
  return null;
}

export function CityMap({
  markers,
  height = 480,
  center = DEFAULT_CENTER,
  zoom = 13,
  heat,
  selectedId,
  focus,
  picking,
  onMarkerClick,
  onMapClick,
  children,
}: Props) {
  // Agentes ficam acima dos equipamentos para não serem encobertos.
  const ordered = useMemo(() => [...markers].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "agent" ? 1 : -1)), [markers]);

  return (
    <div className={`map-frame ${picking ? "picking" : ""}`} style={{ height }}>
      <MapContainer center={center} zoom={zoom} style={{ height: "100%" }} scrollWheelZoom zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="bottomright" />
        {heat && heat.length > 0 && <HeatLayer points={heat} />}
        {onMapClick && <ClickHandler onMapClick={onMapClick} />}
        {focus && <FlyTo focus={focus} />}
        {ordered.map((m) => (
          <Marker
            key={`${m.kind}-${m.id}`}
            position={[m.latitude, m.longitude]}
            icon={pinIcon(m, m.id === selectedId)}
            zIndexOffset={m.id === selectedId ? 1000 : m.kind === "agent" ? 500 : 0}
            eventHandlers={onMarkerClick ? { click: () => onMarkerClick(m) } : undefined}
          >
            <Tooltip direction="top" offset={[0, -18]}>
              <strong>{m.title}</strong>
              {m.subtitle && <div>{m.subtitle}</div>}
              {m.caption && <div style={{ color: m.color, marginTop: 4 }}>● {m.caption}</div>}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
      {children}
    </div>
  );
}
