import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, ChartColumn, Flame, Map as MapIcon, Radio, Users } from "lucide-react";
import { useNow } from "../hooks";

const links = [
  { to: "/", label: "Mapa operacional", hint: "Visão da cidade em tempo real", icon: MapIcon, end: true },
  { to: "/indicadores", label: "Indicadores", hint: "Disponibilidade e regiões", icon: ChartColumn },
  { to: "/equipamentos", label: "Equipamentos", hint: "Inventário completo", icon: Radio },
  { to: "/agentes", label: "Agentes", hint: "Trânsito, GM e PM", icon: Users },
];

export function Layout() {
  const now = new Date(useNow(1000));
  const { pathname } = useLocation();
  const fullBleed = pathname === "/";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Flame size={17} strokeWidth={2} />
          </span>
          <div>
            <span className="brand-name">F.O.G.O.</span>
            <span className="brand-sub">Central de operações</span>
          </div>
        </div>

        <nav>
          {links.map(({ to, label, hint, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-link" title={hint}>
              <Icon size={17} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="clock">{now.toLocaleTimeString("pt-BR")}</span>
          <span>{now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</span>
          <a className="metrics-link" href="/metrics" target="_blank" rel="noreferrer">
            <Activity size={13} /> /metrics
          </a>
        </div>
      </aside>

      <main className={fullBleed ? "content content-full" : "content"}>
        <Outlet />
      </main>
    </div>
  );
}
