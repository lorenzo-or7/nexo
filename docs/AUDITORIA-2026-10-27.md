# NEXO — Auditoria e atualização de 27/10/2026

Registro da Fase 1 (auditoria) e das correções feitas nas fases seguintes. Cada problema abaixo tem causa, correção e teste.

## 1. Arquitetura relevante

- **Domínio puro** (`src/domain/`): dinheiro em centavos, linha do tempo (`timeline.ts`), faturas (`billing.ts`), dashboard (`dashboard.ts`), renda fixa, recorrências. Sem banco, 100% testável.
- **Dados** (`src/lib/data/`): carregam do Supabase e entregam ao domínio. Rodam no servidor, com a sessão do usuário (RLS).
- **Banco** (`supabase/migrations/`): constraints + funções `security invoker` (RLS continua valendo). Testado com PGlite rodando as migrations reais.
- **Interface** (`src/components/`, `src/app/`): Next.js 15 (server components + server actions).

Fonte única dos indicadores: `buildDashboard` (`dashboard.ts`) calcula os números dos cards **e** a composição mostrada no detalhamento (`indicators.ts`), a partir da mesma linha do tempo. Por isso o detalhe sempre fecha com o card (há teste que confere).

## 2. Problemas encontrados

### 2.1 Excluir renda fixa "não excluía"
- **Causa:** `remove_fixed_income` encerrava a renda se existisse *qualquer* lançamento ligado a ela. Só que a sincronização cria um lançamento PREVISTO para cada mês vencido, então quase toda renda tinha lançamentos e "excluir" só mudava o status para "encerrada". A tela ainda mostrava as encerradas na lista principal (apagadas) e o aviso falava em "recebimentos registrados" (confirmados), enquanto o banco olhava qualquer lançamento.
- **Correção:** três estados distintos.
  - **Ativa** (e pausada): gera meses.
  - **Encerrada** (`end_fixed_income`): não gera mais; apaga só os previstos futuros; histórico fica. Aparece na aba "Encerradas".
  - **Excluída** (`remove_fixed_income`): some na hora. Previstos são apagados; se houver recebimentos **confirmados**, eles continuam no Extrato e a fonte fica oculta (`deleted_at`); sem confirmados, é apagada de verdade. Nunca volta ao recarregar e não deixa registros órfãos.
- **Migration:** `20261027001500_fixed_income_lifecycle.sql`.
- **Testes:** 3 no banco (ciclo completo, isolamento entre usuários) + interface.

### 2.2 "A receber" aparecia R$ 0,00 com R$ 1.600 previstos
- **Causa:** o total vinha da linha do tempo que respeita a opção "contar receitas previstas" do perfil. Com a opção desligada, as receitas previstas eram removidas da linha do tempo e, junto, do "A receber". Também somava os dois lados de transferências.
- **Correção:** `A receber` e `A pagar` saem da linha do tempo completa (com previstas), ignorando transferências e simulações. A opção continua mandando só no **saldo previsto** ("Só o confirmado" × "Com previstas").
- **Testes:** `dashboard.test.ts` (3 casos novos).

### 2.3 "Faturas abertas" somava parcelas de meses futuros
- **Causa:** somava o restante de **todas** as faturas com status "aberta", inclusive as parcelas que só vencem daqui a meses.
- **Correção:** `Faturas abertas` = a fatura ainda aberta de cada cartão. O que vem depois fica em `futureInvoices`, mostrado separado no detalhamento e fora do total.

### 2.4 Fatura vencida e não paga "sumia"
- **Causa:** `computeInvoices` empurrava o saldo vencido para a fatura seguinte (status "rolada", restante zero).
- **Correção:** a fatura vencida continua pendente, com o status **Vencida** e o restante intacto; só vira **Paga** com restante zero, em qualquer data. Não há mais rolagem automática, então nada é contado duas vezes.

### 2.5 Não existia como registrar pagamento de fatura
- **Causa:** o banco já tinha `pay_invoice`, mas nenhuma tela chamava.
- **Correção:** modal "Registrar pagamento" (total ou parcial), lista de faturas com pago/falta e estado (Aberta, Fechada, Parcialmente paga, Paga, Vencida), e **estorno** auditável (`reverse_invoice_payment`). O pagamento é quitação de obrigação, não despesa de consumo.
- **Proteções:** chave de idempotência por abertura do modal, valor limitado ao que falta, estorno duas vezes é recusado.
- **Migration:** `20261027001600_invoice_payment_reversal.sql`.

### 2.6 Barra inferior e telas estourando a largura no celular
- **Causa:** 5 atalhos + "Mais" (6 botões) com rótulos que não cabiam em 320–360 px; além disso, grids sem `minmax(0, 1fr)` cresciam pelo conteúdo, e abas/seletores com largura fixa.
- **Correção:** 4 atalhos + "Mais" (Assinaturas passou para "Mais"), rótulos truncáveis, grids com `minmax(0,1fr)`, abas que rolam por dentro, seletor de período com rótulos curtos. **Sem** `overflow-x: hidden`.
- **Teste:** 9 telas × 8 larguras (320, 360, 375, 390, 414, 430, 768, 1024) × desktop/celular.

## 3. Novidades

- **Detalhamento dos indicadores** (painel lateral no desktop, folha inferior no celular) para os 8 indicadores, com composição que fecha com o número.
- **Drill-down de categorias** em 3 níveis (categoria → subcategoria → lançamentos filtrados, mês preservado), na rosca, nas barras, na legenda e na tabela, com "Sem subcategoria" e "Sem categoria".
- **Seletor de aparência na landing** (modo + 6 paletas) num único botão.
- **Gerenciamento de dados** em Configurações: exportar (JSON/CSV), limpar lançamentos, limpar tudo (3 etapas + senha).

## 4. Limitações conhecidas

- O drill-down soma o consumo pela data de cada parcela; a lista de Lançamentos mostra a compra parcelada pelo valor total. Para compras parceladas os totais podem diferir entre o gráfico e a lista.
- O seletor de aparência da landing guarda a escolha neste navegador. Contas novas herdam a escolha; contas existentes mantêm a preferência da conta.
- "Limpar lançamentos" mantém assinaturas/rendas fixas ativas; elas não recriam o passado, mas continuam gerando meses futuros.
