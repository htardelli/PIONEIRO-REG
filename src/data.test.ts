import { describe, expect, it } from 'vitest'
import { monthCard, planDelta, yearStats, type YearData } from './data'
import type { DayItem, MonthRecord } from './types'

const H = 60
const today = new Date(2026, 9, 7) // 07/10/2026 — AS 2027, mês atual = outubro
const goal = (month: string, h: number): MonthRecord => ({ user_id: 'u', month, goal_min: h * H, bible_studies: 0, justification: '' })
let n = 0
const item = (date: string, h: number): DayItem => ({ id: String(++n), user_id: 'u', date, modality_id: 'm', minutes: h * H })
const data = (p: Partial<YearData>): YearData => ({
  userId: 'u', sy: 2027, profile: null, modalities: [], notes: [], events: [], eventTypes: [], credits: [], records: [], plan: [], entries: [], ...p,
})
const month = (d: YearData, m: string) => yearStats(d, today).months.find((x) => x.month === m)!

describe('alvo do mês: plano > meta > rateio', () => {
  it('plano sobrepõe a meta', () => {
    const d = data({ records: [goal('2026-10', 50)], plan: [item('2026-10-13', 30)], entries: [item('2026-10-02', 30)] })
    expect(month(d, '2026-10')).toMatchObject({ target: 30 * H, targetKind: 'plano', status: 'ok' })
  })
  it('sem plano usa a meta cadastrada', () => {
    const d = data({ records: [goal('2026-11', 40)] })
    expect(month(d, '2026-11')).toMatchObject({ target: 40 * H, targetKind: 'meta' })
  })
  it('sem plano e sem meta: rateio do que falta pelos meses livres', () => {
    // set: 55 h feitas (encerrado). out: plano 52. nov: meta 48. Restam 9 meses livres (dez..ago).
    const d = data({
      entries: [item('2026-09-10', 55)], plan: [item('2026-10-13', 52)], records: [goal('2026-11', 48)],
    })
    const ys = yearStats(d, today)
    expect(ys.committed).toBe((55 + 52 + 48) * H)
    expect(ys.freeMonths).toBe(9)
    expect(ys.share).toBeCloseTo(((600 - 155) * H) / 9)
    expect(month(d, '2027-03')).toMatchObject({ targetKind: 'rateio' })
    expect(month(d, '2027-03').target).toBeCloseTo(((600 - 155) * H) / 9)
  })
  it('mês encerrado sem plano e sem meta não entra no rateio', () => {
    const d = data({ entries: [item('2026-09-10', 20)] })
    expect(month(d, '2026-09')).toMatchObject({ targetKind: 'rateio', target: 0, status: 'ok' })
    expect(monthCard(month(d, '2026-09'), today).note).toBe('sem plano/meta')
    expect(yearStats(d, today).freeMonths).toBe(11)
  })
  it('totais do planejamento anual', () => {
    const d = data({ plan: [item('2026-10-13', 30), item('2026-11-03', 20)] })
    const ys = yearStats(d, today)
    expect(ys.plannedSum).toBe(50 * H)
    expect(ys.plannedMonths).toBe(2)
  })
})

describe('card do mês', () => {
  it('mês atual abaixo do plano: ▼ faltam', () => {
    const d = data({ plan: [item('2026-10-13', 52)], entries: [item('2026-10-02', 4.5)] })
    expect(monthCard(month(d, '2026-10'), today)).toEqual({ status: 'now', target: 52 * H, kind: 'plano', note: '▼ faltam 47:30' })
  })
  it('mês encerrado acima do plano: ▲ e verde', () => {
    const d = data({ plan: [item('2026-09-13', 50)], entries: [item('2026-09-02', 55)] })
    expect(monthCard(month(d, '2026-09'), today)).toMatchObject({ status: 'ok', note: '▲ +05:00' })
  })
  it('mês encerrado abaixo do plano: vermelho', () => {
    const d = data({ plan: [item('2026-09-13', 50)], entries: [item('2026-09-02', 40)] })
    expect(monthCard(month(d, '2026-09'), today).status).toBe('bad')
  })
  it('mês futuro: sem ícone', () => {
    const d = data({ plan: [item('2026-11-03', 48)] })
    expect(monthCard(month(d, '2026-11'), today)).toEqual({ status: 'future', target: 48 * H, kind: 'plano', note: '' })
  })
})

describe('ícones', () => {
  it('coberto, acima e abaixo', () => {
    expect(planDelta(52 * H, 52 * H)).toBe('✓ coberto')
    expect(planDelta(55 * H, 52 * H)).toBe('▲ +03:00')
    expect(planDelta(8 * H, 52 * H)).toBe('▼ faltam 44:00')
  })
})

import { dayState } from './data'

