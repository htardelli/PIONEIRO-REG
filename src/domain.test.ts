import { describe, expect, it } from 'vitest'
import {
  blockErrors, blocksSignature, toBlocks, countedMinutes, deleteRange, idealPace, weekDates, type TimeBlock, monthStatus, neededPerMonth, repeatDates, serviceYearMonths, serviceYearOf, fmtH, fmtHours, parseHM,
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
    expect(fmtH(90)).toBe('01:30')
    expect(fmtH(-60)).toBe('−01:00')
    expect(fmtH(600 * 60)).toBe('600:00')
  })
  it('fmtHours em hh:mm', () => expect(fmtHours(49.5 * H)).toBe('49:30'))
  it('parseHM', () => { expect(parseHM('50')).toBe(3000); expect(parseHM('7:05')).toBe(425); expect(parseHM('')).toBe(0); expect(parseHM('7,5')).toBe(null) })
})

describe('horários do plano', () => {
  const b = (start: string, end: string, m = 'x'): TimeBlock => ({ modality_id: m, start, end })
  it('sem conflito quando encostam', () => {
    expect(blockErrors([b('08:00', '10:00'), b('10:00', '11:00')])).toEqual({})
  })
  it('detecta sobreposição nos dois blocos', () => {
    const e = blockErrors([b('08:00', '10:00'), b('09:30', '11:00')])
    expect(Object.keys(e)).toEqual(['0', '1'])
  })
  it('fim antes do início', () => {
    expect(blockErrors([b('10:00', '09:00')])[0]).toMatch(/fim/)
  })
})

describe('exclusão do plano', () => {
  it('semana de domingo a sábado', () => {
    expect(weekDates('2026-10-07')).toEqual(['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'])
  })
  it('ano preserva passado por padrão', () => {
    expect(deleteRange('2026-10-20', 'year', '2026-10-07', false)).toEqual(['2026-10-07', '2027-08-31'])
    expect(deleteRange('2026-10-20', 'year', '2026-10-07', true)).toEqual(['2026-09-01', '2027-08-31'])
  })
  it('mês e dia', () => {
    expect(deleteRange('2026-11-15', 'month', '2026-10-07', false)).toEqual(['2026-11-01', '2026-11-30'])
    expect(deleteRange('2026-10-01', 'day', '2026-10-07', false)).toEqual(['2026-10-01', '2026-10-01'])
  })
})

describe('blocos a partir de itens', () => {
  it('itens antigos sem horário ganham sequência a partir de 08:00', () => {
    expect(toBlocks([{ modality_id: 'a', minutes: 90 }, { modality_id: 'b', minutes: 60 }])).toEqual([
      { modality_id: 'a', start: '08:00', end: '09:30' }, { modality_id: 'b', start: '09:30', end: '10:30' },
    ])
  })
  it('usa os horários gravados (HH:MM:SS do banco)', () => {
    expect(toBlocks([{ modality_id: 'a', minutes: 60, start_time: '14:00:00', end_time: '15:00:00' }])).toEqual([
      { modality_id: 'a', start: '14:00', end: '15:00' },
    ])
  })
  it('assinatura independe da ordem', () => {
    const x = { modality_id: 'a', start: '08:00', end: '09:00' }, y = { modality_id: 'b', start: '09:00', end: '10:00' }
    expect(blocksSignature([x, y])).toBe(blocksSignature([y, x]))
  })
})

import { easter, holidayOf, isoDate as iso } from './domain'

describe('feriados', () => {
  it('Páscoa e móveis', () => {
    expect(iso(easter(2027))).toBe('2027-03-28')
    expect(holidayOf('2027-03-26')).toMatchObject({ name: 'Sexta-feira Santa', kind: 'nacional' })
    expect(holidayOf('2027-02-09')).toMatchObject({ name: 'Carnaval', kind: 'facultativo' })
    expect(holidayOf('2027-05-27')).toMatchObject({ name: 'Corpus Christi', kind: 'facultativo' })
  })
  it('fixos nacionais e do Ceará', () => {
    expect(holidayOf('2026-10-12')?.name).toBe('Nossa Senhora Aparecida')
    expect(holidayOf('2026-11-20')?.kind).toBe('nacional')
    expect(holidayOf('2027-03-25')).toMatchObject({ name: 'Data Magna do Ceará', kind: 'estadual' })
    expect(holidayOf('2026-10-13')).toBeUndefined()
  })
})
