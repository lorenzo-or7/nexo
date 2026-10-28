import { NextResponse, type NextRequest } from "next/server";
import { entriesToCsv, type ExportShape } from "@/lib/export/csv";
import { createClient } from "@/lib/supabase/server";

/**
 * Exportação dos dados do próprio usuário: JSON completo (padrão) ou CSV dos lançamentos (?formato=csv).
 * Sessão validada no servidor; a função do banco é security invoker (RLS) e filtra por auth.uid().
 * Nunca inclui senha, tokens ou chaves: isso fica no Supabase Auth e não passa por aqui.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { data, error } = await supabase.rpc("export_my_data");
  if (error) return NextResponse.json({ error: "Falha na exportação" }, { status: 500 });
  const date = new Date().toISOString().slice(0, 10);
  const csv = request.nextUrl.searchParams.get("formato") === "csv";
  const body = csv ? entriesToCsv(data as ExportShape) : JSON.stringify(data, null, 2);
  return new NextResponse(body, {
    headers: {
      "content-type": csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="nexo-${csv ? "lancamentos" : "dados"}-${date}.${csv ? "csv" : "json"}"`,
      "cache-control": "no-store",
    },
  });
}
