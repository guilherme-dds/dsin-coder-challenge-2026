import { useEffect } from "react";
import { useMap } from "react-leaflet";
import "../lib/leaflet-global";
import L from "leaflet";
import "leaflet.heat";
import type { FailurePoint } from "../types";

/** Camada de calor com a concentração de falhas (histórico + falhas ativas). */
export function HeatLayer({ points }: { points: FailurePoint[] }) {
  const map = useMap();

  useEffect(() => {
    const maxWeight = Math.max(...points.map((p) => p.weight), 1);
    const layer = L.heatLayer(
      points.map((p) => [p.latitude, p.longitude, p.weight / maxWeight] as L.HeatLatLngTuple),
      {
        radius: 55,
        blur: 40,
        maxZoom: 15,
        minOpacity: 0.25,
        gradient: { 0.2: "#2b6cff", 0.45: "#ffd23f", 0.7: "#ff9f1c", 1: "#ff3d54" },
      },
    ).addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, points]);

  return null;
}
