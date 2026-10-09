import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Exportação completa dos dados do usuário (JSON). RLS + função security invoker. */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { data, error } = await supabase.rpc("export_my_data");
  if (error) return NextResponse.json({ error: "Falha na exportação" }, { status: 500 });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="nexo-dados-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
