import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { getSessionUser } from "@/lib/supabase/server";
import { SignInForm } from "../auth-forms";

export const metadata: Metadata = { title: "Entrar" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const sp = await searchParams;
  // já logado de verdade (conferido no servidor do Supabase): vai direto ao início
  if (isSupabaseConfigured()) {
    const user = await getSessionUser().catch(() => null);
    if (user) redirect(sp.next?.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/");
  }
  return <SignInForm next={sp.next} linkError={sp.erro === "link"} />;
}
