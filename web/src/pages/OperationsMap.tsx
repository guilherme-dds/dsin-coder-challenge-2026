import { useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarClock,
  Crosshair,
  ExternalLink,
  Flame,
  Layers,
  ListFilter,
  MapPin,
  Pencil,
  RotateCcw,
  Search,
  Users,
  X,
} from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import {
  EVENT_LABELS,
  MAINTENANCE_LABELS,
  ROLE_LABELS,
  SHIFT_LABELS,
  STATUS_LABELS,
  URGENCY,
  formatDate,
  initials,
  maintenanceDue,
} from "../labels";
import { CityMap, type MapMarker } from "../components/CityMap";
import { StatusBadge, UrgencyBadge } from "../components/Badges";
import { TypeIcon } from "../components/TypeIcon";
import { formatAttribute } from "../components/DynamicFields";
import type { Agent, EquipmentStatus, UrgencyLevel } from "../types";

const ROLE_HEX: Record<Agent["role"], string> = {
  AGENTE_TRANSITO: "#ff6a2b",
  GUARDA_MUNICIPAL: "#4d9fff",
  POLICIAL_MILITAR: "#b9c1d6",
};

type Selection = { kind: "equipment" | "agent"; id: string } | null;

export function OperationsMap() {
  const navigate = useNavigate();
  const { data, error, reload } = useAsync(api.operationsMap);

  // Filtros
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("");
  const [status, setStatus] = useState<EquipmentStatus | "">("");
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [urgencies, setUrgencies] = useState<Set<UrgencyLevel>>(new Set());

  // Camadas
  const [showEquipments, setShowEquipments] = useState(true);
  const [showAgents, setShowAgents] = useState(true);
  const [showHeat, setShowHeat] = useState(false);

  const [selection, setSelection] = useState<Selection>(null);
  const [picking, setPicking] = useState(false);
  const [focus, setFocus] = useState<[number, number] | null>(null);

  const equipments = data?.equipments ?? [];
  const agents = data?.agents ?? [];

  const typeOptions = useMemo(() => {
    const map = new Map<string, string>();
    equipments.forEach((e) => map.set(e.type.code, e.type.name));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [equipments]);

  const districts = useMemo(() => [...new Set(equipments.map((e) => e.district))].sort(), [equipments]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return equipments.filter(
      (e) =>
        (!district || e.district === district) &&
        (!status || e.status === status) &&
        (types.size === 0 || types.has(e.type.code)) &&
        (urgencies.size === 0 || urgencies.has(e.urgency)) &&
        (!term || [e.serialNumber, e.brand, e.model, e.street, e.reference, e.type.name].some((v) => v.toLowerCase().includes(term))),
    );
  }, [equipments, q, district, status, types, urgencies]);

  const visibleAgents = agents.filter((a) => !district || a.district === district);

  const markers: MapMarker[] = [
    ...(showEquipments
      ? filtered.map((e) => ({
          id: e.id,
          kind: "equipment" as const,
          latitude: e.latitude,
          longitude: e.longitude,
          icon: e.type.code,
          color: URGENCY[e.urgency].hex,
          pulse: e.urgency === "CRITICO",
          title: `${e.type.name} · ${e.serialNumber}`,
          subtitle: `${e.street}, ${e.reference}`,
          caption: URGENCY[e.urgency].label,
        }))
      : []),
    ...(showAgents
      ? visibleAgents.map((a) => ({
          id: a.id,
          kind: "agent" as const,
          latitude: a.latitude!,
          longitude: a.longitude!,
          icon: a.role,
          color: ROLE_HEX[a.role],
          title: a.name,
          subtitle: `${ROLE_LABELS[a.role]} · ${a.baseName}`,
          caption: a.active ? "Em serviço" : "Fora de serviço",
        }))
      : []),
  ];

  const counts = filtered.reduce<Partial<Record<UrgencyLevel, number>>>((acc, e) => {
    acc[e.urgency] = (acc[e.urgency] ?? 0) + 1;
    return acc;
  }, {});

  const hasFilters = q || district || status || types.size > 0 || urgencies.size > 0;
  const clearFilters = () => {
    setQ("");
    setDistrict("");
    setStatus("");
    setTypes(new Set());
    setUrgencies(new Set());
  };

  const toggle = <T,>(set: Set<T>, value: T, update: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    update(next);
  };

  const select = (marker: MapMarker) => {
    setSelection({ kind: marker.kind, id: marker.id });
    setFocus([marker.latitude, marker.longitude]);
  };

  return (
    <div className={showHeat ? "ops heat-on" : "ops"}>
      {error && <p className="error ops-error">{error}</p>}
      <CityMap
        height="100%"
        // Centro deslocado para oeste: o painel de filtros cobre o lado esquerdo do mapa.
        center={[-22.2175, -49.9625]}
        zoom={14}
        markers={markers}
        heat={showHeat ? data?.failures : undefined}
        selectedId={selection?.id}
        focus={focus}
        picking={picking}
        onMarkerClick={select}
        onMapClick={(lat, lng) => {
          if (picking) navigate(`/equipamentos/novo?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`);
        }}
      >
        {/* Barra superior: título, indicadores e ação de cadastro */}
        <header className="ops-topbar">
          <div>
            <div className="eyebrow">
              <span className="pulse-dot" style={{ "--dot-color": "var(--ember)" } as CSSProperties} /> Ao vivo · Marília/SP
            </div>
            <h1>Mapa operacional</h1>
          </div>
          <div className="ops-kpis">
            <div className="kpi">
              <small>No mapa</small>
              <strong>{filtered.length}</strong>
            </div>
            <div className="kpi">
              <small>Críticos</small>
              <strong style={{ color: "var(--state-red)" }}>{counts.CRITICO ?? 0}</strong>
            </div>
            <div className="kpi">
              <small>Alertas</small>
              <strong style={{ color: "var(--state-orange)" }}>{counts.ALERTA ?? 0}</strong>
            </div>
            <div className="kpi">
              <small>Agentes em serviço</small>
              <strong>{visibleAgents.filter((a) => a.active).length}</strong>
            </div>
          </div>
          <button className={`button ${picking ? "" : "primary"}`} onClick={() => setPicking((p) => !p)}>
            {picking ? (
              <>
                <X size={16} /> Cancelar
              </>
            ) : (
              <>
                <Crosshair size={16} /> Cadastrar no mapa
              </>
            )}
          </button>
        </header>

        {picking && (
          <div className="ops-hint">
            <Crosshair size={16} /> Clique no local de instalação do novo equipamento
          </div>
        )}

        {/* Painel de filtros e camadas */}
        <aside className="ops-panel ops-filters">
          <div className="panel-title">
            <ListFilter size={16} /> Filtros
            {hasFilters && (
              <button className="link-button" onClick={clearFilters}>
                <RotateCcw size={13} /> limpar
              </button>
            )}
          </div>

          <div className="search">
            <Search size={16} />
            <input placeholder="Série, rua, referência…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <div className="filter-selects">
            <select value={district} onChange={(e) => setDistrict(e.target.value)}>
              <option value="">Todos os bairros</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as EquipmentStatus | "")}>
              <option value="">Toda situação</option>
              {(Object.keys(STATUS_LABELS) as EquipmentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <p className="section-label">Urgência</p>
          <div className="chips">
            {(Object.keys(URGENCY) as UrgencyLevel[]).map((level) => (
              <button
                key={level}
                className={`chip-toggle ${urgencies.has(level) ? "on" : ""}`}
                style={{ "--chip-color": URGENCY[level].color } as CSSProperties}
                onClick={() => toggle(urgencies, level, setUrgencies)}
              >
                <span className="dot" /> {URGENCY[level].label}
                <b>{equipments.filter((e) => e.urgency === level).length}</b>
              </button>
            ))}
          </div>

          <p className="section-label">Tipo</p>
          <div className="type-grid">
            {typeOptions.map(([code, name]) => (
              <button
                key={code}
                title={name}
                className={`type-toggle ${types.has(code) ? "on" : ""}`}
                onClick={() => toggle(types, code, setTypes)}
              >
                <TypeIcon code={code} size={18} />
                <span>{name.split(" (")[0]}</span>
              </button>
            ))}
          </div>

          <p className="section-label">
            <Layers size={12} /> Camadas
          </p>
          <div className="layers">
            <label className="switch">
              <input type="checkbox" checked={showEquipments} onChange={(e) => setShowEquipments(e.target.checked)} />
              <span className="track" /> <MapPin size={15} /> Equipamentos
            </label>
            <label className="switch">
              <input type="checkbox" checked={showAgents} onChange={(e) => setShowAgents(e.target.checked)} />
              <span className="track" /> <Users size={15} /> Agentes
            </label>
            <label className="switch">
              <input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} />
              <span className="track" /> <Flame size={15} /> Calor de falhas
            </label>
          </div>
          {showHeat && (
            <div className="heat-scale">
              <span>menos falhas</span>
              <i />
              <span>mais falhas</span>
            </div>
          )}
        </aside>

        {selection?.kind === "equipment" && (
          <EquipmentDrawer
            id={selection.id}
            onClose={() => setSelection(null)}
            onChanged={reload}
          />
        )}
        {selection?.kind === "agent" && (
          <AgentDrawer agent={agents.find((a) => a.id === selection.id)} onClose={() => setSelection(null)} />
        )}

        {/* Legenda */}
        <div className="ops-legend">
          {(Object.keys(URGENCY) as UrgencyLevel[]).map((level) => (
            <span key={level}>
              <i style={{ background: URGENCY[level].color }} /> {URGENCY[level].label}
            </span>
          ))}
          <span>
            <i className="agent-swatch" /> Agente
          </span>
        </div>
      </CityMap>
    </div>
  );
}

function EquipmentDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data: eq, reload } = useAsync(() => api.equipment(id), [id]);
  const [nextStatus, setNextStatus] = useState<EquipmentStatus | "">("");
  const [actionError, setActionError] = useState<string | null>(null);

  if (!eq) {
    return (
      <aside className="ops-panel ops-drawer">
        <div className="loading">
          <span className="pulse-dot" /> Carregando ficha…
        </div>
      </aside>
    );
  }

  const changeStatus = async () => {
    try {
      await api.changeStatus(eq.id, { status: nextStatus as EquipmentStatus, note: "Alterado pelo mapa operacional" });
      setNextStatus("");
      setActionError(null);
      reload();
      onChanged();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  return (
    <aside className="ops-panel ops-drawer" style={{ "--accent-color": URGENCY[eq.urgency].color } as CSSProperties}>
      <button className="close" onClick={onClose} aria-label="Fechar">
        <X size={18} />
      </button>
      <div className="drawer-head">
        <span className="icon-tile lg">
          <TypeIcon code={eq.type.code} size={26} />
        </span>
        <div>
          <div className="eyebrow">{eq.type.name}</div>
          <h2>
            {eq.brand} {eq.model}
          </h2>
          <span className="chip">#{eq.serialNumber}</span>
        </div>
      </div>

      <div className="row">
        <UrgencyBadge level={eq.urgency} />
        <StatusBadge status={eq.status} />
      </div>

      <div className="address">
        <MapPin size={16} />
        <div>
          <strong>
            {eq.street}, {eq.reference}
          </strong>
          <div className="muted">
            {eq.district} · CEP {eq.zipCode}
          </div>
        </div>
      </div>

      <dl className="details compact">
        {eq.type.attributesSchema.slice(0, 4).map((field) => (
          <div key={field.key}>
            <dt>{field.label}</dt>
            <dd>{formatAttribute(field, eq.attributes[field.key])}</dd>
          </div>
        ))}
        <div>
          <dt>Manutenção</dt>
          <dd>{MAINTENANCE_LABELS[eq.maintenanceType]}</dd>
        </div>
        <div>
          <dt>Próxima</dt>
          <dd>
            {formatDate(eq.nextMaintenanceAt)} <span className="muted">{maintenanceDue(eq.nextMaintenanceAt)}</span>
          </dd>
        </div>
      </dl>

      {eq.allowedTransitions.length > 0 && (
        <div className="quick-action">
          <p className="section-label">Ação rápida</p>
          {actionError && <p className="error">{actionError}</p>}
          <div className="input-with-button">
            <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value as EquipmentStatus)}>
              <option value="">Alterar situação…</option>
              {eq.allowedTransitions.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button className="button primary" disabled={!nextStatus} onClick={changeStatus}>
              Aplicar
            </button>
          </div>
        </div>
      )}

      {eq.events[0] && (
        <p className="muted last-event">
          <CalendarClock size={13} /> Último registro: {eq.events[0].note ?? EVENT_LABELS[eq.events[0].kind]} ·{" "}
          {new Date(eq.events[0].createdAt).toLocaleDateString("pt-BR")}
        </p>
      )}

      <div className="drawer-actions">
        <Link to={`/equipamentos/${eq.id}`} className="button primary">
          <ExternalLink size={15} /> Ficha completa
        </Link>
        <Link to={`/equipamentos/${eq.id}/editar`} className="button">
          <Pencil size={15} /> Editar
        </Link>
      </div>
    </aside>
  );
}

