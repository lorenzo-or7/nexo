import { ArrowLeftRight, CreditCard, HandCoins, LayoutDashboard, Receipt, Repeat, Settings, Tags, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  /** no celular vai para o painel "Mais" em vez da barra inferior (a barra tem 4 atalhos + "Mais", para caber em 320px) */
  more?: boolean;
}

/** Só entram aqui as áreas já implementadas — nada de links que levam a telas vazias. */
export const NAV: NavItem[] = [
  { href: "/", label: "Visão geral", short: "Início", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançamentos", short: "Extrato", icon: ArrowLeftRight },
  { href: "/contas", label: "Contas", short: "Contas", icon: Wallet },
  { href: "/cartoes", label: "Cartões", short: "Cartões", icon: CreditCard },
  { href: "/assinaturas", label: "Assinaturas", short: "Assinaturas", icon: Repeat, more: true },
  { href: "/contas-fixas", label: "Contas fixas", short: "Fixas", icon: Receipt, more: true },
  { href: "/renda-fixa", label: "Renda fixa", short: "Renda fixa", icon: HandCoins, more: true },
  { href: "/categorias", label: "Categorias", short: "Categorias", icon: Tags, more: true },
  { href: "/configuracoes", label: "Configurações", short: "Ajustes", icon: Settings, more: true },
];

/** Item do menu aceso para a rota atual. Compara o segmento inteiro: "/contas" não acende em "/contas-fixas". */
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
