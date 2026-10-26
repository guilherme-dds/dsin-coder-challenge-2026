import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  BellRing,
  CalendarClock,
  Crosshair,
  ExternalLink,
  Flame,
  Layers,
  ListFilter,
  MapPin,
  Palette,
  Pencil,
  RotateCcw,
  Search,
  Users,
  X,
} from "lucide-react";
import { api } from "../api";
import { useAsync, useNow } from "../hooks";
import {
  AGENCY_LABELS,
  CONNECTIVITY,
  EVENT_LABELS,
  FIELD_STATUS,
  MAINTENANCE_LABELS,
  METRIC_LABELS,
  ROLE_LABELS,
  SHIFT_LABELS,
  STATUS_COLORS,
  STATUS_HEX,
  STATUS_LABELS,
  URGENCY,
  formatDate,
  initials,
  maintenanceDue,
  timeAgo,
} from "../labels";
import { CityMap, type MapMarker } from "../components/CityMap";
import { AlertsPanel } from "../components/AlertsPanel";
import { ConnectivityBadge, FieldStatusBadge, StatusBadge, UrgencyBadge } from "../components/Badges";
import { TypeIcon } from "../components/TypeIcon";
import { formatAttribute } from "../components/DynamicFields";
import type { Agency, Agent, Alert, Connectivity, EquipmentStatus, UrgencyLevel } from "../types";

/** A Central acompanha a cidade ao vivo: mapa e alertas se atualizam sozinhos neste intervalo. */
const REFRESH_MS = 10_000;
/** Sem posição há mais que isso, o agente é tratado como sem sinal (mesma janela da API). */
const AGENT_SILENT_MS = 10 * 60 * 1000;

const ROLE_HEX: Record<Agent["role"], string> = {
  AGENTE_TRANSITO: "#ff6a2b",
  GUARDA_MUNICIPAL: "#4d9fff",
  POLICIAL_MILITAR: "#b9c1d6",
};

/** Órgão de cada função, para o filtro por órgão valer também para os agentes. */
const ROLE_AGENCY: Record<Agent["role"], Agency> = {
  AGENTE_TRANSITO: "TRANSITO",
  GUARDA_MUNICIPAL: "GUARDA_MUNICIPAL",
  POLICIAL_MILITAR: "POLICIA_MILITAR",
};

const IN_ACTIVITY: Agent["fieldStatus"][] = ["DISPONIVEL", "EM_ATENDIMENTO", "EM_DESLOCAMENTO"];

type ColorMode = "urgency" | "status";
type Selection = { kind: "equipment" | "agent"; id: string } | null;

const agentSilent = (a: Agent, now: number) =>
  a.fieldStatus === "SEM_SINAL" || !a.lastPositionAt || now - new Date(a.lastPositionAt).getTime() > AGENT_SILENT_MS;

