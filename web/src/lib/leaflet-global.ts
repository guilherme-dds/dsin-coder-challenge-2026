import L from "leaflet";

// Plugins "clássicos" do Leaflet (ex.: leaflet.heat) procuram o `L` no escopo global.
// Este módulo precisa ser importado antes deles.
(window as unknown as { L: typeof L }).L = L;
