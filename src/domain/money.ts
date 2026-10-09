/**
 * Dinheiro no NEXO é sempre representado em CENTAVOS INTEIROS (BRL).
 * Nunca usamos float para armazenar ou somar valores. Toda conversão
 * de/para texto passa por este módulo, com arredondamento explícito.
 */

export type Cents = number & { readonly __brand?: "cents" };

export class MoneyError extends Error {}

export function assertCents(value: number, label = "valor"): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} precisa ser um número inteiro de centavos (recebido: ${value})`);
  }
}

export function cents(value: number): Cents {
  assertCents(value);
  return value as Cents;
}

/**
 * Converte texto digitado pelo usuário em centavos, sem passar por float.
 * Aceita "85", "85,5", "85,50", "1.234,56", "R$ 1.234,56", "-12,30" e "42.50".
 * Mais de 2 casas decimais é rejeitado (não arredondamos silenciosamente entrada humana).
 */
export function parseBRL(input: string): Cents {
  let s = input.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (s === "") throw new MoneyError("Informe um valor");

  let intPart: string;
  let fracPart = "";
  if (s.includes(",")) {
    // formato brasileiro: ponto é milhar, vírgula é decimal
    const [i, f, ...rest] = s.split(",");
    if (rest.length > 0) throw new MoneyError("Valor inválido");
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(i)) throw new MoneyError("Valor inválido");
    intPart = i.replace(/\./g, "");
    fracPart = f ?? "";
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    // "42.50" — ponto decimal (ex.: colado de outro sistema)
    [intPart, fracPart] = s.split(".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    intPart = s.replace(/\./g, "");
  } else if (/^\d+$/.test(s)) {
    intPart = s;
  } else {
    throw new MoneyError("Valor inválido");
  }
  if (!/^\d*$/.test(fracPart)) throw new MoneyError("Valor inválido");
  if (fracPart.length > 2) throw new MoneyError("Use no máximo 2 casas decimais");
  const value = Number(intPart) * 100 + Number(fracPart.padEnd(2, "0") || "0");
  assertCents(value);
  return (negative ? -value : value) as Cents;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata centavos como "R$ 1.234,56" sem perda de precisão. */
export function formatBRL(value: Cents, opts: { signed?: boolean } = {}): string {
  assertCents(value);
  // Intl recebe value/100; para inteiros seguros < 2^53 a divisão por 100 é exata
  // o suficiente para formatar 2 casas, e não é usada para cálculo.
  const text = brl.format(Math.abs(value) / 100).replace(/ /g, " ");
  if (value < 0) return `-${text}`;
  if (opts.signed && value > 0) return `+${text}`;
  return text;
}

export function sum(values: readonly number[]): Cents {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  assertCents(total, "soma");
  return total as Cents;
}

/**
 * Divide um total em N partes inteiras cuja soma é exatamente o total.
 * O resto (centavos que sobram) vai para as PRIMEIRAS parcelas,
 * como fazem os emissores brasileiros: R$ 100 / 3 = 33,34 + 33,33 + 33,33.
 */
export function splitEven(total: Cents, parts: number): Cents[] {
  assertCents(total);
  if (!Number.isInteger(parts) || parts < 1) throw new MoneyError("Número de parcelas inválido");
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / parts);
  const remainder = abs - base * parts;
  return Array.from({ length: parts }, (_, i) => (sign * (base + (i < remainder ? 1 : 0))) as Cents);
}

/**
 * Multiplica centavos por um fator racional (ex.: equivalente mensal de anual = 1/12)
 * com arredondamento explícito "half-even" (bancário).
 */
export function mulDiv(value: Cents, numerator: number, denominator: number): Cents {
  assertCents(value);
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator === 0) {
    throw new MoneyError("Fator inválido");
  }
  const big = BigInt(value) * BigInt(numerator);
  const d = BigInt(denominator);
  let q = big / d;
  const r = big % d;
  const twice = (r < 0n ? -r : r) * 2n;
  const absD = d < 0n ? -d : d;
  if (twice > absD || (twice === absD && q % 2n !== 0n)) {
    q += (big < 0n) !== (d < 0n) ? -1n : 1n;
  }
  const out = Number(q);
  assertCents(out);
  return out as Cents;
}