export function OperationsMap() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const now = useNow(1000);
  const { data, error, updatedAt, reload } = useAsync(api.operationsMap, [], { refreshMs: REFRESH_MS });
  const alertsQuery = useAsync(api.alerts, [], { refreshMs: REFRESH_MS });

  // Filtros
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("");
  // Vindo do card de região dos indicadores (?regiao=CODIGO), o mapa já abre filtrado.
  const [region, setRegion] = useState(() => searchParams.get("regiao") ?? "");
  const [agency, setAgency] = useState<Agency | "">("");
  const [status, setStatus] = useState<EquipmentStatus | "">("");
  const [connectivity, setConnectivity] = useState<Connectivity | "">("");
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [urgencies, setUrgencies] = useState<Set<UrgencyLevel>>(new Set());

  // Camadas e aparência
  const [showEquipments, setShowEquipments] = useState(true);
  const [showAgents, setShowAgents] = useState(true);
  const [showHeat, setShowHeat] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>("urgency");
  const [showAlerts, setShowAlerts] = useState(true);

  const [selection, setSelection] = useState<Selection>(null);
  const [picking, setPicking] = useState(false);
  const [focus, setFocus] = useState<[number, number] | [number, number, number] | null>(null);

  const equipments = data?.equipments ?? [];
  const agents = data?.agents ?? [];
  const regions = data?.regions ?? [];
  const alerts = alertsQuery.data ?? [];

  const typeOptions = useMemo(() => {
    const map = new Map<string, string>();
    equipments.forEach((e) => map.set(e.type.code, e.type.name));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [equipments]);

  // Com uma região escolhida, só os bairros dela aparecem no seletor de bairro.
  const districts = useMemo(
    () => [...new Set(equipments.filter((e) => !region || e.regionCode === region).map((e) => e.district))].sort(),
    [equipments, region],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return equipments.filter(
      (e) =>
        (!district || e.district === district) &&
        (!region || e.regionCode === region) &&
        (!agency || e.agency === agency) &&
        (!status || e.status === status) &&
        (!connectivity || e.connectivity === connectivity) &&
        (types.size === 0 || types.has(e.type.code)) &&
        (urgencies.size === 0 || urgencies.has(e.urgency)) &&
        (!term || [e.serialNumber, e.brand, e.model, e.street, e.reference, e.type.name].some((v) => v.toLowerCase().includes(term))),
    );
  }, [equipments, q, district, region, agency, status, connectivity, types, urgencies]);

  const visibleAgents = agents.filter(
    (a) =>
      (!district || a.district === district) &&
      (!region || a.regionCode === region) &&
      (!agency || ROLE_AGENCY[a.role] === agency),
  );

  const equipmentColor = (e: (typeof equipments)[number]) =>
    colorMode === "status" ? STATUS_HEX[e.status] : URGENCY[e.urgency].hex;

  const markers: MapMarker[] = [
    ...(showEquipments
      ? filtered.map((e) => ({
          id: e.id,
          kind: "equipment" as const,
          latitude: e.latitude,
          longitude: e.longitude,
          icon: e.type.code,
          color: equipmentColor(e),
          pulse: e.urgency === "CRITICO",
          silent: e.connectivity === "OFFLINE",
          title: `${e.type.name} · ${e.serialNumber}`,
          subtitle: `${e.street}, ${e.reference}`,
          caption:
            (colorMode === "status" ? STATUS_LABELS[e.status] : URGENCY[e.urgency].label) +
            (e.connectivity === "OFFLINE" ? " · sem comunicação" : ""),
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
          silent: agentSilent(a, now),
          dimmed: !a.active || a.fieldStatus === "EM_PAUSA",
          title: a.name,
          subtitle: `${ROLE_LABELS[a.role]} · ${a.baseName}`,
          caption: a.active ? `${FIELD_STATUS[a.fieldStatus].label} · posição ${timeAgo(a.lastPositionAt, now)}` : "Fora de serviço",
        }))
      : []),
  ];

  const counts = filtered.reduce<Partial<Record<UrgencyLevel, number>>>((acc, e) => {
    acc[e.urgency] = (acc[e.urgency] ?? 0) + 1;
    return acc;
  }, {});
  const offlineCount = filtered.filter((e) => e.connectivity === "OFFLINE").length;
  const activeAgents = visibleAgents.filter((a) => a.active && IN_ACTIVITY.includes(a.fieldStatus) && !agentSilent(a, now)).length;
  const urgentAlerts = alerts.filter((a) => a.severity === "CRITICA" || a.severity === "ALTA");
  const unacknowledgedCritical = alerts.some((a) => a.severity === "CRITICA" && a.status === "ABERTO");

  const hasFilters =
    q || district || region || agency || status || connectivity || types.size > 0 || urgencies.size > 0;
  const clearFilters = () => {
    setQ("");
    setDistrict("");
    setRegion("");
    setAgency("");
    setStatus("");
    setConnectivity("");
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

  // Do alerta para o mapa: equipamento e agente abrem a ficha; região vira filtro.
  const selectAlert = (alert: Alert) => {
    if (alert.equipment) {
      setSelection({ kind: "equipment", id: alert.equipment.id });
      setFocus([alert.equipment.latitude, alert.equipment.longitude]);
    } else if (alert.agent) {
      setSelection({ kind: "agent", id: alert.agent.id });
      if (alert.agent.latitude !== null && alert.agent.longitude !== null) {
        setFocus([alert.agent.latitude, alert.agent.longitude]);
      }
    } else if (alert.region) {
      chooseRegion(alert.region.code);
    }
  };

  // Escolher uma região filtra o mapa e enquadra o centro dos equipamentos dela.
  const chooseRegion = (code: string) => {
    setRegion(code);
    setDistrict("");
    const points = equipments.filter((e) => e.regionCode === code);
    if (!code || points.length === 0) return;
    const lat = points.reduce((sum, e) => sum + e.latitude, 0) / points.length;
    const lng = points.reduce((sum, e) => sum + e.longitude, 0) / points.length;
    setFocus([lat, lng, 14]);
  };

  // Enquadra a região da URL assim que os pontos chegam (uma vez só).
  const framedFromUrl = useRef(false);
  useEffect(() => {
    if (framedFromUrl.current || !data || !searchParams.get("regiao")) return;
    framedFromUrl.current = true;
    chooseRegion(searchParams.get("regiao")!);
  }, [data]);

  const acknowledge = async (alert: Alert) => {
    await api.acknowledgeAlert(alert.id);
    alertsQuery.reload();
  };

  const refreshAll = () => {
    reload();
    alertsQuery.reload();
  };

  const legend =
    colorMode === "status"
      ? (Object.keys(STATUS_LABELS) as EquipmentStatus[]).map((s) => ({ key: s, label: STATUS_LABELS[s], color: STATUS_COLORS[s] }))
      : (Object.keys(URGENCY) as UrgencyLevel[]).map((l) => ({ key: l, label: URGENCY[l].label, color: URGENCY[l].color }));

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
        {/* Barra superior: título, indicadores e ações */}
        <header className="ops-topbar">
          <div>
            <div className="eyebrow" title={updatedAt ? `Atualizado às ${updatedAt.toLocaleTimeString("pt-BR")}` : undefined}>
              <span
                className="pulse-dot"
                style={{ "--dot-color": error ? "var(--state-red)" : "var(--ember)" } as CSSProperties}
              />{" "}
              {error ? "Sem conexão com a API" : `Ao vivo · atualizado ${timeAgo(updatedAt?.toISOString() ?? null, now)}`}
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
              <small>Sem comunicação</small>
              <strong style={{ color: offlineCount ? "var(--state-red)" : undefined }}>{offlineCount}</strong>
            </div>
            <div className="kpi">
              <small>Agentes em atividade</small>
              <strong>{activeAgents}</strong>
            </div>
          </div>
          <button
            className={`button alerts-toggle ${unacknowledgedCritical ? "alarm" : ""}`}
            onClick={() => setShowAlerts((s) => !s)}
            title="Alertas graves (críticos e altos) não resolvidos"
          >
            <BellRing size={16} /> Alertas <b>{urgentAlerts.length}</b>
          </button>
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
            <select value={region} onChange={(e) => chooseRegion(e.target.value)}>
              <option value="">Todas as regiões</option>
              {regions.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
            <select value={district} onChange={(e) => setDistrict(e.target.value)}>
              <option value="">Todos os bairros</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select value={agency} onChange={(e) => setAgency(e.target.value as Agency | "")}>
              <option value="">Todos os órgãos</option>
              {(Object.keys(AGENCY_LABELS) as Agency[]).map((a) => (
                <option key={a} value={a}>
                  {AGENCY_LABELS[a]}
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
            <select value={connectivity} onChange={(e) => setConnectivity(e.target.value as Connectivity | "")}>
              <option value="">Toda comunicação</option>
              {(Object.keys(CONNECTIVITY) as Connectivity[]).map((c) => (
                <option key={c} value={c}>
                  {CONNECTIVITY[c].label}
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
            <Palette size={12} /> Cor dos equipamentos
          </p>
          <div className="segmented">
            <button className={colorMode === "urgency" ? "on" : ""} onClick={() => setColorMode("urgency")}>
              Urgência
            </button>
            <button className={colorMode === "status" ? "on" : ""} onClick={() => setColorMode("status")}>
              Situação
            </button>
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
          <EquipmentDrawer id={selection.id} onClose={() => setSelection(null)} onChanged={refreshAll} />
        )}
        {selection?.kind === "agent" && (
          <AgentDrawer agent={agents.find((a) => a.id === selection.id)} now={now} onClose={() => setSelection(null)} />
        )}
        {!selection && showAlerts && (
          <AlertsPanel alerts={alerts} onSelect={selectAlert} onAcknowledge={acknowledge} onClose={() => setShowAlerts(false)} />
        )}

        {/* Legenda */}
        <div className="ops-legend">
          {legend.map((item) => (
            <span key={item.key}>
              <i style={{ background: item.color }} /> {item.label}
            </span>
          ))}
          <span>
            <i className="silent-swatch" /> Sem comunicação
          </span>
          <span>
            <i className="agent-swatch" /> Agente
          </span>
        </div>
      </CityMap>
    </div>
  );
}

function EquipmentDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const now = useNow(5000);
  const { data: eq, reload } = useAsync(() => api.equipment(id), [id], { refreshMs: REFRESH_MS });
  const telemetry = useAsync(() => api.telemetry(id, 1), [id], { refreshMs: REFRESH_MS });
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

  const reading = telemetry.data?.[0];

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
        <ConnectivityBadge connectivity={eq.connectivity} />
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
        <div>
          <dt>Órgão responsável</dt>
          <dd>{AGENCY_LABELS[eq.agency]}</dd>
        </div>
        <div>
          <dt>Último contato</dt>
          <dd>{eq.lastSeenAt ? timeAgo(eq.lastSeenAt, now) : "—"}</dd>
        </div>
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

      {reading && (
        <div>
          <p className="section-label">Telemetria · {timeAgo(reading.receivedAt, now)}</p>
          <dl className="details compact">
            {Object.entries(reading.metrics).map(([metric, value]) => (
              <div key={metric}>
                <dt>{METRIC_LABELS[metric] ?? metric}</dt>
                <dd className="mono">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

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

function AgentDrawer({ agent, now, onClose }: { agent?: Agent; now: number; onClose: () => void }) {
  if (!agent) return null;
  const silent = agentSilent(agent, now);
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
        {agent.active ? (
          <FieldStatusBadge status={silent ? "SEM_SINAL" : agent.fieldStatus} />
        ) : (
          <span className="status-badge">Fora de serviço</span>
        )}
        {agent.shift && <span className="status-badge">Turno: {SHIFT_LABELS[agent.shift]}</span>}
      </div>

      <dl className="details compact">
        <div>
          <dt>Última posição</dt>
          <dd>{timeAgo(agent.lastPositionAt, now)}</dd>
        </div>
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
