import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, ChartColumn, Flame, Map as MapIcon, Radio, Users } from "lucide-react";

const links = [
  { to: "/", label: "Mapa operacional", hint: "Visão da cidade em tempo real", icon: MapIcon, end: true },
  { to: "/indicadores", label: "Indicadores", hint: "Disponibilidade da rede", icon: ChartColumn },
  { to: "/equipamentos", label: "Equipamentos", hint: "Inventário completo", icon: Radio },
  { to: "/agentes", label: "Agentes", hint: "Trânsito, GM e PM", icon: Users },
];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function Layout() {
  const now = useClock();
  const { pathname } = useLocation();
  const fullBleed = pathname === "/";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Flame size={22} strokeWidth={2.2} />
          </span>
          <div>
            <span className="brand-name">F.O.G.O.</span>
            <span className="brand-sub">Central de operações urbanas</span>
          </div>
        </div>

        <div>
          <div className="nav-label">Operação</div>
          <nav>
            {links.map(({ to, label, hint, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className="nav-link">
                <Icon size={19} strokeWidth={1.8} />
                <span>
                  {label}
                  <small>{hint}</small>
                </span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="status-panel">
          <div className="status-line">
            <span className="pulse-dot" /> Telemetria conectada
          </div>
          <div className="clock">{now.toLocaleTimeString("pt-BR")}</div>
          <div className="muted">{now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</div>
          <a className="metrics-link" href="/metrics" target="_blank" rel="noreferrer">
            <Activity size={13} /> /metrics · PROMETHEUS
          </a>
        </div>
      </aside>

      {/* A key reinicia a animação de entrada a cada troca de página */}
      <main className={fullBleed ? "content content-full" : "content"} key={pathname}>
        <Outlet />
      </main>
    </div>
  );
}
