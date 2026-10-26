import { useState, type CSSProperties } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Map as MapIcon } from "lucide-react";
import { useAsync } from "../hooks";
import { timeAgo } from "../labels";
import { Shape } from "../components/Badges";
import { SummaryStrip } from "../components/SummaryStrip";
import { TypeIcon } from "../components/TypeIcon";
import {
  FAILURE_COLORS,
  RISK_COLORS,
  RISK_LABELS,
  predictionsApi,
  type FailuresResponse,
  type PredictionAbout,
  type RegionForecast,
  type RiskLevel,
  type StaffingResponse,
  type StaffingStatus,
  type TrendsResponse,
} from "../predictions";

type Tab = "risco" | "manutencao" | "tendencias";

const TABS: { key: Tab; label: string }[] = [
  { key: "risco", label: "Risco e reforço" },
  { key: "manutencao", label: "Manutenção preditiva" },
  { key: "tendencias", label: "Tendências" },
];

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const LEVELS: RiskLevel[] = ["BAIXO", "MODERADO", "ALTO"];
const REFRESH_MS = 60_000;
/** Falhas, anomalias e tendências mudam devagar: atualizar a cada 5 min basta. */
const SLOW_REFRESH_MS = 5 * 60_000;

const STAFFING: Record<
  StaffingStatus,
  { label: string; color: string; shape: "triangle" | "circle" }
> = {
  REFORCAR: { label: "Reforçar", color: "var(--high)", shape: "triangle" },
  ADEQUADO: { label: "Adequado", color: "var(--normal)", shape: "circle" },
  FOLGA: { label: "Folga", color: "var(--low)", shape: "circle" },
};

const pct = (value: number) => `${Math.round(value * 100)}%`;
const decimal = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function Predictions() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("aba") as Tab) ?? "risco";
  const setTab = (next: Tab) => setParams({ aba: next }, { replace: true });

  const risk = useAsync(() => predictionsApi.risk(24), [], {
    refreshMs: REFRESH_MS,
  });
  const staffing = useAsync(() => predictionsApi.staffing(24), [], {
    refreshMs: REFRESH_MS,
  });
  const failures = useAsync(() => predictionsApi.failures(7, 15), [], {
    refreshMs: SLOW_REFRESH_MS,
  });
  const anomalies = useAsync(predictionsApi.anomalies, [], {
    refreshMs: SLOW_REFRESH_MS,
  });
  const trends = useAsync(predictionsApi.trends, [], {
    refreshMs: SLOW_REFRESH_MS,
  });

  const worsening =
    (trends.data?.availability.filter(
      (t) => t.significant && t.slopePerDay < 0 && t.scope.id,
    ).length ?? 0) +
    (trends.data?.occurrences.filter(
      (t) => t.significant && t.changePerWeekPct > 0,
    ).length ?? 0);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Previsões</h1>
          <p>
            O que deve acontecer nas próximas horas e dias, a partir de{" "}
            {risk.data?.basedOn.occurrences ?? "…"} ocorrências das últimas{" "}
            {risk.data?.basedOn.weeks ?? 12} semanas e da telemetria dos
            equipamentos
            {risk.updatedAt &&
              ` · atualizado ${timeAgo(risk.updatedAt.toISOString())}`}
            .
          </p>
        </div>
        <Link to="/" className="button">
          <MapIcon size={15} /> Ver no mapa
        </Link>
      </header>

      <SummaryStrip
        label="Resumo das previsões"
        active=""
        onSelect={(key) => key && setTab(key.split(":")[0] as Tab)}
        items={[
          {
            key: "risco:alto",
            label: "Regiões com risco alto em 24 h",
            count:
              risk.data?.regions.filter((r) => r.peak.level === "ALTO")
                .length ?? 0,
            color: "var(--high)",
            shape: "triangle",
          },
          {
            key: "risco:reforco",
            label: `Agentes a reforçar · ${staffing.data?.windows[0]?.label.toLowerCase() ?? "turno atual"}`,
            count: staffing.data?.windows[0]?.reinforcement ?? 0,
          },
          {
            key: "manutencao:falhas",
            label: "Falhas esperadas em 7 dias",
            count: decimal(failures.data?.expectedFailures ?? 0),
          },
          {
            key: "manutencao:anomalias",
            label: "Equipamentos fora do padrão",
            count: anomalies.data?.anomalies.length ?? 0,
          },
          { key: "tendencias", label: "Tendências de piora", count: worsening },
        ]}
      />

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "on" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {[
        risk.error,
        staffing.error,
        failures.error,
        anomalies.error,
        trends.error,
      ]
        .filter(Boolean)
        .slice(0, 1)
        .map((e) => (
          <p key={e} className="error">
            {e}
          </p>
        ))}

      {tab === "risco" && (
        <RiskTab
          regions={risk.data?.regions}
          about={risk.data?.about}
          staffing={staffing.data ?? undefined}
        />
      )}
      {tab === "manutencao" && (
        <MaintenanceTab
          failures={failures.data ?? undefined}
          anomalies={anomalies.data ?? undefined}
        />
      )}
      {tab === "tendencias" && <TrendsTab trends={trends.data ?? undefined} />}
    </>
  );
}

