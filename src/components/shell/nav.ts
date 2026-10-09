import { ArrowLeftRight, CreditCard, LayoutDashboard, Settings, Tags, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  /** fora da barra inferior do celular (lá cabem 5) */
  desktopOnly?: boolean;
}

/** Só entram aqui as áreas já implementadas — nada de links que levam a telas vazias. */
export const NAV: NavItem[] = [
  { href: "/", label: "Visão geral", short: "Início", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançamentos", short: "Extrato", icon: ArrowLeftRight },
  { href: "/contas", label: "Contas", short: "Contas", icon: Wallet },
  { href: "/cartoes", label: "Cartões", short: "Cartões", icon: CreditCard },
  { href: "/categorias", label: "Categorias", short: "Categorias", icon: Tags, desktopOnly: true },
  { href: "/configuracoes", label: "Configurações", short: "Ajustes", icon: Settings },
];
