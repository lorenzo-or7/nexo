"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, isValidDate, todayIn } from "@/domain/dates";
import { parseBRL } from "@/domain/money";
import { FREQUENCY_PRESETS } from "@/domain/subscriptions";
import { loadProfile } from "@/lib/data/finance";
import { requireUser } from "@/lib/supabase/server";

export type SubscriptionActionResult = { ok: true; message: string } | { ok: false; error: string; field?: string } | undefined;

const kindSchema = z.enum(["subscription", "bill"]).catch("subscription");
type Kind = z.infer<typeof kindSchema>;
/** palavras de cada tela: "assinatura" ou "conta fixa" */
const WORDS: Record<Kind, { one: string; Cap: string; created: string; updated: string }> = {
  subscription: { one: "a assinatura", Cap: "Assinatura", created: "Assinatura criada.", updated: "Assinatura atualizada." },
  bill: { one: "a conta fixa", Cap: "Conta fixa", created: "Conta fixa criada.", updated: "Conta fixa atualizada." },
};

const uuidOrNull = z.string().transform((v) => v || null).pipe(z.uuid().nullable());

const schema = z.object({
  id: uuidOrNull,
  name: z.string().trim().min(1, "Dê um nome").max(60, "Use até 60 caracteres"),
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

const ERR = "Não foi possível salvar. Tente de novo.";

export async function saveSubscription(_: SubscriptionActionResult, form: FormData): Promise<SubscriptionActionResult> {
  const kind = kindSchema.parse(String(form.get("kind") ?? ""));
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

  if (!v.id && kind === "bill") {
    // marca como conta fixa (a assinatura é o padrão do banco, então só esse caso precisa gravar)
    const { error: kindError } = await supabase.from("subscriptions").update({ kind }).eq("id", id);
    if (kindError) {
      await supabase.rpc("remove_subscription", { p_subscription: id, p_today: v.next_date });
      return { ok: false, error: kindError.code === "42703" ? "Rode a migration 14 (contas fixas) no Supabase." : ERR };
    }
  }

  if (v.id) {
    // editar não relança cobranças antigas: a partir da nova data em diante
    const { data: cur } = await supabase.from("subscriptions").select("charged_through").eq("id", id).single();
    const floor = addDays(v.next_date, -1);
    if (!cur?.charged_through || cur.charged_through < floor) {
      await supabase.from("subscriptions").update({ charged_through: floor }).eq("id", id);
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, message: v.id ? WORDS[kind].updated : WORDS[kind].created };
}

type StatusAction = "pause" | "resume" | "cancel" | "reactivate";

export async function changeSubscriptionStatus(_: SubscriptionActionResult, form: FormData): Promise<SubscriptionActionResult> {
  const id = z.uuid().safeParse(form.get("id"));
  const action = z.enum(["pause", "resume", "cancel", "reactivate"]).safeParse(form.get("action"));
  const kind = kindSchema.parse(String(form.get("kind") ?? ""));
  if (!id.success || !action.success) return { ok: false, error: "Pedido inválido." };
  const { supabase } = await requireUser();
  const profile = await loadProfile(supabase);
  const today = todayIn(profile.timezone);
  const yesterday = addDays(today, -1);
  const { data: s } = await supabase.from("subscriptions").select("status,paused_from,charged_through").eq("id", id.data).maybeSingle();
  if (!s) return { ok: false, error: `${WORDS[kind].Cap} não encontrada.` };
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
  const W = WORDS[kind];
  const msg: Record<StatusAction, string> = {
    pause: `${W.Cap} pausada: nada é cobrado até você retomar.`,
    resume: `${W.Cap} retomada.`,
    cancel: kind === "bill" ? "Conta fixa encerrada. O que já foi lançado fica no histórico." : "Assinatura cancelada. As cobranças já lançadas ficam no histórico.",
    reactivate: `${W.Cap} reativada.`,
  };
  return { ok: true, message: msg[action.data] };
}

export async function removeSubscription(_: SubscriptionActionResult, form: FormData): Promise<SubscriptionActionResult> {
  const id = z.uuid().safeParse(form.get("id"));
  const kind = kindSchema.parse(String(form.get("kind") ?? ""));
  if (!id.success) return { ok: false, error: `${WORDS[kind].Cap} inválida.` };
  const { supabase } = await requireUser();
  const profile = await loadProfile(supabase);
  const { data, error } = await supabase.rpc("remove_subscription", { p_subscription: id.data, p_today: todayIn(profile.timezone) });
  if (error) return { ok: false, error: `Não foi possível excluir ${WORDS[kind].one}.` };
  revalidatePath("/", "layout");
  return { ok: true, message: data === "deleted" ? `${WORDS[kind].Cap} excluída.` : kind === "bill" ? "Ela já tinha lançamentos, então foi encerrada e o histórico ficou." : "Ela já tinha cobranças, então foi cancelada e o histórico ficou." };
}
