import { describe, expect, it } from 'vitest'
import { monthCard, planDelta, yearStats, type YearData } from './data'
import type { DayItem, MonthRecord } from './types'

const H = 60
const today = new Date(2026, 9, 7) // 07/10/2026 — AS 2027, mês atual = outubro
const goal = (month: string, h: number): MonthRecord => ({ user_id: 'u', month, goal_min: h * H, bible_studies: 0, justification: '' })
let n = 0
const item = (date: string, h: number): DayItem => ({ id: String(++n), user_id: 'u', date, modality_id: 'm', minutes: h * H })
const data = (p: Partial<YearData>): YearData => ({
  userId: 'u', sy: 2027, profile: null, modalities: [], notes: [], events: [], credits: [], records: [], plan: [], entries: [], ...p,
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
  it('lançando a outra atividade o dia fica parcial', () => {
    const e: DayItem = { id: 'y', user_id: 'u', date: '2026-10-05', modality_id: 'm', minutes: 1 * H }
    expect(dayState(data({ plan, entries: [absent, e] }), '2026-10-05', today)).toMatchObject({ logged: true, state: 'part' })
  })
})
