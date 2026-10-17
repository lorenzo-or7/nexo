# Previsão do saldo, gráficos e contas fixas

## Saldo com ou sem as receitas previstas
- Tela inicial: o seletor **Só o confirmado / Com previstas** (no topo do destaque) controla **ao mesmo tempo**
  o número grande ("Livre para gastar"), "Menor saldo", "Fim do período", o aviso de saldo negativo e o gráfico.
  O botão "Receitas previstas" dentro do gráfico faz a mesma coisa.
- Os dois cenários são calculados no servidor (`buildDashboard` → `scenarios.confirmed` e `scenarios.withExpected`),
  com a mesma reserva e margem de segurança; a tela só alterna entre eles.
- O padrão segue a opção de Configurações ("contar receitas previstas"); a última escolha fica guardada no navegador.
  Sem receitas previstas no período, o seletor fica desabilitado.

## Gráfico de saldo
- **Linha fixa do zero**: sempre visível, com "▲ positivo" acima e "▼ negativo" abaixo, zonas levemente coloridas e
  o eixo sempre marcando o `0` (escala calculada em `niceScale`). Quando o saldo cruza o zero, a linha/área muda de cor.
- Estilos: **Área** e **Barras** (a "Linha" foi removida por ser quase igual à Área).

## Novas visões do gráfico
- **A receber**: soma acumulada dos recebimentos do período, separando *confirmado* e *previsto*; mostra total,
  confirmado, previsto e próximo recebimento.
- **A pagar**: saídas por semana/dia separadas por origem (faturas de cartão, contas fixas e assinaturas, outras),
  com o total acumulado no balão. A separação usa `ChartDay.outInvoices/outRecurring/outOther`.
- Todas têm a opção **Tabela**.

## Contas fixas (academia, luz, condomínio, internet…)
- Nova tela **Contas fixas** (`/contas-fixas`). Usa o mesmo motor das assinaturas (valor, frequência, dia do vencimento,
  categoria, pago em conta ou cartão, pausar/encerrar, histórico de preços): cada vencimento vira lançamento sozinho e os
  próximos já entram na previsão do saldo (tela inicial, "A pagar", "Próximos vencimentos").
- Conta com valor variável (luz, água): cadastre uma estimativa e edite o valor quando a conta chegar; vale a partir da data escolhida.
- **Migration (opcional, mas necessária para esta tela)**: `supabase/migrations/20261017001400_fixed_bills.sql` — só acrescenta a
  coluna `subscriptions.kind` (`'subscription'` por padrão). Nada do que existe muda. Sem a migration, a tela mostra o aviso
  com o passo e todo o resto do NEXO continua funcionando.
- Assinaturas e contas fixas aparecem em telas separadas, mas somam igual na previsão.

## Testes
- Unitários: `src/domain/__tests__/dashboard.test.ts` (cenários, reserva, origem das saídas), `src/lib/__tests__/nav.test.ts`.
- E2E: `e2e/forecast.spec.ts`, `e2e/fixed-bills.spec.ts`.
