/** Peças de gráfico em SVG puro (sem biblioteca), usadas só na página inicial com dados fictícios. */

export function scale(values: number[], w: number, h: number, pad = 6, domain?: [number, number]) {
  const min = domain ? domain[0] : Math.min(...values);
  const max = domain ? domain[1] : Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w);
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);
  return { x, y, min, max };
}

/** Linha em degraus (o saldo muda no dia do evento e fica constante até o próximo). */
export function stepPath(values: number[], x: (i: number) => number, y: (v: number) => number) {
  let d = `M ${x(0).toFixed(1)} ${y(values[0]).toFixed(1)}`;
  for (let i = 1; i < values.length; i++) {
    d += ` H ${x(i).toFixed(1)} V ${y(values[i]).toFixed(1)}`;
  }
  return d;
}

export function smoothPath(values: number[], x: (i: number) => number, y: (v: number) => number) {
  let d = `M ${x(0).toFixed(1)} ${y(values[0]).toFixed(1)}`;
  for (let i = 1; i < values.length; i++) {
    const cx = (x(i - 1) + x(i)) / 2;
    d += ` C ${cx.toFixed(1)} ${y(values[i - 1]).toFixed(1)} ${cx.toFixed(1)} ${y(values[i]).toFixed(1)} ${x(i).toFixed(1)} ${y(values[i]).toFixed(1)}`;
  }
  return d;
}

export function areaFrom(line: string, lastX: number, baseY: number, firstX = 0) {
  return `${line} L ${lastX.toFixed(1)} ${baseY} L ${firstX} ${baseY} Z`;
}
