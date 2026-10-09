import type { Metadata } from "next";
import { SignInForm } from "../auth-forms";

export const metadata: Metadata = { title: "Entrar" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const sp = await searchParams;
  return <SignInForm next={sp.next} linkError={sp.erro === "link"} />;
}
