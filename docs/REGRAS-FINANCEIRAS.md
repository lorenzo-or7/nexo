# NEXO — Regras financeiras

Estas regras estão implementadas em `src/domain/` (funções puras, sem banco) e reforçadas no PostgreSQL por constraints e funções em `supabase/migrations/`. Cada regra abaixo tem teste automatizado; o número entre colchetes remete à lista da seção 20 do briefing.

## 1. Dinheiro

- Todo valor é **centavos inteiros** (`bigint` no banco, `number` inteiro seguro no TypeScript). Nenhum float é usado para armazenar ou somar. [15]
- Texto digitado é convertido por `parseBRL` sem passar por float. Aceita `85`, `85,5`, `1.234,56`, `R$ 1.234,56`, `42.50`. Mais de 2 casas decimais é **rejeitado**, não arredondado.
- Divisão em parcelas (`splitEven`): soma sempre exata; os centavos que sobram vão para as **primeiras** parcelas (R$ 100 em 3x = 33,34 + 33,33 + 33,33), como fazem os emissores.
- Frações (equivalente mensal de anual, semanal etc.) usam `mulDiv` com arredondamento **half-even** explícito.

## 2. Saldo real × projeção

| Status do lançamento | Significado | Entra no saldo real? | Entra na projeção? |
|---|---|---|---|
| `confirmed` | Realizado | Sim, se a data ≤ hoje | — |
| `scheduled` | Agendado / confirmado pela outra parte | Não | Sim |
| `expected` | Previsto (incerto) | Não | Despesas sim; **receitas só se o usuário permitir** |

- Saldo real = saldo inicial (no **início** da data de referência) + lançamentos `confirmed` com data entre a referência e hoje. [12]
- Lançamento pendente com data passada aparece **hoje** como *atrasado*, guardando a data original.
- "Hoje" é calculado no fuso do usuário (padrão `America/Sao_Paulo`).

## 3. Transferências

- Dois lançamentos do tipo `transfer` com o mesmo `transfer_id`, um negativo na origem e um positivo no destino. Não são receita nem despesa. [5]
- No banco: `create_transfer` grava os dois lados numa transação; uma **constraint trigger adiada** recusa o commit se existir só um lado, valores diferentes, contas trocadas, status ou datas divergentes. Apagar um lado só é recusado; apagar a transferência apaga os dois.
- Idempotência por `idempotency_key` (repetir a requisição devolve a mesma transferência).

## 4. Cartões de crédito

**Identificação da fatura**: pelo mês do **vencimento** (`2026-10` vence em outubro).

**Fechamento**: dia configurado, limitado ao fim do mês (31 → 28/29/30). Por padrão o fechamento fica no mesmo mês do vencimento quando `fechamento < vencimento`, e no mês anterior caso contrário (ex.: fecha 28, vence 5). Pode ser forçado por `closing_to_due_months`. [9]

**Compra no dia do fechamento**: vai para a **próxima** fatura (`next_invoice`, padrão). Configurável por cartão para `current_invoice`. [7]

**Exceções**: `invoice_overrides` muda datas de fechamento/vencimento de uma fatura específica. Uma compra também pode ter a primeira parcela forçada numa fatura (`first_invoice_ref`).

**Compra no crédito** [1]
1. Gera parcelas em `card_charges`, cada uma na fatura correta (meses consecutivos, cruzando o ano quando preciso). [2][8]
2. **Não** cria lançamento em conta — o saldo bancário não muda.
3. Consome limite: pelo total da compra (`full_amount`, padrão BR) ou só parcelas já faturadas (`billed_only`).
4. No banco, `create_credit_purchase` confere quantidade, numeração, meses consecutivos e **soma exata** das parcelas.

**Pagamento de fatura** [3][4]
- É um lançamento de conta `invoice_payment` ligado a cartão + fatura. Reduz a conta e o devido.
- **Não é despesa de consumo** — a despesa já foi contada na compra. Relatórios de consumo excluem esse tipo.
- Integral, parcial ou antecipado (fatura ainda aberta).
- Restante de fatura **vencida** é levado à próxima (saldo devedor); juros entram como lançamento `fee` informado.
- Pagamento a maior vira **crédito** na próxima fatura.

