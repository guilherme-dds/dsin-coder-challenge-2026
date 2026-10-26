import type { ReactNode } from "react";

/** Cabeçalho de seção de formulário ou ficha: título e, opcionalmente, ações à direita. */
export function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card-header">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
