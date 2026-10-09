"use client";
import * as P from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { addDays, addMonths, daysInMonth, formatDateBR, makeDate, parseDate, isValidDate, type LocalDate } from "@/domain/dates";
import { cn } from "@/lib/cn";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEK_FULL = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function todayLocal(): LocalDate {
  const d = new Date();
  return makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function weekday(d: LocalDate) {
  const { y, m, day } = parseDate(d);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

/**
 * Calendário no visual do NEXO (substitui o seletor de data do navegador).
 * Envia a data ISO (AAAA-MM-DD) num campo oculto com `name`.
 */
export function DatePicker({
  id,
  name,
  value,
  defaultValue = "",
  onValueChange,
  today: todayProp,
  placeholder = "Escolher data",
  invalid,
  "aria-label": ariaLabel,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: LocalDate) => void;
  /** "hoje" no fuso do usuário (vem do servidor); padrão: relógio do navegador */
  today?: LocalDate;
  placeholder?: string;
  invalid?: boolean;
  "aria-label"?: string;
}) {
  const [inner, setInner] = React.useState(defaultValue);
  const current = value ?? inner;
  const today = todayProp ?? todayLocal();
  const selected = isValidDate(current) ? current : null;
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<"days" | "months">("days");
  // mês exibido (primeiro dia) e dia com foco do teclado
  const [cursor, setCursor] = React.useState<LocalDate>(selected ?? today);
  const gridRef = React.useRef<HTMLDivElement>(null);

  const choose = (d: LocalDate) => {
    if (value === undefined) setInner(d);
    onValueChange?.(d);
    setOpen(false);
  };

  React.useEffect(() => {
    if (open) {
      setCursor(selected ?? today);
      setView("days");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // mantém o foco no dia do cursor ao navegar pelo teclado
  React.useEffect(() => {
    if (!open || view !== "days") return;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`);
    el?.focus({ preventScroll: true });
  }, [cursor, open, view]);

  const { y, m } = parseDate(cursor);
  const first = makeDate(y, m, 1);
  const start = addDays(first, -weekday(first));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const rows = cells.slice(35).every((d) => parseDate(d).m !== m) ? cells.slice(0, 35) : cells;

  const onGridKey = (e: React.KeyboardEvent) => {
    const moves: Record<string, () => LocalDate> = {
      ArrowLeft: () => addDays(cursor, -1),
      ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7),
      ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, -1),
      PageDown: () => addMonths(cursor, 1),
      Home: () => addDays(cursor, -weekday(cursor)),
      End: () => addDays(cursor, 6 - weekday(cursor)),
    };
    if (moves[e.key]) {
      e.preventDefault();
      setCursor(moves[e.key]());
    }
  };

  const navBtn = "grid size-8 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink";

  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <P.Root open={open} onOpenChange={setOpen}>
        <P.Trigger
          id={id}
          type="button"
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          className={cn(
            "group flex h-12 w-full items-center gap-2.5 rounded-[var(--radius-control)] border border-border-strong bg-field px-4 text-left text-base text-ink outline-none transition-[border-color,box-shadow]",
            "hover:border-[color-mix(in_oklab,var(--accent)_45%,var(--border-strong))] focus-visible:border-accent focus-visible:shadow-[0_0_0_4px_var(--accent-soft)]",
            "data-[state=open]:border-accent data-[state=open]:shadow-[0_0_0_4px_var(--accent-soft)] aria-[invalid=true]:border-negative",
          )}
        >
          <CalendarDays className="size-[18px] shrink-0 text-ink-3 group-data-[state=open]:text-accent" />
          <span className={cn("tabular flex-1 truncate", !selected && "text-ink-3")}>
            {selected ? formatDateBR(selected) : placeholder}
          </span>
          {selected && (
            <span className="shrink-0 text-xs text-ink-3">
              {selected === today ? "hoje" : selected === addDays(today, 1) ? "amanhã" : selected === addDays(today, -1) ? "ontem" : WEEK_FULL[weekday(selected)]}
            </span>
          )}
        </P.Trigger>
        <P.Portal>
          <P.Content
            align="start"
            sideOffset={6}
            collisionPadding={12}
            onOpenAutoFocus={(e) => {
              // foco vai para o dia escolhido (setas do teclado já funcionam)
              e.preventDefault();
              requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus({ preventScroll: true }));
            }}
            className="panel z-[60] w-[19rem] rounded-2xl p-3 text-ink data-[state=open]:animate-[pop-in_140ms_ease-out]"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setView((v) => (v === "days" ? "months" : "days"))}
                className="rounded-lg px-2 py-1 text-[0.9375rem] font-semibold tracking-tight hover:bg-surface-2"
                aria-label={view === "days" ? "Escolher mês e ano" : "Voltar para os dias"}
              >
                {view === "days" ? `${MONTHS[m - 1]} ${y}` : y}
              </button>
              <div className="flex gap-1">
                <button type="button" className={navBtn} aria-label={view === "days" ? "Mês anterior" : "Ano anterior"} onClick={() => setCursor(addMonths(cursor, view === "days" ? -1 : -12))}>
                  <ChevronLeft className="size-4" />
                </button>
                <button type="button" className={navBtn} aria-label={view === "days" ? "Próximo mês" : "Próximo ano"} onClick={() => setCursor(addMonths(cursor, view === "days" ? 1 : 12))}>
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>

            {view === "days" ? (
              <div ref={gridRef} role="grid" aria-label={`${MONTHS[m - 1]} de ${y}`} onKeyDown={onGridKey}>
                <div role="row" className="grid grid-cols-7">
                  {WEEK.map((w, i) => (
                    <span key={i} role="columnheader" aria-label={WEEK_FULL[i]} className="grid h-8 place-items-center text-xs font-medium text-ink-3">
                      {w}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-0.5">
                  {rows.map((d) => {
                    const p = parseDate(d);
                    const outside = p.m !== m;
                    const isSel = d === selected;
                    const isToday = d === today;
                    return (
                      <button
                        key={d}
                        type="button"
                        role="gridcell"
                        data-date={d}
                        tabIndex={d === cursor ? 0 : -1}
                        aria-selected={isSel}
                        aria-label={`${p.day} de ${MONTHS[p.m - 1].toLowerCase()} de ${p.y}${isToday ? ", hoje" : ""}`}
                        onClick={() => choose(d)}
                        className={cn(
                          "tabular relative mx-auto grid size-9 place-items-center rounded-xl text-sm outline-none transition-colors",
                          outside ? "text-ink-3/50" : "text-ink",
                          !isSel && "hover:bg-surface-2",
                          isSel && "btn-glow font-semibold",
                          isToday && !isSel && "font-semibold text-accent shadow-[inset_0_0_0_1px_var(--accent)]",
                          "focus-visible:ring-2 focus-visible:ring-accent",
                        )}
                      >
                        {p.day}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 py-1">
                {MONTHS.map((name, i) => {
                  const isCur = i + 1 === m;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setCursor(makeDate(y, i + 1, Math.min(parseDate(cursor).day, daysInMonth(y, i + 1))));
                        setView("days");
                      }}
                      className={cn("h-10 rounded-xl text-sm transition-colors", isCur ? "btn-glow font-semibold" : "hover:bg-surface-2")}
                    >
                      {name.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <button type="button" onClick={() => choose(addDays(today, -1))} className="rounded-lg px-2.5 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
                Ontem
              </button>
              <button type="button" onClick={() => choose(today)} className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft">
                Hoje
              </button>
            </div>
          </P.Content>
        </P.Portal>
      </P.Root>
    </>
  );
}