**Estorno** [10]
- `credit_current` (padrão): crédito do valor estornado na fatura atual; parcelas futuras continuam. Líquido da compra = 0.
- `cancel_remaining`: cancela parcelas ainda não faturadas e credita só o que já foi faturado.
- Estorno parcial: crédito do valor informado. O banco recusa estornar mais que o saldo da compra.

## 5. Linha do tempo e "quanto posso gastar?"

- Parte do saldo real de hoje; aplica dia a dia lançamentos agendados/previstos, o **restante** de cada fatura no vencimento (descontando pagamentos agendados para ela) e eventos hipotéticos de simulação.
- Cenário de referência (seção 11/18): 321,12 + 812,68 − 544,68 + 488,99 − 814,88 = **263,23**.
- **Livre para gastar** = menor saldo projetado do período − reserva mínima − margem de segurança. Gastar mais que isso hoje faria algum dia ficar abaixo da reserva.
- Alerta quando qualquer dia fica negativo, mesmo que o fim seja positivo. [13]

## 6. Recorrências e assinaturas

- Ocorrências calculadas sempre a partir da data inicial (sem deriva: 31/01 → 28/02 → 31/03 → 30/04).
- Cada ocorrência tem uma **chave de período** (`YYYY-MM` mensal, `YYYY` anual, segunda-feira da semana, ou a data). `UNIQUE(subscription_id, period_key)` no banco: gerar duas vezes, gerar com intervalos sobrepostos ou mudar o dia de cobrança no meio do mês **não duplica**. [6]
- Mudança de preço vale a partir de `effective_from`; pausa e cancelamento interrompem ocorrências.

**Na prática (tela Assinaturas)**
- Cobrança com data até hoje vira lançamento automaticamente ao abrir o app: no cartão, uma compra 1x na fatura certa; na conta, uma despesa realizada. `charged_through` guarda até que dia isso já foi feito.
- Cobranças futuras entram só na **projeção** (linha do tempo e "livre para gastar").
- Pausar: nada é cobrado até retomar; os dias pausados não são cobrados depois. Cancelar: para a partir do dia; o histórico fica. Excluir sem cobranças apaga; com cobranças, cancela.
- Mudar o valor vale a partir da data informada (histórico em `subscription_prices`).
- Custo por mês = soma do equivalente mensal das ativas (anual ÷ 12, trimestral ÷ 3, semanal × 52 ÷ 12), arredondamento half-even.

## 7. Simulador

Recebe compras à vista, no crédito (com parcelas) ou novas assinaturas e devolve saldo antes/depois, impacto por fatura, impacto mensal, menor saldo e alertas. Trabalha sobre cópias em memória: **nada é gravado** sem confirmação explícita.

## 8. Metas e orçamentos

Aportes em metas (`goal_contributions`) são **reservas**, não despesas, e não alteram saldo nem consumo.

## 9. Reembolsos de terceiros

- Uma compra (no crédito ou em conta) pode ter partes que outras pessoas vão pagar. Cada parte vira um lançamento `refund` com `counterparty` (quem paga), ligado à compra (`purchase_id`) ou à despesa (`reimburses_entry_id`).
- Nasce como **agendado** na data combinada (sugestão: vencimento da fatura): entra na projeção e no "livre para gastar", mas não no saldo real.
- Ao marcar como recebido, entra no saldo e **reduz o consumo** na categoria da compra.
- A soma dos reembolsos nunca passa do valor da compra (checado no banco).
- Excluir a compra/despesa exclui junto os reembolsos ainda não recebidos; os já recebidos ficam (o dinheiro entrou de fato).

## 10. Categorias

- Dois níveis: categoria principal → subcategorias. A subcategoria tem sempre o tipo (despesa/receita) da principal; mudar o tipo da principal leva as subcategorias junto (trigger no banco).
- Nome único por nível, sem diferenciar maiúsculas (no app) e exato (no banco).
- Filtrar pela principal inclui as subcategorias.
- `remove_category`: sem uso, apaga (com as subcategorias); com lançamentos, compras, assinaturas, recorrências ou orçamentos, **arquiva** — some das opções, mas o histórico mantém o nome. Arquivadas podem ser restauradas; criar de novo uma arquivada com o mesmo nome a restaura.
