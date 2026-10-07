import { describe, expect, it } from 'vitest'
import { monthCard, planDelta, type MonthStats } from './data'

const H = 60
const today = new Date(2026, 9, 7) // 07/10/2026
const ms = (month: string, counted: number, planned: number, goal = 50 * H): MonthStats => ({
  month, goal, ministry: counted, credit: 0, creditUsed: 0, creditLost: 0, counted, planned,
  target: planned > 0 ? planned : goal, targetKind: planned > 0 ? 'plano' : 'meta', status: 'now', studies: 0, justification: '',
})

describe('linha do mês', () => {
  it('mês atual com plano: faltam', () => {
    expect(monthCard(ms('2026-10', 4.5 * H, 52 * H), today, 54.5 * H)).toEqual({ status: 'now', target: 52 * H, kind: 'plano', note: '▼ faltam 47,5' })
  })
  it('plano coberto fica verde', () => {
    expect(monthCard(ms('2026-10', 52 * H, 52 * H), today, 54.5 * H)).toMatchObject({ status: 'ok', note: '✓ coberto' })
  })
  it('mês encerrado abaixo do plano fica vermelho', () => {
    expect(monthCard(ms('2026-09', 40 * H, 50 * H), today, 54.5 * H).status).toBe('bad')
  })
  it('mês encerrado acima do plano: ▲', () => {
    expect(monthCard(ms('2026-09', 55 * H, 50 * H), today, 54.5 * H)).toMatchObject({ status: 'ok', note: '▲ +5' })
  })
  it('mês futuro com plano mostra só o plano', () => {
    expect(monthCard(ms('2026-11', 0, 48 * H), today, 54.5 * H)).toEqual({ status: 'future', target: 48 * H, kind: 'plano', note: '' })
  })
  it('sem plano (atual/futuro): média necessária', () => {
    expect(monthCard(ms('2026-12', 0, 0), today, 54.5 * H)).toMatchObject({ status: 'future', kind: 'precisa', target: 54.5 * H })
    expect(monthCard(ms('2026-10', 4.3 * H, 0), today, 54.5 * H)).toMatchObject({ status: 'now', kind: 'precisa' })
  })
  it('mês encerrado sem plano compara com a meta', () => {
    expect(monthCard(ms('2026-09', 15 * H, 0), today, 54.5 * H)).toEqual({ status: 'bad', target: 50 * H, kind: 'meta', note: 'sem plano' })
  })
})

describe('ícones do plano', () => {
  it('coberto, acima e abaixo', () => {
    expect(planDelta(52 * H, 52 * H)).toBe('✓ coberto')
    expect(planDelta(55 * H, 52 * H)).toBe('▲ +3')
    expect(planDelta(8 * H, 52 * H)).toBe('▼ faltam 44')
  })
})

import { monthStats, yearStats, type YearData } from './data'

describe('plano sobrepõe a meta', () => {
  const base: YearData = {
    userId: 'u', sy: 2027, profile: null, modalities: [], notes: [], credits: [],
    records: [{ user_id: 'u', month: '2026-10', goal_min: 50 * H, bible_studies: 0, justification: '' }],
    plan: [{ id: 'p', user_id: 'u', date: '2026-10-13', modality_id: 'm', minutes: 30 * H }],
    entries: [{ id: 'e', user_id: 'u', date: '2026-10-02', modality_id: 'm', minutes: 30 * H }],
  }
  it('mês com plano usa o plano como alvo (não a meta)', () => {
    const m = monthStats(base, '2026-10', today)
    expect(m).toMatchObject({ target: 30 * H, targetKind: 'plano', status: 'ok' }) // 30h feitas = plano de 30h
  })
  it('mês sem plano usa a meta', () => {
    expect(monthStats(base, '2026-11', today)).toMatchObject({ target: 50 * H, targetKind: 'meta' })
  })
  it('totais do ano: planejado e alvos', () => {
    const ys = yearStats(base, today)
    expect(ys.plannedSum).toBe(30 * H)
    expect(ys.plannedMonths).toBe(1)
    expect(ys.targetsSum).toBe(30 * H + 11 * 50 * H)
  })
})
