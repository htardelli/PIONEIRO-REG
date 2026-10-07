import { describe, expect, it } from 'vitest'
import {
  countedMinutes, idealPace, monthStatus, neededPerMonth, repeatDates, serviceYearMonths, serviceYearOf, fmtH, fmtHours,
} from './domain'

const H = 60

describe('ano de serviço', () => {
  it('setembro inicia o ano seguinte', () => {
    expect(serviceYearOf(new Date(2026, 8, 1))).toBe(2027)
    expect(serviceYearOf(new Date(2026, 9, 7))).toBe(2027)
    expect(serviceYearOf(new Date(2027, 7, 31))).toBe(2027)
    expect(serviceYearOf(new Date(2026, 7, 31))).toBe(2026)
  })
  it('lista set..ago', () => {
    const m = serviceYearMonths(2027)
    expect(m[0]).toBe('2026-09')
    expect(m[3]).toBe('2026-12')
    expect(m[4]).toBe('2027-01')
    expect(m[11]).toBe('2027-08')
  })
})

describe('teto de 55 h', () => {
  it('crédito completa até 55', () => {
    expect(countedMinutes(47 * H, 10 * H)).toEqual({ counted: 55 * H, creditUsed: 8 * H, creditLost: 2 * H })
  })
  it('sem excedente', () => {
    expect(countedMinutes(40 * H, 5 * H)).toEqual({ counted: 45 * H, creditUsed: 5 * H, creditLost: 0 })
  })
  it('ministério acima de 55 conta inteiro, crédito zera', () => {
    expect(countedMinutes(60 * H, 4 * H)).toEqual({ counted: 60 * H, creditUsed: 0, creditLost: 4 * H })
  })
})

describe('status do mês', () => {
  const today = new Date(2026, 9, 7)
  it('passado acima = ok, abaixo = bad', () => {
    expect(monthStatus('2026-09', today, 55 * H, 50 * H)).toBe('ok')
    expect(monthStatus('2026-09', today, 40 * H, 50 * H)).toBe('bad')
  })
  it('atual em andamento = now, atingido = ok', () => {
    expect(monthStatus('2026-10', today, 9 * H, 52 * H)).toBe('now')
    expect(monthStatus('2026-10', today, 52 * H, 52 * H)).toBe('ok')
  })
  it('futuro', () => expect(monthStatus('2026-11', today, 0, 50 * H)).toBe('future'))
})

describe('ritmo e necessidade', () => {
  it('ritmo no último dia = meta', () => {
    expect(idealPace(600 * H, 2027, new Date(2027, 7, 31))).toBeCloseTo(600 * H)
  })
  it('necessário por mês em outubro', () => {
    expect(neededPerMonth(600 * H, 55 * H, 2027, new Date(2026, 9, 7)) / H).toBeCloseTo(49.545, 2)
  })
})

describe('repetição', () => {
  it('terças de outubro/2026', () => {
    expect(repeatDates('2026-10-06', 'month')).toEqual(['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27'])
  })
  it('ano: do dia até 31/ago', () => {
    const r = repeatDates('2026-10-06', 'year')
    expect(r[0]).toBe('2026-10-06')
    expect(r.at(-1)! <= '2027-08-31').toBe(true)
    expect(r.length).toBe(48)
  })
})

describe('formatação', () => {
  it('fmtH', () => {
    expect(fmtH(90)).toBe('1h30')
    expect(fmtH(-60)).toBe('−1h00')
  })
  it('fmtHours', () => expect(fmtHours(49.5 * H)).toBe('49,5'))
})
