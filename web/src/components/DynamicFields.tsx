import type { AttributeField } from "../types";

interface Props {
  fields: AttributeField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

/** Renderiza os campos específicos do tipo de equipamento a partir da sua definição. */
export function DynamicFields({ fields, values, onChange }: Props) {
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  if (!fields.length) return <p className="muted">Este tipo não possui características específicas.</p>;

  return (
    <div className="grid-3">
      {fields.map((field) => {
        const label = `${field.label}${field.unit ? ` (${field.unit})` : ""}${field.required ? " *" : ""}`;
        const value = values[field.key];

        if (field.type === "boolean") {
          return (
            <label key={field.key} className="checkbox">
              <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(field.key, e.target.checked)} />
              {label}
            </label>
          );
        }

        return (
          <label key={field.key} className="field">
            <span>{label}</span>
            {field.type === "select" ? (
              <select value={(value as string) ?? ""} onChange={(e) => set(field.key, e.target.value || null)}>
                <option value="">Selecione…</option>
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === "number" ? "number" : "text"}
                value={(value as string | number) ?? ""}
                onChange={(e) =>
                  set(field.key, field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)
                }
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

export function formatAttribute(field: AttributeField, value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "boolean") return value ? "Sim" : "Não";
  if (field.type === "select") return String(value).replaceAll("_", " ");
  return `${value}${field.unit ? ` ${field.unit}` : ""}`;
}
