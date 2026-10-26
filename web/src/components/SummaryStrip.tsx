import { Shape } from "./Badges";
import type { IndicatorShape } from "../labels";

export interface SummaryItem {
  key: string;
  label: string;
  /** Número já formatado quando for decimal (ex.: "1,9"). */
  count: number | string;
  color?: string;
  shape?: IndicatorShape;
}

interface Props {
  items: SummaryItem[];
  /** Item selecionado; vazio quando nenhum filtro rápido está ativo. */
  active?: string;
  onSelect?: (key: string) => void;
  label: string;
}

/**
 * Faixa de contagens no topo de uma lista. Cada célula é também um filtro rápido:
 * clicar filtra a lista, clicar de novo desfaz.
 */
export function SummaryStrip({ items, active, onSelect, label }: Props) {
  return (
    <div className="summary-strip" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.key}
          className={`summary-cell ${active === item.key ? "on" : ""}`}
          onClick={() => onSelect?.(active === item.key ? "" : item.key)}
          aria-pressed={active === item.key}
          disabled={!onSelect}
        >
          <span className="summary-label">
            {item.color && <Shape color={item.color} shape={item.shape} />} {item.label}
          </span>
          <strong>{item.count}</strong>
        </button>
      ))}
    </div>
  );
}
