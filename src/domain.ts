// Regras de negócio do Pioneiro-REG. Tudo em minutos (inteiros) para evitar erro de arredondamento.

export const MONTHLY_CAP_MIN = 55 * 60 // S-236 §11: ministério + crédito ≤ 55 h/mês

/** "YYYY-MM-DD" no fuso local */
export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Ano de serviço: setembro a agosto, nomeado pelo ano em que termina. */
export function serviceYearOf(d: Date): number {
  return d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear()
}

/** Os 12 meses ("YYYY-MM") do ano de serviço, de setembro a agosto. */
export function serviceYearMonths(sy: number): string[] {
  const out: string[] = []
  for (let i = 0; i < 12; i++) {
    const m = (8 + i) % 12
    const y = i < 4 ? sy - 1 : sy
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`)
  }
  return out
}

export function monthKey(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 7) : isoDate(d).slice(0, 7)
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/**
 * Horas que contam para o mês: o ministério conta integralmente; o crédito só
 * completa até o teto de 55 h. Crédito excedente é perdido (não transfere).
 */
export function countedMinutes(ministry: number, credit: number) {
  const creditUsed = Math.max(0, Math.min(credit, MONTHLY_CAP_MIN - ministry))
  return { counted: ministry + creditUsed, creditUsed, creditLost: credit - creditUsed }
}

export type MonthStatus = 'ok' | 'bad' | 'now' | 'future'

/** Verde: atingiu a meta (mesmo em andamento). Vermelho: mês encerrado abaixo. Amarelo: em andamento. Cinza: a vir. */
export function monthStatus(month: string, today: Date, counted: number, goal: number): MonthStatus {
  const cur = monthKey(today)
  if (month > cur) return 'future'
  if (goal > 0 && counted >= goal) return 'ok'
  return month < cur ? 'bad' : 'now'
}

/** Ritmo linear ideal (minutos) até o fim do dia `today` dentro do ano de serviço. */
export function idealPace(goalMin: number, sy: number, today: Date): number {
  const start = new Date(sy - 1, 8, 1)
  const end = new Date(sy, 8, 1)
  const total = Math.round((end.getTime() - start.getTime()) / 86400000)
  const elapsed = Math.min(total, Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000) + 1))
  return (goalMin * elapsed) / total
}

export function daysLeftInYear(sy: number, today: Date): number {
  const end = new Date(sy, 7, 31)
  return Math.max(0, Math.round((end.getTime() - today.getTime()) / 86400000))
}

/** Média mensal necessária nos meses restantes (incluindo o atual), a partir do que já foi feito. */
export function neededPerMonth(goalMin: number, doneMin: number, sy: number, today: Date): number {
  const months = serviceYearMonths(sy)
  const idx = months.indexOf(monthKey(today))
  const remaining = idx < 0 ? 0 : 12 - idx
  if (remaining === 0) return 0
  return Math.max(0, goalMin - doneMin) / remaining
}

/** "2h30", "0h45" */
export function fmtH(min: number): string {
  const sign = min < 0 ? '−' : ''
  const a = Math.round(Math.abs(min))
  return `${sign}${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`
}

/** "49,5" (horas com 1 casa decimal, sem zeros inúteis) */
export function fmtHours(min: number): string {
  const h = Math.round((min / 60) * 10) / 10
  return h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

/** Datas do mesmo dia da semana: no mês do dia, ou no ano de serviço inteiro (a partir do dia). */
export function repeatDates(date: string, scope: 'day' | 'month' | 'year'): string[] {
  if (scope === 'day') return [date]
  const d = parseIso(date)
  const out: string[] = []
  if (scope === 'month') {
    const first = new Date(d.getFullYear(), d.getMonth(), 1)
    for (let x = new Date(first); x.getMonth() === d.getMonth(); x.setDate(x.getDate() + 1))
      if (x.getDay() === d.getDay()) out.push(isoDate(x))
  } else {
    const end = new Date(serviceYearOf(d), 7, 31)
    for (let x = new Date(d); x <= end; x.setDate(x.getDate() + 7)) out.push(isoDate(x))
  }
  return out
}

export const MONTH_ABBR = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
export const MONTH_NAME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const WEEKDAY = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const WEEKDAY_PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados']

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAME[m - 1]} ${y}`
}

export const DEFAULT_MODALITIES: { name: string; color: string }[] = [
  { name: 'Cartas', color: '#C98A06' },
  { name: 'TPE · Display', color: '#7A4FC2' },
  { name: 'TPE · Carrinho', color: '#9B72D6' },
  { name: 'TPL · Display', color: '#0E9AA7' },
  { name: 'TPL · Carrinho', color: '#3FB8C2' },
  { name: 'Casa em Casa', color: '#2E75B6' },
  { name: 'Telefone', color: '#5B6880' },
  { name: 'Estudo', color: '#D35D8C' },
  { name: 'Revisita', color: '#1E8E5A' },
  { name: 'Informal', color: '#E07B39' },
  { name: 'Outros', color: '#97A3B6' },
]

export const CREDIT_TYPES = [
  'LDC / Construção',
  'Assembleia / Congresso',
  'Escola teocrática',
  'Betel',
  'COLIH / GVP',
  'Ajuda humanitária',
  'Outra atividade aprovada',
]