/** "Como esta previsão funciona": o que prevê, com quais dados, como calcula e como ajuda. */
function HowItWorks({ about }: { about?: PredictionAbout }) {
  if (!about) return null;
  return (
    <details className="disclosure how">
      <summary>Como esta previsão funciona</summary>
      <dl className="how-list">
        <dt>O que prevê</dt>
        <dd>{about.predicts}</dd>
        <dt>Dados considerados</dt>
        <dd>
          <ul>
            {about.inputs.map((input) => (
              <li key={input}>{input}</li>
            ))}
          </ul>
        </dd>
        <dt>Como calcula</dt>
        <dd>{about.method}</dd>
        <dt>Como ajuda</dt>
        <dd>{about.use}</dd>
      </dl>
    </details>
  );
}

function RiskLegend() {
  return (
    <div className="row muted risk-legend">
      {LEVELS.map((level) => (
        <span key={level} className="indicator">
          <i
            className="risk-swatch"
            style={{ "--cell-color": RISK_COLORS[level] } as CSSProperties}
          />{" "}
          {RISK_LABELS[level]}
        </span>
      ))}
    </div>
  );
}

function RiskTab({
  regions,
  about,
  staffing,
}: {
  regions?: RegionForecast[];
  about?: PredictionAbout;
  staffing?: StaffingResponse;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [heatRegion, setHeatRegion] = useState("");
  const heatmap = useAsync(
    () => predictionsApi.heatmap(heatRegion || undefined),
    [heatRegion],
    { refreshMs: SLOW_REFRESH_MS },
  );
  const current =
    regions?.find((r) => r.region.id === selected) ?? regions?.[0];
  // A intensidade vai do menor ao maior valor do próprio mapa: a cidade inteira soma todas as regiões
  // e ficaria saturada se comparada com o índice de uma região só.
  const expected =
    heatmap.data?.cells.flat().map((c) => c.expectedOccurrences) ?? [];
  const [low, high] = [Math.min(...expected), Math.max(...expected)];
  const intensity = (value: number) =>
    high > low ? (value - low) / (high - low) : 0;

  return (
    <div className="predict-grid">
      <section className="card span-2">
        <div className="card-header">
          <h2>Risco por região nas próximas 24 h</h2>
          <RiskLegend />
        </div>
        {!regions ? (
          <div className="loading">Calculando…</div>
        ) : (
          <div
            className="risk-grid"
            role="table"
            aria-label="Risco por região e hora"
          >
            <div className="risk-row risk-head" role="row">
              <span />
              {regions[0].hours.map((h, i) => (
                <span key={h.at} className="risk-hour">
                  {i % 3 === 0 ? `${h.hour}h` : ""}
                </span>
              ))}
            </div>
            {regions.map((r) => (
              <button
                key={r.region.id}
                role="row"
                className={`risk-row ${current?.region.id === r.region.id ? "on" : ""}`}
                onClick={() => setSelected(r.region.id)}
              >
                <span className="risk-name">
                  {r.region.name}
                  <small>agora {r.now.riskIndex}</small>
                </span>
                {r.hours.map((h) => (
                  <i
                    key={h.at}
                    className="risk-cell"
                    style={
                      { "--cell-color": RISK_COLORS[h.level] } as CSSProperties
                    }
                    title={`${h.hour}h · índice ${h.riskIndex} (${RISK_LABELS[h.level].toLowerCase()}) · ${decimal(h.expectedOccurrences)} ocorrência(s) esperada(s)${
                      h.topKinds.length
                        ? ` · ${h.topKinds.map((k) => k.label.toLowerCase()).join(", ")}`
                        : ""
                    }`}
                  />
                ))}
              </button>
            ))}
          </div>
        )}

        {current && (
          <div className="region-detail">
            <div>
              <h3>{current.region.name}</h3>
              <p className="muted">
                Pico às {current.peak.hour}h: índice {current.peak.riskIndex},{" "}
                {pct(current.peak.probability)} de chance de ao menos uma
                ocorrência (
                {current.peak.topKinds
                  .map((k) => k.label.toLowerCase())
                  .join(", ") || "sem tipo predominante"}
                ).
              </p>
            </div>
            <ul className="plain factor-list">
              {current.factors.map((f) => (
                <li key={f.label}>
                  <strong>{f.label}</strong>
                  <span>{f.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <HowItWorks about={about} />
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Semana típica</h2>
          <select
            className="compact-select"
            value={heatRegion}
            onChange={(e) => setHeatRegion(e.target.value)}
            aria-label="Região do mapa de calor"
          >
            <option value="">Cidade inteira</option>
            {regions?.map((r) => (
              <option key={r.region.id} value={r.region.id}>
                {r.region.name}
              </option>
            ))}
          </select>
        </div>
        <p className="muted card-sub">
          Dias e horários com maior risco de ocorrências.
        </p>
        {heatmap.data && (
          <div
            className="week-heatmap"
            role="table"
            aria-label="Risco por dia da semana e hora"
          >
            {heatmap.data.cells.map((row, weekday) => (
              <div key={weekday} className="week-row" role="row">
                <span className="week-day">{WEEKDAYS[weekday]}</span>
                {row.map((cell) => (
                  <i
                    key={cell.hour}
                    className="week-cell"
                    style={
                      {
                        "--intensity": `${Math.round(4 + 86 * intensity(cell.expectedOccurrences))}%`,
                      } as CSSProperties
                    }
                    title={`${WEEKDAYS[weekday]} ${cell.hour}h · índice ${cell.riskIndex} · ${decimal(cell.expectedOccurrences)} ocorrência(s) esperada(s)`}
                  />
                ))}
              </div>
            ))}
            <div className="week-row week-hours">
              <span />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h}>{h % 6 === 0 ? `${h}h` : ""}</span>
              ))}
            </div>
          </div>
        )}
        <div className="scale-legend muted">
          <span>menor risco</span>
          <i />
          <span>maior risco</span>
        </div>
        <HowItWorks about={heatmap.data?.about} />
      </section>

      <StaffingCard staffing={staffing} />
    </div>
  );
}

function StaffingCard({ staffing }: { staffing?: StaffingResponse }) {
  const [windowIndex, setWindowIndex] = useState(0);
  const shift = staffing?.windows[windowIndex];
  return (
    <section className="card">
      <div className="card-header">
        <h2>Reforço por turno</h2>
        {shift && shift.reinforcement > 0 && (
          <span className="chip">+{shift.reinforcement} agente(s)</span>
        )}
      </div>
      <div className="chips">
        {staffing?.windows.map((w, i) => (
          <button
            key={w.start}
            className={`chip-toggle ${i === windowIndex ? "on" : ""}`}
            onClick={() => setWindowIndex(i)}
          >
            {w.label}
            <b>
              {new Date(w.start).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </b>
          </button>
        ))}
      </div>
      {shift && (
        <ul className="plain staffing-list">
          {shift.regions.map((r) => (
            <li key={r.region.id}>
              <div className="staffing-top">
                <span className="indicator">
                  <Shape
                    color={STAFFING[r.status].color}
                    shape={STAFFING[r.status].shape}
                  />{" "}
                  {r.region.name}
                </span>
                <span
                  className="mono muted"
                  title="Agentes necessários / escalados no turno"
                >
                  {r.needed} / {r.available}
                </span>
              </div>
              {r.status !== "ADEQUADO" && (
                <span className="muted">{r.suggestion}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="muted card-sub">
        Necessários / escalados, no pico do turno.
      </p>
      <HowItWorks about={staffing?.about} />
    </section>
  );
}

function MaintenanceTab({
  failures,
  anomalies,
}: {
  failures?: FailuresResponse;
  anomalies?: Awaited<ReturnType<typeof predictionsApi.anomalies>>;
}) {
  const navigate = useNavigate();
  const days = failures?.days ?? 7;
  return (
    <div className="predict-grid">
      <section className="card span-2 table-card">
        <div className="card-header padded">
          <h2>Chance de falha nos próximos {days} dias</h2>
          {failures && (
            <span className="chip">
              ~{decimal(failures.expectedFailures)} falha(s) esperada(s) na rede
            </span>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Equipamento</th>
              <th>Chance</th>
              <th>Principal motivo</th>
              <th>Ação recomendada</th>
            </tr>
          </thead>
          <tbody>
            {failures?.predictions.map((p) => (
              <tr
                key={p.equipment.id}
                className="clickable"
                onClick={() => navigate(`/equipamentos/${p.equipment.id}`)}
              >
                <td>
                  <div className="cell-main">
                    <span className="icon-tile">
                      <TypeIcon code={p.equipment.type.code} size={16} />
                    </span>
                    <div>
                      <strong>{p.equipment.type.name}</strong>
                      <span className="mono">
                        {p.equipment.serialNumber} · {p.equipment.district}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <div
                    className="prob"
                    title={`${pct(p.probability)} de chance de falhar em ${days} dias`}
                  >
                    <span className="mono">{pct(p.probability)}</span>
                    <i className="prob-bar">
                      <i
                        style={{
                          width: pct(p.probability),
                          background: FAILURE_COLORS[p.level],
                        }}
                      />
                    </i>
                  </div>
                </td>
                <td
                  className="cell-place"
                  title={p.factors
                    .map((f) => `×${f.multiplier} ${f.label}: ${f.detail}`)
                    .join("\n")}
                >
                  <span>{p.factors[0]?.label ?? "Taxa base do tipo"}</span>
                  <span className="muted">
                    {p.factors[0]?.detail ?? "Sem fatores agravantes."}
                  </span>
                </td>
                <td>{p.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="padded">
          <HowItWorks about={failures?.about} />
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Fora do padrão</h2>
          <span className="chip">{anomalies?.anomalies.length ?? 0}</span>
        </div>
        {anomalies?.anomalies.length === 0 && (
          <div className="empty-state compact">
            Nenhum equipamento fora do padrão.
          </div>
        )}
        <ul className="plain anomaly-list">
          {anomalies?.anomalies.map((a) => (
            <li key={`${a.equipment.id}-${a.metric}`}>
              <Link to={`/equipamentos/${a.equipment.id}`}>
                {a.equipment.type.name} #{a.equipment.serialNumber}
              </Link>
              <span>
                {a.metricLabel.charAt(0).toUpperCase() + a.metricLabel.slice(1)}{" "}
                <strong className="mono">
                  {a.changePct > 0 ? "+" : ""}
                  {a.changePct}%
                </strong>{" "}
                <span className="muted">
                  ({decimal(a.recent)} contra {decimal(a.baseline)} normal, há{" "}
                  {a.anomalousDays} dias)
                </span>
              </span>
              <span className="muted">{a.interpretation}</span>
            </li>
          ))}
        </ul>
        <HowItWorks about={anomalies?.about} />
      </section>
    </div>
  );
}

function TrendsTab({ trends }: { trends?: TrendsResponse }) {
  if (!trends) return <div className="loading">Calculando…</div>;
  const availability = trends.availability.filter((t) => t.scope.id !== null);
  const moving = availability.filter((t) => t.significant);
  const stable = availability.filter((t) => !t.significant);
  const maxWeekly = Math.max(1, ...trends.occurrences.flatMap((t) => t.weekly));

  return (
    <div className="predict-grid">
      <section className="card">
        <div className="card-header">
          <h2>Disponibilidade · próximos 7 dias</h2>
        </div>
        {moving.length === 0 && (
          <div className="empty-state compact">
            Nenhuma região com tendência relevante.
          </div>
        )}
        <ul className="plain trend-list">
          {moving.map((t) => (
            <li key={t.scope.code}>
              <div className="trend-top">
                <span className="indicator">
                  <Shape
                    color={t.slopePerDay < 0 ? "var(--high)" : "var(--normal)"}
                    shape={t.slopePerDay < 0 ? "triangle" : "circle"}
                  />
                  {t.scope.name}
                </span>
                <span className="mono">
                  {decimal(t.current)}% → {decimal(t.projected)}%
                </span>
              </div>
              <span className="muted">{t.summary}</span>
            </li>
          ))}
        </ul>
        {stable.length > 0 && (
          <p className="muted card-sub">
            Estáveis:{" "}
            {stable
              .map((t) => `${t.scope.name} (${decimal(t.current)}%)`)
              .join(", ")}
            .
          </p>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Ocorrências por semana</h2>
        </div>
        <ul className="plain trend-list">
          {trends.occurrences.map((t) => (
            <li key={t.region.id}>
              <div className="trend-top">
                <span className="indicator">
                  {t.significant && t.changePerWeekPct > 0 && (
                    <Shape color="var(--high)" shape="triangle" />
                  )}
                  {t.region.name}
                </span>
                <span
                  className="weekly-bars"
                  title={`Últimas 12 semanas: ${t.weekly.join(", ")}`}
                >
                  {t.weekly.map((n, i) => (
                    <i
                      key={i}
                      style={{ height: `${(n / maxWeekly) * 100}%` }}
                    />
                  ))}
                </span>
              </div>
              {t.significant && <span className="muted">{t.summary}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Uso dos equipamentos</h2>
        </div>
        {trends.utilization.length === 0 && (
          <div className="empty-state compact">
            Uso estável em todos os equipamentos.
          </div>
        )}
        <ul className="plain trend-list">
          {trends.utilization.map((t) => (
            <li key={`${t.equipment.id}-${t.metric}`}>
              <div className="trend-top">
                <Link to={`/equipamentos/${t.equipment.id}`}>
                  {t.equipment.type.name} #{t.equipment.serialNumber}
                </Link>
                <span className="mono">
                  {t.changePct > 0 ? "+" : ""}
                  {t.changePct}%
                </span>
              </div>
              <span className="muted">{t.summary}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card span-3">
        <HowItWorks about={trends.about} />
      </section>
    </div>
  );
}
