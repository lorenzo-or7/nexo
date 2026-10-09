import { CreditCard, LayoutDashboard, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
}

/** Só entram aqui as áreas já implementadas — nada de links que levam a telas vazias. */
export const NAV: NavItem[] = [
  { href: "/", label: "Visão geral", short: "Início", icon: LayoutDashboard },
  { href: "/cartoes", label: "Cartões", short: "Cartões", icon: CreditCard },
  { href: "/configuracoes", label: "Configurações", short: "Ajustes", icon: Settings },
];
