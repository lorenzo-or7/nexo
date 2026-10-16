# Auditoria de segurança e privacidade (telas de entrada)

Feita em 16/10/2026 sobre o código do repositório. Só o que está **verificado** aparece na interface; o restante está listado aqui como pendência ou recomendação. Nenhum mecanismo crítico foi alterado.

## O que foi verificado

| Item | Resultado | Evidência |
|---|---|---|
| Senhas | O NEXO não guarda senha: não há coluna de senha nas migrations nem registro delas em log. Entrada e cadastro chamam apenas o Supabase Auth. Regra de senha validada no servidor (8 a 72 caracteres, letra e número). | `supabase/migrations`, `src/app/(auth)/actions.ts` |
| Sessões | Sessão em cookies do `@supabase/ssr`, renovada no middleware. O middleware valida a assinatura do JWT e as telas internas confirmam o usuário no servidor do Supabase (`getUser`). Cookies com `path=/`, `SameSite=Lax`. | `src/middleware.ts`, `src/lib/supabase/server.ts` |
| Rotas privadas | Sem sessão, qualquer rota fora da lista pública redireciona para `/entrar`. Testes de tela confirmam `/contas` e `/configuracoes`. A exportação de dados devolve 401 sem sessão. | `e2e/landing.spec.ts`, `src/app/api/export/route.ts` |
| Segredos no frontend | A chave `service_role` só existe no servidor (`server-only`), usada apenas para excluir a própria conta. O build não a contém. `.env*` está no `.gitignore`. A página de diagnóstico alerta se a chave secreta for colocada no lugar da pública. | `src/lib/supabase/admin.ts`, busca no build de produção |
| Dados financeiros | Isolamento por usuário (RLS) em todas as tabelas, `anon` sem acesso, funções `security invoker`, valores em centavos inteiros, entradas validadas com zod nas ações do servidor. 46 testes de banco passam. | `docs/ARQUITETURA.md`, `supabase/tests` |
| Cookies e rastreamento | Só cookies essenciais e de preferência (sessão, tema, paleta). Não há analytics, pixel nem scripts de terceiros; por isso não foi criado banner de cookies. | `package.json`, busca no código |
| HTTPS | Não pôde ser conferido daqui (o ambiente bloqueia acesso ao site publicado). Por isso o selo "Conexão protegida por HTTPS" só aparece quando a página realmente abriu por `https:` (checagem feita no navegador de quem acessa). | `src/components/legal/secure-badge.tsx` |

## Textos exibidos nas telas de entrada (todos conferidos)

- "Sua privacidade importa."
- Menção à LGPD como direitos do titular, e à exportação e exclusão de dados em Configurações (existem no sistema).
- "Dados isolados por conta" (RLS).
- "Exporte ou exclua seus dados".
- "Conexão protegida por HTTPS" (somente em HTTPS).

Não há "100% seguro", certificações, selos nem promessa de criptografia específica.

## Pendências e recomendações (não aplicadas)

1. **Política de Privacidade e Termos de Uso não existem.** Os links ficam ocultos até haver os documentos; basta preencher `src/lib/legal.ts`. A redação jurídica deve vir de quem for responsável pelo NEXO.
2. **Cabeçalhos de segurança HTTP ausentes** no projeto (`Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`). Recomendado adicionar em `next.config.ts` com planejamento e teste (a CSP exige ajuste fino com o Supabase e o Next). Confira também o que a Vercel já envia, como o HSTS.
3. **Flag `Secure` nos cookies de sessão** não é definida explicitamente (o padrão do `@supabase/ssr` é `httpOnly: false`, porque o cliente do navegador precisa ler a sessão). Em produção, o ideal é definir `secure: true` nas opções dos cookies, mudança pequena, mas crítica o bastante para ser testada antes.
4. **Limite de tentativas de login:** hoje depende só dos limites do Supabase. Não há proteção própria nem autenticação em dois fatores.
5. **Confirmação de e-mail** depende da configuração do projeto no Supabase (o código trata os dois casos); confira no painel que está ligada.
6. **LGPD:** a base legal, o encarregado (DPO) e o canal de contato do titular dependem de decisão do responsável e entram na Política de Privacidade.