describe('falta só na atividade conjunta', () => {
  const plan: DayItem[] = [
    { id: 'a', user_id: 'u', date: '2026-10-05', modality_id: 'm', minutes: 2 * H, group_id: 'g1' },
    { id: 'b', user_id: 'u', date: '2026-10-05', modality_id: 'm', minutes: 1 * H },
  ]
  const absent: DayItem = { id: 'x', user_id: 'u', date: '2026-10-05', modality_id: 'm', minutes: 0, group_id: 'g1', absent: true }
  it('dia com outra atividade ainda pendente não conta como lançado', () => {
    expect(dayState(data({ plan, entries: [absent] }), '2026-10-05', today)).toMatchObject({ logged: false, state: 'miss' })
  })
  it('dia só com a atividade conjunta faltada conta como lançado (falta)', () => {
    expect(dayState(data({ plan: [plan[0]], entries: [absent] }), '2026-10-05', today)).toMatchObject({ logged: true, state: 'miss' })
  })
  it('lançando a outra atividade o dia fica feito (a atividade faltada sai do plano)', () => {
    const e: DayItem = { id: 'y', user_id: 'u', date: '2026-10-05', modality_id: 'm', minutes: 1 * H }
    expect(dayState(data({ plan, entries: [absent, e] }), '2026-10-05', today)).toMatchObject({ logged: true, state: 'done', planned: 1 * H, absentMin: 2 * H })
  })
})

import { pairDay } from './data'

describe('detalhe do dia: plano × realizado na mesma linha', () => {
  const it_ = (id: string, mod: string, min: number, start: string, extra: Partial<DayItem> = {}): DayItem =>
    ({ id, user_id: 'u', date: '2026-10-06', modality_id: mod, minutes: min, start_time: start, ...extra })
  it('pareia por atividade conjunta e por modalidade; sobras ficam sozinhas', () => {
    const plan = [it_('p1', 'casa', 90, '08:30'), it_('p2', 'tpl', 120, '18:15', { group_id: 'g' }), it_('p3', 'carta', 60, '14:00')]
    const done = [it_('e2', 'tpl', 105, '18:15', { group_id: 'g' }), it_('e1', 'casa', 60, '08:30'), it_('e4', 'inf', 30, '12:00')]
    expect(pairDay(plan, done).map((r) => `${r.plan?.id ?? '-'}/${r.done?.id ?? '-'}`)).toEqual(['p1/e1', '-/e4', 'p3/-', 'p2/e2'])
  })
})

import { absencesOf, planVsDone } from './data'

describe('falta zera o planejado (mantendo a justificativa)', () => {
  const p = (id: string, date: string, h: number, g?: string): DayItem => ({ id, user_id: 'u', date, modality_id: 'm', minutes: h * H, group_id: g })
  const plan = [p('a', '2026-10-05', 2), p('b', '2026-10-06', 3), p('c', '2026-10-07', 2)]
  const notes = [{ user_id: 'u', date: '2026-10-05', note: 'Faltei · Saúde' }]
  const entries = [item('2026-10-06', 3)]
  it('o dia faltado não entra no planejado do mês nem no Realizado × planejado', () => {
    const d = data({ plan, notes, entries })
    expect(month(d, '2026-10').planned).toBe(5 * H) // 3 (dia 6) + 2 (dia 7); o dia 5 zerou
    expect(dayState(d, '2026-10-05', today)).toMatchObject({ state: 'miss', planned: 0, absentMin: 2 * H, logged: true })
    const r = planVsDone(d, '2026-10', today)
    expect(r.planned).toBe(3 * H) // até hoje: dia 6 (dia 7 = hoje, ainda não lançado)
    expect(r.acts.miss).toBe(1)
  })
  it('dia passado não lançado continua contando o plano (pendente, não é falta)', () => {
    const d = data({ plan: [p('a', '2026-10-05', 2)] })
    expect(month(d, '2026-10').planned).toBe(2 * H)
  })
  it('histórico das faltas com o motivo', () => {
    const d = data({ plan, notes, entries })
    expect(absencesOf(d)).toEqual([{ date: '2026-10-05', planned: 2 * H, reason: 'Faltei · Saúde', joint: false }])
  })
})

describe('contagem por atividade planejada', () => {
  it('cumprida, parcial e falta contam cada atividade do dia', () => {
    const p = (id: string, mod: string, h: number, g?: string): DayItem => ({ id, user_id: 'u', date: '2026-10-05', modality_id: mod, minutes: h * H, group_id: g })
    const e = (id: string, mod: string, h: number): DayItem => ({ id, user_id: 'u', date: '2026-10-05', modality_id: mod, minutes: h * H })
    const d = data({
      plan: [p('a', 'casa', 2), p('b', 'tpl', 2), p('c', 'carta', 1), { ...p('x', 'casa', 1.5), date: '2026-10-06' }],
      entries: [e('1', 'casa', 2), e('2', 'tpl', 1.5)],
    })
    const r = planVsDone(d, '2026-10', today)
    expect(r.acts).toEqual({ done: 1, part: 1, miss: 1, pending: 1 }) // dia 5: casa ✓, tpl ◐, carta ✗; dia 6 não lançado
  })
})

import { closedMonthPace } from './data'

describe('alerta de ritmo só no mês fechado', () => {
  it('mês atual não alerta; mês fechado compara o acumulado com o ritmo ideal no último dia', () => {
    const d = data({ entries: [item('2026-09-10', 40)] })
    expect(closedMonthPace(d, '2026-10', today)).toBeNull()
    const p = closedMonthPace(d, '2026-09', today)!
    expect(p.cum).toBe(40 * H)
    expect(p.ideal).toBeCloseTo((36000 * 30) / 365) // 30 de 365 dias de 600 h ≈ 49:19
    expect(p.cum < p.ideal).toBe(true)
  })
})
