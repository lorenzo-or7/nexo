import { CalendarClock, LayoutGrid, PieChart } from "lucide-react";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section";

const PILLARS = [
  {
    icon: LayoutGrid,
    title: "Tudo em um só lugar",
    text: "Organize diferentes contas, cartões e movimentações de forma centralizada.",
    visual: (
      <div aria-hidden className="mt-6 grid gap-2 text-xs">
        {["Conta principal", "Reserva", "Cartão de crédito"].map((n, i) => (
          <div key={n} className="flex items-center justify-between rounded-xl border border-border bg-field/50 px-3 py-2" style={{ marginLeft: i * 10 }}>
            <span className="flex items-center gap-2 text-ink-2"><span className="size-2 rounded-full" style={{ background: ["var(--accent)", "var(--chart-expected)", "var(--chart-expense)"][i] }} />{n}</span>
            <span className="h-1.5 w-14 rounded-full bg-surface-3" />
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: PieChart,
    title: "Entenda seu dinheiro",
    text: "Visualize suas despesas, compromissos e informações financeiras com mais clareza.",
    visual: (
      <div aria-hidden className="mt-6 grid gap-2.5 text-xs">
        {[
          ["Moradia", 78, "var(--accent)"],
          ["Mercado", 46, "var(--chart-expense)"],
          ["Transporte", 24, "var(--chart-expected)"],
        ].map(([n, w, c]) => (
          <div key={n as string}>
            <div className="mb-1 flex justify-between text-ink-3"><span>{n}</span></div>
            <div className="h-2 rounded-full bg-surface-3"><div className="h-2 rounded-full" style={{ width: `${w}%`, background: c as string }} /></div>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: CalendarClock,
    title: "Planeje o que vem pela frente",
    text: "Antecipe o impacto de recebimentos e pagamentos futuros.",
    visual: (
      <div aria-hidden className="mt-6 flex items-end gap-1.5">
        {[28, 40, 34, 52, 30, 62, 48, 70, 56, 76].map((h, i) => (
          <span key={i} className="flex-1 rounded-t-md" style={{ height: h, background: i > 5 ? "color-mix(in oklab, var(--chart-expected) 70%, transparent)" : "var(--accent)", opacity: i > 5 ? 0.75 : 1 }} />
        ))}
      </div>
    ),
  },
];

export function Benefits() {
  return (
    <section aria-labelledby="titulo-beneficios" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
      <SectionHeading id="titulo-beneficios" eyebrow="Por que o NEXO" title="Menos complicação. Mais controle." />
      <ul className="mt-14 grid gap-5 md:grid-cols-3">
        {PILLARS.map((p, i) => (
          <Reveal as="li" key={p.title} delay={i * 80} className="panel group relative overflow-hidden rounded-[var(--radius-card)] p-6 transition-transform duration-300 hover:-translate-y-1 sm:p-7">
            <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent"><p.icon className="size-5" aria-hidden /></span>
            <h3 className="mt-5 text-xl font-semibold tracking-tight">{p.title}</h3>
            <p className="mt-2 leading-relaxed text-ink-2">{p.text}</p>
            {p.visual}
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
