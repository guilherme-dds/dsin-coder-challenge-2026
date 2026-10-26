import { useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { TypeIcon } from "./TypeIcon";
import { HeatLayer } from "./HeatLayer";
import type { FailurePoint } from "../types";

export const DEFAULT_CENTER: [number, number] = [-22.2139, -49.9458]; // Marília/SP

export interface MapZone {
  id: string;
  latitude: number;
  longitude: number;
  /** Raio em metros. */
  radius: number;
  /** Cor em hex (o Leaflet não resolve variáveis CSS). */
  color: string;
  label: string;
}

export interface MapMarker {
  id: string;
  kind: "equipment" | "agent";
  latitude: number;
  longitude: number;
  /** Código do tipo de equipamento ou da função do agente (define o ícone). */
  icon: string;
  /** Cor do estado (hex: o Leaflet não resolve variáveis CSS). */
  color: string;
  /** Sem comunicação (equipamento) ou sem sinal (agente): ganha uma marca no canto do pino. */
  silent?: boolean;
  /** Fora de atividade (ex.: agente em pausa): pino esmaecido. */
  dimmed?: boolean;
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
  /** Áreas destacadas sob os pinos (ex.: risco previsto por região). */
  zones?: MapZone[];
  selectedId?: string | null;
  /** Ponto para onde o mapa voa; o terceiro valor, opcional, fixa o zoom (ex.: enquadrar uma região). */
  focus?: [number, number] | [number, number, number] | null;
  picking?: boolean;
  onMarkerClick?: (marker: MapMarker) => void;
  onMapClick?: (lat: number, lng: number) => void;
  children?: ReactNode;
}

// Os ícones são HTML estático; o cache evita recriar o mesmo pino a cada render.
const iconCache = new Map<string, L.DivIcon>();

function pinIcon(marker: MapMarker, selected: boolean) {
  const key = `${marker.kind}|${marker.icon}|${marker.color}|${marker.silent}|${marker.dimmed}|${selected}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const classes = ["map-pin", `map-pin-${marker.kind}`, marker.dimmed && "dimmed", selected && "selected"].filter(Boolean).join(" ");
    const flag = marker.silent ? `<span class="pin-flag" title="Sem comunicação"></span>` : "";
    icon = L.divIcon({
      className: "",
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      html: `<div class="${classes}" style="--pin-color:${marker.color}">${renderToStaticMarkup(<TypeIcon code={marker.icon} size={14} />)}${flag}</div>`,
    });
    iconCache.set(key, icon);
  }
  return icon;
}

function ClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** O mapa fica entre painéis que abrem e fecham: o Leaflet precisa saber quando o espaço muda. */
function FitContainer() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function FlyTo({ focus }: { focus: [number, number] | [number, number, number] }) {
  const map = useMap();
  useEffect(() => {
    const [lat, lng, zoom] = focus;
    map.flyTo([lat, lng], zoom ?? Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [map, focus]);
  return null;
}

export function CityMap({
  markers,
  height = 480,
  center = DEFAULT_CENTER,
  zoom = 13,
  heat,
  zones,
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
        <FitContainer />
        {heat && heat.length > 0 && <HeatLayer points={heat} />}
        {zones?.map((z) => (
          <Circle
            key={z.id}
            center={[z.latitude, z.longitude]}
            radius={z.radius}
            pathOptions={{ color: z.color, weight: 1.5, fillColor: z.color, fillOpacity: 0.18 }}
          >
            <Tooltip direction="center">{z.label}</Tooltip>
          </Circle>
        ))}
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
              {m.caption && (
                <div className="indicator" style={{ marginTop: 4 }}>
                  <span className="shape shape-circle" style={{ "--shape-color": m.color } as CSSProperties} /> {m.caption}
                </div>
              )}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
      {children}
    </div>
  );
}
