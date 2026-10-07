import { describe, expect, it } from 'vitest'
import { monthCard, planDelta, type MonthStats } from './data'

const H = 60
const today = new Date(2026, 9, 7) // 07/10/2026
const ms = (month: string, counted: number, planned: number, goal = 50 * H): MonthStats => ({
  month, goal, ministry: counted, credit: 0, creditUsed: 0, creditLost: 0, counted, planned,
  status: 'now', studies: 0, justification: '',
})

describe('card do mês', () => {
  it('mês atual com plano: plano e falta', () => {
    expect(monthCard(ms('2026-10', 4.5 * H, 52 * H), today, 54.5 * H)).toEqual({ status: 'now', lines: ['plano', '52', '▼ 47,5'] })
  })
  it('plano coberto fica verde', () => {
    expect(monthCard(ms('2026-10', 52 * H, 52 * H), today, 54.5 * H)).toEqual({ status: 'ok', lines: ['plano', '52', '✓ coberto'] })
  })
  it('mês encerrado abaixo do plano fica vermelho', () => {
    expect(monthCard(ms('2026-09', 40 * H, 50 * H), today, 54.5 * H).status).toBe('bad')
  })
  it('mês futuro com plano mostra só o plano', () => {
    expect(monthCard(ms('2026-11', 0, 48 * H), today, 54.5 * H)).toEqual({ status: 'future', lines: ['plano', '48', ''] })
  })
  it('sem plano (atual/futuro) mostra a média necessária', () => {
    expect(monthCard(ms('2026-12', 0, 0), today, 54.5 * H)).toEqual({ status: 'future', lines: ['precisa', '54,5', ''] })
    expect(monthCard(ms('2026-10', 4.3 * H, 0), today, 54.5 * H)).toEqual({ status: 'now', lines: ['precisa', '54,5', ''] })
  })
  it('mês encerrado sem plano', () => {
    expect(monthCard(ms('2026-09', 15 * H, 0), today, 54.5 * H)).toEqual({ status: 'bad', lines: ['sem', 'plano', ''] })
  })
})

describe('ícones do plano', () => {
  it('coberto, acima e abaixo', () => {
    expect(planDelta(52 * H, 52 * H)).toBe('✓ coberto')
    expect(planDelta(55 * H, 52 * H)).toBe('▲ +3')
    expect(planDelta(8 * H, 52 * H)).toBe('▼ 44')
  })
  it('mês encerrado acima do plano fica verde com ▲', () => {
    expect(monthCard(ms('2026-09', 55 * H, 50 * H), today, 54.5 * H)).toEqual({ status: 'ok', lines: ['plano', '50', '▲ +5'] })
  })
})
