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
/** Horas no formato hh:mm — "07:30", "55:48", "−01:00" (minutos arredondados). */
export function fmtH(min: number): string {
  const sign = min < 0 ? '−' : ''
  const a = Math.round(Math.abs(min))
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`
}

/** Lê "50", "50:30" ou "7:05" → minutos (null se inválido; vazio → 0). */
export function parseHM(txt: string): number | null {
  const t = txt.trim()
  if (!t) return 0
  const m = /^(\d{1,3})(?::([0-5]\d))?$/.exec(t)
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : null
}

/** Totais de horas — mesmo formato hh:mm (sem horas decimais). */
export const fmtHours = fmtH

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

// ---------- Horários do planejamento ----------
export interface TimeBlock {
  modality_id: string
  start: string // HH:MM
  end: string // HH:MM
  group_id?: string | null // atividade conjunta
  with?: string[] // ids dos participantes (além de mim)
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function fromMinutes(min: number): string {
  const c = Math.max(0, Math.min(23 * 60 + 59, min))
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`
}

export function blockMinutes(b: TimeBlock): number {
  return Math.max(0, toMinutes(b.end) - toMinutes(b.start))
}

/** Erros por bloco (índice → mensagem): fim antes do início ou sobreposição com outro bloco do mesmo dia. */
export function blockErrors(blocks: TimeBlock[], nameOf: (id: string) => string = () => ''): Record<number, string> {
  const errs: Record<number, string> = {}
  blocks.forEach((b, i) => {
    if (!b.modality_id) errs[i] = 'Escolha a modalidade'
    else if (!b.start || !b.end) errs[i] = 'Informe início e fim'
    else if (toMinutes(b.end) <= toMinutes(b.start)) errs[i] = 'O fim deve ser depois do início'
  })
  const valid = blocks.map((_, i) => !errs[i])
  blocks.forEach((a, i) => {
    if (!valid[i]) return
    blocks.forEach((b, j) => {
      if (i === j || !valid[j] || errs[i]) return
      if (toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end))
        errs[i] = `Conflita com ${nameOf(b.modality_id) || 'outra atividade'} (${b.start}–${b.end})`
    })
  })
  return errs
}

/** Datas (domingo a sábado) da semana do dia. */
/** Posição do dia numa semana que começa na segunda (seg=0 … dom=6). */
export const mondayIndex = (d: Date) => (d.getDay() + 6) % 7
export const WEEK_HEAD = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

export function weekDates(date: string): string[] {
  const d = parseIso(date)
  const start = new Date(d)
  start.setDate(d.getDate() - mondayIndex(d)) // semana de segunda a domingo
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start)
    x.setDate(start.getDate() + i)
    return isoDate(x)
  })
}

export type DeleteScope = 'day' | 'week' | 'month' | 'year'

/** Intervalo [de, até] a excluir; dias passados só entram se `includePast` (o dia escolhido sempre entra). */
export function deleteRange(date: string, scope: DeleteScope, today: string, includePast: boolean): [string, string] {
  if (scope === 'day') return [date, date]
  let from: string, to: string
  if (scope === 'week') {
    const w = weekDates(date); from = w[0]; to = w[6]
  } else if (scope === 'month') {
    from = `${date.slice(0, 7)}-01`; to = `${date.slice(0, 7)}-${String(daysInMonth(date.slice(0, 7))).padStart(2, '0')}`
  } else {
    const sy = serviceYearOf(parseIso(date)); from = `${sy - 1}-09-01`; to = `${sy}-08-31`
  }
  if (!includePast && today > from) from = today
  return [from, to]
}

/** Converte itens (plano/realizado) em blocos de horário; itens antigos sem horário ganham horários em sequência a partir das 08:00. */
export function toBlocks(items: { modality_id: string; minutes: number; start_time?: string | null; end_time?: string | null; group_id?: string | null }[]): TimeBlock[] {
  let clock = 8 * 60
  return [...items]
    .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'))
    .map((p) => {
      const start = p.start_time?.slice(0, 5) ?? fromMinutes(clock)
      const end = p.end_time?.slice(0, 5) ?? fromMinutes(toMinutes(start) + p.minutes)
      clock = Math.max(clock, toMinutes(end))
      return p.group_id ? { modality_id: p.modality_id, start, end, group_id: p.group_id } : { modality_id: p.modality_id, start, end }
    })
}

/** Assinatura de um dia (para comparar planos): "mod|início|fim" ordenados. */
export function blocksSignature(blocks: TimeBlock[]): string {
  return blocks.map((b) => `${b.modality_id}|${b.start}|${b.end}`).sort().join(';')
}

// ---------- Feriados (nacionais + Ceará) ----------
export type HolidayKind = 'nacional' | 'estadual' | 'facultativo'
export interface Holiday { date: string; name: string; kind: HolidayKind }

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const holidayCache = new Map<number, Map<string, Holiday>>()

export function holidaysOf(year: number): Map<string, Holiday> {
  const hit = holidayCache.get(year)
  if (hit) return hit
  const p = easter(year)
  const rel = (n: number) => isoDate(new Date(p.getFullYear(), p.getMonth(), p.getDate() + n))
  const fixed = (md: string) => `${year}-${md}`
  const list: Holiday[] = [
    { date: fixed('01-01'), name: 'Confraternização Universal', kind: 'nacional' },
    { date: rel(-48), name: 'Carnaval', kind: 'facultativo' },
    { date: rel(-47), name: 'Carnaval', kind: 'facultativo' },
    { date: fixed('03-19'), name: 'São José (CE)', kind: 'estadual' },
    { date: fixed('03-25'), name: 'Data Magna do Ceará', kind: 'estadual' },
    { date: rel(-2), name: 'Sexta-feira Santa', kind: 'nacional' },
    { date: fixed('04-21'), name: 'Tiradentes', kind: 'nacional' },
    { date: fixed('05-01'), name: 'Dia do Trabalho', kind: 'nacional' },
    { date: rel(60), name: 'Corpus Christi', kind: 'facultativo' },
    { date: fixed('09-07'), name: 'Independência do Brasil', kind: 'nacional' },
    { date: fixed('10-12'), name: 'Nossa Senhora Aparecida', kind: 'nacional' },
    { date: fixed('11-02'), name: 'Finados', kind: 'nacional' },
    { date: fixed('11-15'), name: 'Proclamação da República', kind: 'nacional' },
    { date: fixed('11-20'), name: 'Consciência Negra', kind: 'nacional' },
    { date: fixed('12-25'), name: 'Natal', kind: 'nacional' },
  ]
  const map = new Map(list.map((h) => [h.date, h]))
  holidayCache.set(year, map)
  return map
}

export function holidayOf(date: string): Holiday | undefined {
  return holidaysOf(Number(date.slice(0, 4))).get(date)
}

export const HOLIDAY_LABEL: Record<HolidayKind, string> = { nacional: 'feriado nacional', estadual: 'feriado estadual', facultativo: 'ponto facultativo' }

// ---------- Eventos do dia (congresso, assembleia…) ----------
export const EVENT_KINDS = ['Congresso', 'Assembleia', 'Visita do SC', 'Celebração', 'Outro'] as const
export const eventName = (ev: { kind: string; title: string }) => (ev.title ? (ev.kind === 'Outro' ? ev.title : `${ev.kind} · ${ev.title}`) : ev.kind)
