import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { loadProfile } from "@/lib/data/finance";
import { loadQuickEntryData } from "@/lib/data/ledger";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { normalizePalette } from "@/lib/theme/palettes";
import { normalizeTheme } from "@/lib/theme/shared";
import { signOut } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getSessionUser();
  // sessão inválida (ex.: conta removida): limpa os cookies antes de ir ao login
  if (!user) redirect("/auth/sair");
  const profile = await loadProfile(supabase);
  const quickEntry = await loadQuickEntryData(supabase, profile);
  return (
    <AppShell
      user={{ name: profile.display_name ?? user.email ?? "Você", email: user.email ?? "" }}
      profileTheme={profile.theme === "system" ? null : normalizeTheme(profile.theme)}
      profilePalette={profile.palette ? normalizePalette(profile.palette) : null}
      signOutAction={signOut}
      quickEntry={quickEntry}
    >
      {children}
    </AppShell>
  );
}
