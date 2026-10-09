import { describe, expect, it } from "vitest";
import { addMonths, daysInMonth, todayIn } from "../dates";
import {
  monthlyEquivalent,
  occurrences,
  pendingOccurrences,
  periodKey,
  priceAt,
  subscriptionOccurrences,
  type Subscription,
} from "../recurrence";

const claude: Subscription = {
  id: "sub-claude",
  name: "Claude",
  rule: { frequency: "monthly", interval: 1, startDate: "2026-01-31" },
  prices: [{ effectiveFrom: "2026-01-01", amount: 11000 }],
  status: "active",
};

describe("[6] recorrências sem duplicação", () => {
  it("rodar a geração duas vezes não duplica cobranças", () => {
    const first = pendingOccurrences(claude, "2026-01-01", "2026-06-30", new Set());
    expect(first).toHaveLength(6);
    const persisted = new Set(first.map((o) => o.periodKey));
    const second = pendingOccurrences(claude, "2026-01-01", "2026-06-30", persisted);
    expect(second).toEqual([]);
  });

  it("mudar o dia de cobrança no meio do mês não cria segunda cobrança no mesmo período", () => {
    const persisted = new Set(pendingOccurrences(claude, "2026-01-01", "2026-03-31", new Set()).map((o) => o.periodKey));
    const moved: Subscription = { ...claude, rule: { ...claude.rule, startDate: "2026-03-05" } };
    const next = pendingOccurrences(moved, "2026-03-01", "2026-05-31", persisted);
    expect(next.map((o) => o.date)).toEqual(["2026-04-05", "2026-05-05"]);
  });

  it("intervalos sobrepostos de geração não duplicam", () => {
    const a = pendingOccurrences(claude, "2026-01-01", "2026-04-30", new Set());
    const b = pendingOccurrences(claude, "2026-03-01", "2026-06-30", new Set(a.map((o) => o.periodKey)));
    const all = [...a, ...b].map((o) => o.periodKey);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("regras de recorrência", () => {
  it("mensal ancorada no dia 31 não deriva (31/01 → 28/02 → 31/03 → 30/04)", () => {
    expect(occurrences(claude.rule, "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("ano bissexto: 29/02/2028", () => {
    expect(occurrences({ frequency: "monthly", interval: 1, startDate: "2028-01-30" }, "2028-02-01", "2028-02-29")).toEqual(["2028-02-29"]);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
  it("semanal, anual e personalizada (a cada 15 dias, trimestral)", () => {
    expect(occurrences({ frequency: "weekly", interval: 1, startDate: "2026-10-05" }, "2026-10-01", "2026-10-31")).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(occurrences({ frequency: "yearly", interval: 1, startDate: "2024-02-29" }, "2025-01-01", "2028-12-31")).toEqual(["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
    expect(occurrences({ frequency: "daily", interval: 15, startDate: "2026-10-01" }, "2026-10-01", "2026-11-15")).toEqual(["2026-10-01", "2026-10-16", "2026-10-31", "2026-11-15"]);
    expect(occurrences({ frequency: "monthly", interval: 3, startDate: "2026-01-10" }, "2026-01-01", "2026-12-31")).toEqual(["2026-01-10", "2026-04-10", "2026-07-10", "2026-10-10"]);
  });
  it("respeita data final e número de ocorrências", () => {
    expect(occurrences({ frequency: "monthly", interval: 1, startDate: "2026-01-10", count: 2 }, "2026-01-01", "2026-12-31")).toHaveLength(2);
    expect(occurrences({ frequency: "monthly", interval: 1, startDate: "2026-01-10", endDate: "2026-03-09" }, "2026-01-01", "2026-12-31")).toHaveLength(2);
  });
  it("chave de período semanal é a segunda-feira", () => {
    expect(periodKey({ frequency: "weekly", interval: 1, startDate: "2026-10-08" }, "2026-10-08")).toBe("W2026-10-05");
  });
  it("addMonths atravessa o ano", () => {
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("assinaturas", () => {
  it("mudança de valor vale a partir da data efetiva", () => {
    const s: Subscription = { ...claude, prices: [...claude.prices, { effectiveFrom: "2026-04-01", amount: 12500 }] };
    expect(subscriptionOccurrences(s, "2026-01-01", "2026-05-31").map((o) => o.amount)).toEqual([11000, 11000, 11000, 12500, 12500]);
    expect(priceAt(s, "2026-03-31")).toBe(11000);
  });
  it("pausa e cancelamento interrompem cobranças", () => {
    const paused: Subscription = { ...claude, status: "paused", pausedFrom: "2026-03-01", pausedUntil: "2026-04-30" };
    expect(subscriptionOccurrences(paused, "2026-01-01", "2026-06-30").map((o) => o.date)).toEqual(["2026-01-31", "2026-02-28", "2026-05-31", "2026-06-30"]);
    const cancelled: Subscription = { ...claude, status: "cancelled", cancelledAt: "2026-03-15" };
    expect(subscriptionOccurrences(cancelled, "2026-01-01", "2026-12-31")).toHaveLength(2);
  });
  it("valor mensal equivalente", () => {
    expect(monthlyEquivalent(11000, { frequency: "monthly", interval: 1 })).toBe(11000);
    expect(monthlyEquivalent(119880, { frequency: "yearly", interval: 1 })).toBe(9990);
    expect(monthlyEquivalent(1000, { frequency: "weekly", interval: 1 })).toBe(4333); // 52/12 semanas
    expect(monthlyEquivalent(30000, { frequency: "monthly", interval: 3 })).toBe(10000);
  });
});

describe("fuso horário", () => {
  it("'hoje' em São Paulo difere de UTC perto da meia-noite", () => {
    const utcAlmostMidnight = new Date("2026-10-09T01:30:00Z"); // 22:30 de 08/10 em SP
    expect(todayIn("America/Sao_Paulo", utcAlmostMidnight)).toBe("2026-10-08");
    expect(todayIn("UTC", utcAlmostMidnight)).toBe("2026-10-09");
  });
});
