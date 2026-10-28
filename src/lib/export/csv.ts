/** CSV de lançamentos para abrir no Excel/Google Planilhas (UTF-8 com BOM, separador ";"). */

type Row = Record<string, unknown>;

/** Evita "injeção de fórmula": células que começam com = + - @ viram texto. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const brl = (cents: unknown) => {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  const str = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
  return n < 0 ? `-${str}` : str;
};

export interface ExportShape {
  accounts?: Row[];
  cards?: Row[];
  categories?: Row[];
  entries?: Row[];
}

export function entriesToCsv(data: ExportShape): string {
  const name = (list: Row[] | undefined, id: unknown) => (list ?? []).find((x) => x.id === id)?.name ?? "";
  const catPath = (id: unknown) => {
    const c = (data.categories ?? []).find((x) => x.id === id);
    if (!c) return "";
    const parent = c.parent_id ? name(data.categories, c.parent_id) : "";
    return parent ? `${parent} > ${c.name}` : String(c.name);
  };
  const header = ["Data", "Tipo", "Situação", "Valor (R$)", "Descrição", "Conta", "Categoria", "Cartão", "Fatura", "Observações"];
  const rows = (data.entries ?? [])
    .filter((e) => !e.deleted_at)
    .sort((a, b) => String(b.occurred_on).localeCompare(String(a.occurred_on)))
    .map((e) => [
      e.occurred_on, e.kind, e.status, brl(e.amount_cents), e.description,
      name(data.accounts, e.account_id), catPath(e.category_id), name(data.cards, e.card_id), e.invoice_ref, e.notes,
    ]);
  return "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