function AgentDrawer({ agent, onClose }: { agent?: Agent; onClose: () => void }) {
  if (!agent) return null;
  return (
    <aside className="ops-panel ops-drawer" style={{ "--accent-color": ROLE_HEX[agent.role] } as CSSProperties}>
      <button className="close" onClick={onClose} aria-label="Fechar">
        <X size={18} />
      </button>
      <div className="drawer-head">
        <span className="avatar lg" style={{ "--avatar-bg": ROLE_HEX[agent.role] } as CSSProperties}>
          {initials(agent.name)}
        </span>
        <div>
          <div className="eyebrow">{ROLE_LABELS[agent.role]}</div>
          <h2>{agent.name}</h2>
          <span className="chip">
            {agent.registration}
            {agent.rank && ` · ${agent.rank}`}
          </span>
        </div>
      </div>

      <div className="row">
        <span className="status-badge">
          <span
            className="pulse-dot"
            style={{ "--dot-color": agent.active ? "var(--state-green)" : "var(--state-gray)", marginRight: 6 } as CSSProperties}
          />
          {agent.active ? "Em serviço" : "Fora de serviço"}
        </span>
        {agent.shift && <span className="status-badge">Turno: {SHIFT_LABELS[agent.shift]}</span>}
      </div>

      <dl className="details compact">
        <div>
          <dt>Base</dt>
          <dd>{agent.baseName}</dd>
        </div>
        <div>
          <dt>Bairro</dt>
          <dd>{agent.district}</dd>
        </div>
        <div>
          <dt>Recursos sob responsabilidade</dt>
          <dd>{agent._count?.responsibleFor ?? 0}</dd>
        </div>
        <div>
          <dt>Contato</dt>
          <dd>{agent.phone ?? "—"}</dd>
        </div>
      </dl>

      <div className="drawer-actions">
        <Link to={`/agentes/${agent.id}/editar`} className="button">
          <Pencil size={15} /> Editar agente
        </Link>
      </div>
    </aside>
  );
}
