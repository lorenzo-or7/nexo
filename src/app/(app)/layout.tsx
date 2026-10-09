import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { loadProfile } from "@/lib/data/finance";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { normalizeTheme } from "@/lib/theme/shared";
import { signOut } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  const profile = await loadProfile(supabase);
  return (
    <AppShell
      user={{ name: profile.display_name ?? user.email ?? "Você", email: user.email ?? "" }}
      profileTheme={profile.theme === "system" ? null : normalizeTheme(profile.theme)}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  );
}
