"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, isValidDate, todayIn } from "@/domain/dates";
import { parseBRL } from "@/domain/money";
import { FREQUENCY_PRESETS } from "@/domain/subscriptions";
import { loadProfile } from "@/lib/data/finance";
import { requireUser } from "@/lib/supabase/server";

export type SubscriptionActionResult = { ok: true; message: string } | { ok: false; error: string; field?: string } | undefined;

const uuidOrNull = z.string().transform((v) => v || null).pipe(z.uuid().nullable());

const schema = z.object({
  id: uuidOrNull,
  name: z.string().trim().min(1, "Dê um nome à assinatura").max(60, "Use até 60 caracteres"),
  amount: z.string().transform((v, ctx) => {
    try {
      const c = parseBRL(v);
      if (c <= 0) throw new Error();
      return c;
    } catch {
      ctx.addIssue({ code: "custom", message: "Informe o valor" });
      return z.NEVER;
    }
  }),
  preset: z.enum(FREQUENCY_PRESETS.map((p) => p.key) as [string, ...string[]], { message: "Escolha a frequência" }),
  next_date: z.string().refine(isValidDate, "Escolha a data"),
  pay: z.string().regex(/^(card|account):[0-9a-f-]{36}$/i, "Escolha como é pago"),
  category_id: uuidOrNull,
});

const ERR = "Não foi possível salvar a assinatura.";

export async function saveSubscription(_: SubscriptionActionResult, form: FormData): Promise<SubscriptionActionResult> {
  const parsed = schema.safeParse(Object.fromEntries(["id", "name", "amount", "preset", "next_date", "pay", "category_id"].map((k) => [k, String(form.get(k) ?? "")])));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }
  const v = parsed.data;
  const preset = FREQUENCY_PRESETS.find((p) => p.key === v.preset)!;
  const [payWith, payId] = v.pay.split(":") as ["card" | "account", string];
  const { supabase } = await requireUser();

  const { data: id, error } = await supabase.rpc("save_subscription", {
    p_id: v.id,
    p_name: v.name,
    p_category: v.category_id,
    p_frequency: preset.frequency,
    p_interval: preset.interval,
    p_start: v.next_date,
    p_pay_with: payWith,
    p_card: payWith === "card" ? payId : null,
    p_account: payWith === "account" ? payId : null,
    p_amount_cents: v.amount,
    p_price_from: v.next_date,
  });
  if (error) return { ok: false, error: error.code === "PGRST202" ? "Rode a migration 11 (assinaturas) no Supabase." : ERR };

  if (v.id) {
    // editar não relança cobranças antigas: a partir da nova data em diante
    const { data: cur } = await supabase.from("subscriptions").select("charged_through").eq("id", id).single();
    const floor = addDays(v.next_date, -1);
    if (!cur?.charged_through || cur.charged_through < floor) {
      await supabase.from("subscriptions").update({ charged_through: floor }).eq("id", id);
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, message: v.id ? "Assinatura atualizada." : "Assinatura criada." };
}

type StatusAction = "pause" | "resume" | "cancel" | "reactivate";

export async function changeSubscriptionStatus(_: SubscriptionActionResult, form: FormData): Promise<SubscriptionActionResult> {
  const id = z.uuid().safeParse(form.get("id"));
  const action = z.enum(["pause", "resume", "cancel", "reactivate"]).safeParse(form.get("action"));
  if (!id.success || !action.success) return { ok: false, error: "Pedido inválido." };
  const { supabase } = await requireUser();
  const profile = await loadProfile(supabase);
  const today = todayIn(profile.timezone);
  const yesterday = addDays(today, -1);
  const { data: s } = await supabase.from("subscriptions").select("status,paused_from,charged_through").eq("id", id.data).maybeSingle();
  if (!s) return { ok: false, error: "Assinatura não encontrada." };
  const through = !s.charged_through || s.charged_through < yesterday ? yesterday : s.charged_through;

  const patch: Record<StatusAction, Record<string, unknown>> = {
    pause: { status: "paused", paused_from: today, paused_until: null },
    resume: s.paused_from && s.paused_from <= yesterday
      ? { status: "active", paused_until: yesterday, charged_through: through }
      : { status: "active", paused_from: null, paused_until: null, charged_through: through },
    cancel: { status: "cancelled", cancelled_at: today },
    reactivate: { status: "active", cancelled_at: null, paused_from: null, paused_until: null, charged_through: through },
  };
  const { error } = await supabase.from("subscriptions").update(patch[action.data]).eq("id", id.data);
  if (error) return { ok: false, error: ERR };
  revalidatePath("/", "layout");
  const msg: Record<StatusAction, string> = {
    pause: "Assinatura pausada: nada é cobrado até você retomar.",
    resume: "Assinatura retomada.",
    cancel: "Assinatura cancelada. As cobranças já lançadas ficam no histórico.",
    reactivate: "Assinatura reativada.",
  };
  return { ok: true, message: msg[action.data] };
}

export async function removeSubscription(_: SubscriptionActionResult, form: FormData): Promise<SubscriptionActionResult> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { ok: false, error: "Assinatura inválida." };
  const { supabase } = await requireUser();
  const profile = await loadProfile(supabase);
  const { data, error } = await supabase.rpc("remove_subscription", { p_subscription: id.data, p_today: todayIn(profile.timezone) });
  if (error) return { ok: false, error: "Não foi possível excluir a assinatura." };
  revalidatePath("/", "layout");
  return { ok: true, message: data === "deleted" ? "Assinatura excluída." : "Ela já tinha cobranças, então foi cancelada e o histórico ficou." };
}
