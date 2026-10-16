# Página inicial pública

## Como ela entra no sistema

- A página vive em **`/bem-vindo`** (`src/app/(landing)/bem-vindo/page.tsx`).
- O `middleware.ts` a serve em **`/`** só para quem **não tem sessão** (reescrita interna: a URL continua `/`). Quem tem sessão continua indo direto ao painel; nenhuma rota protegida mudou.
- Regra isolada e testada em `src/lib/landing/routing.ts`.
- Login (`/entrar`) e cadastro (`/cadastro`) são as rotas já existentes; os botões apontam para elas.
- `/robots.txt` e `/sitemap.xml` são gerados por `src/app/robots.ts` e `src/app/sitemap.ts` (URL base: `NEXT_PUBLIC_SITE_URL`, com `https://nexo-gamma-one.vercel.app` como padrão).

## Componentes (`src/components/landing`)

| Arquivo | Papel |
|---|---|
| `header.tsx` | Cabeçalho, menu mobile acessível, alternador de tema |
| `hero.tsx`, `dashboard-preview.tsx`, `tilt-frame.tsx` | Primeira dobra e prévia do painel (dados fictícios, SVG estático) |
| `benefits.tsx` | Três pilares |
| `bento.tsx` | Grid de funcionalidades (só o que existe de verdade) |
| `simulator.tsx` + `src/lib/landing/simulation.ts` | Simulador de 30 dias (lógica pura e testada) |
| `product-demo.tsx` | Amostra interativa do painel (saldo, entradas e saídas, categorias), dados fictícios |
| `faq.tsx` | Perguntas frequentes (accordion acessível) |
| `final-cta.tsx`, `footer.tsx` | Fechamento e rodapé |
| `reveal.tsx`, `use-animated-number.ts`, `mini-chart.tsx` | Animação ao rolar, número animado, helpers de SVG |

Nada na landing consulta o banco, usa sessão, chama endpoints privados ou importa componentes do painel. Os gráficos são SVG puro (sem Recharts), então a página carrega pouco JavaScript.

## Funcionalidades confirmadas no código

Múltiplas contas e transferências · cartões, faturas e compras parceladas · assinaturas · renda fixa (salário e mensalidades) · categorias com cor · projeção do saldo com menor saldo e "livre para gastar" · exportar dados e excluir conta · tema claro/escuro e paletas · uso no celular.

**Não existe:** integração automática com bancos, orçamentos, metas, notificações. Por isso não aparecem na página.

## Pendências para o responsável

1. **Preço / gratuidade** — a resposta do FAQ diz apenas que ainda não há planos publicados (`faq.tsx`, marcada `REVISAR`). Atualize quando houver decisão.
2. **Política de privacidade e Termos de uso** — não existem. Quando forem criados, preencha `src/lib/legal.ts` e os links aparecem sozinhos no rodapé, no login e no cadastro (ver `docs/SEGURANCA.md`).
3. **Imagem de compartilhamento (Open Graph)** — usa `icon-512.png`. Uma arte 1200×630 da marca melhoraria a prévia em redes sociais.
4. A afirmação de segurança do FAQ se limita ao que está implementado (isolamento por conta com RLS, exportação e exclusão); não cita certificações.

## Como rodar e testar

```bash
npm run dev                      # abre http://localhost:3000 (sem sessão, "/" mostra a landing)
npm test                         # testes de unidade (inclui o simulador e a regra da rota)
NEXO_DEV_PREVIEW=1 npx next dev --turbopack -p 3100
npx playwright test e2e/landing.spec.ts   # testes de tela da landing
npm run build                    # build de produção
```

## Deploy

Mesmo fluxo de sempre: `git push` na branch principal e a Vercel publica. Não há variável nova; opcionalmente defina `NEXT_PUBLIC_SITE_URL=https://nexo-gamma-one.vercel.app` (ou o domínio próprio) para o canonical, o sitemap e o Open Graph.

## Adendo: privacidade, segurança e marca OR7

- `src/components/brand/developer-signature.tsx` (`DeveloperSignature`): assinatura OR7 com o arquivo original (`public/brand/or7-assinatura.png`, recortado das margens, sem filtros) sobre a própria superfície preta da arte. Usada em um único lugar por layout: rodapé da landing, layout de autenticação (login e cadastro) e `AppShell` (páginas internas).
- `src/components/legal/privacy-notice.tsx`: aviso "Sua privacidade importa." com referência à LGPD e indicadores verificados, no login e no cadastro. `secure-badge.tsx` só mostra "Conexão protegida por HTTPS" quando a página abriu por HTTPS.
- `src/lib/legal.ts`: endereços da Política de Privacidade e dos Termos (hoje vazios).
- Auditoria completa em `docs/SEGURANCA.md`.
- Testes: `e2e/signature.spec.ts`, `src/lib/__tests__/legal.test.ts`.
