import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consumptionFor, type ConsumptionSummary } from "@/domain/consumption";
import { spendingLines } from "@/domain/ledger";
import { loadDashboardInput, type Profile } from "./finance";
import { monthRange, type EntryFilters } from "./ledger";

/**
 * Consumo do período filtrado, pela MESMA função do gráfico de categorias (`spendingLines`)
 * e a mesma regra de categoria dos Lançamentos. Só existe quando o filtro é de consumo:
 * sem conta, sem busca por texto e tipo "todos" ou "despesas".
 */
export async function loadConsumption(supabase: SupabaseClient, profile: Profile, f: EntryFilters): Promise<ConsumptionSummary | null> {
  if (f.accountId || f.q || (f.kind && f.kind !== "expense")) return null;
  const input = await loadDashboardInput(supabase, profile, "month");
  const range = f.month ? monthRange(f.month) : { from: "0001-01-01", to: "9999-12-31" };
  const charges = input.base.cards.flatMap((c) => c.charges);
  const lines = spendingLines(input.base.entries, charges, range.from, range.to);
  return consumptionFor(lines, input.categories, { categoryId: f.categoryId, onlyParent: f.onlyParent });
}
