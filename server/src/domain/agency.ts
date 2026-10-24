/** Órgãos responsáveis pela operação dos equipamentos. */
export const AGENCIES = ["TRANSITO", "GUARDA_MUNICIPAL", "POLICIA_MILITAR", "CONCESSIONARIA"] as const;

export type Agency = (typeof AGENCIES)[number];
