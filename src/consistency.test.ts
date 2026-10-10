import { describe, expect, it } from 'vitest'
import { dayState, monthStats, planVsDone, yearStats, yearRange, type YearData } from './data'
import { buildDemoData, DEMO_ME } from './demo'
import { daysInMonth, isoDate, serviceYearOf } from './domain'

/** Os mesmos números aparecem no Painel (yearStats/planVsDone), no Mês (dayState) e no Relatório (monthStats): têm de bater. */
function yearData(today: Date): YearData {
  const db = buildDemoData(today) as unknown as Record<string, Record<string, unknown>[]>
  const sy = serviceYearOf(today)
  const [from, to] = yearRange(sy)
  const mine = (t: string) => (db[t] ?? []).filter((r) => r.user_id === DEMO_ME)
  const inYear = (t: string) => mine(t).filter((r) => String(r.date) >= from && String(r.date) <= to)
  return {
    userId: DEMO_ME, sy, profile: (db.profiles.find((p) => p.id === DEMO_ME) ?? null) as never,
    modalities: mine('modalities') as never, records: mine('month_records') as never, plan: inYear('plan_items') as never,
    entries: inYear('entries') as never, notes: inYear('day_notes') as never, events: inYear('day_events') as never,
    eventTypes: mine('event_types') as never, credits: mine('credits') as never,
  }
}
const datesOf = (month: string) => Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)

for (const t of [new Date(2026, 9, 10), new Date(2027, 2, 15), new Date(2027, 7, 31)]) {
  describe(`consistência dos indicadores · hoje ${isoDate(t)}`, () => {
    const d = yearData(t)
    const ys = yearStats(d, t)

    it('há dados para testar', () => {
      expect(d.entries.length).toBeGreaterThan(0)
      expect(d.plan.length).toBeGreaterThan(0)
    })
    it('total do ano = soma dos meses', () => {
      expect(ys.total).toBe(ys.months.reduce((a, m) => a + m.counted, 0))
      expect(ys.plannedSum).toBe(ys.months.reduce((a, m) => a + m.planned, 0))
    })
    it('cada mês = soma dos seus dias (Mês × Relatório × Painel)', () => {
      for (const m of ys.months) {
        const days = datesOf(m.month).map((x) => dayState(d, x, t))
        expect(days.reduce((a, s) => a + s.done, 0), `realizado ${m.month}`).toBe(m.ministry)
        expect(days.reduce((a, s) => a + s.planned, 0), `planejado ${m.month}`).toBe(m.planned)
        const r = monthStats(d, m.month, t) // Relatório
        expect([r.ministry, r.counted, r.planned, r.credit], `relatório ${m.month}`).toEqual([m.ministry, m.counted, m.planned, m.credit])
      }
    })
    it('crédito nunca passa do teto de 55 h com o ministério', () => {
      for (const m of ys.months) expect(m.counted).toBeLessThanOrEqual(Math.max(55 * 60, m.ministry))
    })
    it('realizado × planejado (até hoje) = soma dos dias até hoje', () => {
      const month = isoDate(t).slice(0, 7)
      const pvd = planVsDone(d, month, t)
      const upTo = datesOf(month).filter((x) => x <= isoDate(t)).map((x) => dayState(d, x, t))
      expect(pvd.done).toBe(upTo.reduce((a, s) => a + s.done, 0))
      expect(pvd.planned).toBe(upTo.reduce((a, s) => a + s.planned, 0))
      const acts = d.plan.filter((p) => p.date.startsWith(month) && p.date <= isoDate(t)).length
      expect(pvd.acts.done + pvd.acts.part + pvd.acts.miss + pvd.acts.pending, 'cada atividade planejada em um só status').toBe(acts)
    })
    it('meses encerrados: realizado × planejado = card do mês', () => {
      for (const m of ys.months.filter((x) => x.month < isoDate(t).slice(0, 7))) {
        const pvd = planVsDone(d, m.month, t)
        expect([pvd.done, pvd.planned], m.month).toEqual([m.ministry, m.planned])
      }
    })
  })
}
