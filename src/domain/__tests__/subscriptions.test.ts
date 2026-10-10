import { describe, expect, it } from "vitest";
import type { Cents } from "../money";
import type { Subscription } from "../recurrence";
import { dueToRecord, frequencyLabel, nextCharge, perLabel, subscriptionTotals, upcoming } from "../subscriptions";

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: "s1",
  name: "Streaming",
  rule: { frequency: "monthly", interval: 1, startDate: "2026-08-15" },
  prices: [{ effectiveFrom: "2026-08-15", amount: 3990 as Cents }],
  status: "active",
  ...over,
});

describe("assinaturas", () => {
  it("rótulos de frequência", () => {
    expect(frequencyLabel("monthly", 1)).toBe("Mensal");
    expect(frequencyLabel("monthly", 3)).toBe("Trimestral");
    expect(frequencyLabel("monthly", 2)).toBe("A cada 2 meses");
    expect(perLabel("yearly", 1)).toBe("/ano");
    expect(perLabel("monthly", 3)).toBe("/3 meses");
  });

  it("próxima cobrança inclui hoje; cancelada não tem próxima", () => {
    expect(nextCharge(sub(), "2026-10-15")?.date).toBe("2026-10-15");
    expect(nextCharge(sub(), "2026-10-16")?.date).toBe("2026-11-15");
    expect(nextCharge(sub({ status: "cancelled", cancelledAt: "2026-10-10" }), "2026-10-10")).toBeNull();
    // pausada sem data de volta: nenhuma cobrança
    expect(nextCharge(sub({ status: "paused", pausedFrom: "2026-10-01" }), "2026-10-10")).toBeNull();
  });

  it("lança só o que venceu, uma vez por período", () => {
    const s = sub();
    expect(dueToRecord(s, null, "2026-10-09", new Set()).map((o) => o.date)).toEqual(["2026-08-15", "2026-09-15"]);
    expect(dueToRecord(s, "2026-09-30", "2026-10-15", new Set()).map((o) => o.date)).toEqual(["2026-10-15"]);
    expect(dueToRecord(s, null, "2026-10-15", new Set(["2026-08", "2026-09"])).map((o) => o.periodKey)).toEqual(["2026-10"]);
    expect(dueToRecord(s, "2026-10-15", "2026-10-15", new Set())).toEqual([]);
  });

  it("pausa avança sem cobrar; projeção só depois de hoje", () => {
    const paused = sub({ status: "paused", pausedFrom: "2026-09-01" });
    expect(dueToRecord(paused, "2026-08-31", "2026-10-20", new Set())).toEqual([]);
    expect(upcoming(sub(), "2026-10-15", "2026-10-15", "2026-12-31", new Set()).map((o) => o.date)).toEqual(["2026-11-15", "2026-12-15"]);
  });

  it("totais: mensal equivalente das ativas e anual", () => {
    const t = subscriptionTotals(
      [
        sub(),
        sub({ id: "a", rule: { frequency: "yearly", interval: 1, startDate: "2026-01-01" }, prices: [{ effectiveFrom: "2026-01-01", amount: 12000 as Cents }] }),
        sub({ id: "p", status: "paused" }),
      ],
      "2026-10-10",
    );
    expect(t).toEqual({ monthly: 3990 + 1000, yearly: (3990 + 1000) * 12, activeCount: 2 });
  });
});
