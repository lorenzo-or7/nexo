/** A página inicial pública vive em /bem-vindo, mas é servida em "/" para quem não tem sessão. */
export const LANDING_PATH = "/bem-vindo";

/**
 * Visitante sem sessão na raiz vê a página inicial (reescrita interna, a URL continua "/").
 * Quem tem sessão continua indo direto ao painel; nada de rota protegida muda.
 */
export function shouldShowLanding(pathname: string, isAuthenticated: boolean): boolean {
  return pathname === "/" && !isAuthenticated;
}
