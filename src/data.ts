import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import {
  fmtHours, countedMinutes, idealPace, isoDate, monthKey, monthStatus, neededPerMonth, serviceYearMonths, type MonthStatus,
} from './domain'
import type { Credit, DayItem, DayNote, Modality, MonthRecord, Profile } from './types'

export const DEFAULT_GOAL_MIN = 50 * 60

export interface YearData {
  userId: string
  sy: number
  profile: Profile | null
  modalities: Modality[]
  records: MonthRecord[]
  plan: DayItem[]
  entries: DayItem[]
  notes: DayNote[]
  credits: Credit[]
}

export function yearRange(sy: number): [string, string] {
  return [`${sy - 1}-09-01`, `${sy}-08-31`]
}

export async function loadYear(userId: string, sy: number): Promise<YearData> {
  const [from, to] = yearRange(sy)
  const months = serviceYearMonths(sy)
  const eq = { user_id: userId }
  const [profiles, modalities, records, plan, entries, notes, credits] = await Promise.all([
    api.select<Profile>('profiles', { eq: { id: userId } }),
    api.select<Modality>('modalities', { eq }),
    api.select<MonthRecord>('month_records', { eq, in: ['month', months] }),
    api.select<DayItem>('plan_items', { eq, range: ['date', from, to] }),
    api.select<DayItem>('entries', { eq, range: ['date', from, to] }),
    api.select<DayNote>('day_notes', { eq, range: ['date', from, to] }),
    api.select<Credit>('credits', { eq, in: ['month', months] }),
  ])
  modalities.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  return { userId, sy, profile: profiles[0] ?? null, modalities, records, plan, entries, notes, credits }
}

export function useYear(userId: string | null, sy: number) {
  const [data, setData] = useState<YearData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    if (!userId) return
    try {
      setData(await loadYear(userId, sy))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [userId, sy])
  useEffect(() => {
    setData(null)
    void reload()
  }, [reload])
  return { data, error, reload }
}

// ---------- Estatísticas ----------
const sum = (xs: { minutes: number }[]) => xs.reduce((a, x) => a + x.minutes, 0)

export interface MonthStats {
  month: string
  goal: number
  ministry: number
  credit: number
  creditUsed: number
  creditLost: number
  counted: number
  planned: number
  status: MonthStatus
  studies: number
  justification: string
}

export function monthStats(d: YearData, month: string, today: Date): MonthStats {
  const rec = d.records.find((r) => r.month === month)
  const ministry = sum(d.entries.filter((e) => e.date.startsWith(month)))
  const credit = sum(d.credits.filter((c) => c.month === month))
  const { counted, creditUsed, creditLost } = countedMinutes(ministry, credit)
  const goal = rec?.goal_min ?? DEFAULT_GOAL_MIN
  return {
    month, goal, ministry, credit, creditUsed, creditLost, counted,
    planned: sum(d.plan.filter((p) => p.date.startsWith(month))),
    status: monthStatus(month, today, counted, goal),
    studies: rec?.bible_studies ?? 0,
    justification: rec?.justification ?? '',
  }
}

export type PaceLevel = 'ok' | 'warn' | 'bad'

export interface YearStats {
  months: MonthStats[]
  total: number
  goal: number
  minGoal: number
  pace: number
  paceMin: number
  diff: number
  level: PaceLevel
  needed: number
  goalsSum: number
}

export function yearStats(d: YearData, today: Date): YearStats {
  const months = serviceYearMonths(d.sy).map((m) => monthStats(d, m, today))
  const total = months.reduce((a, m) => a + m.counted, 0)
  const goal = d.profile?.annual_goal_min ?? 36000
  const minGoal = d.profile?.min_goal_min ?? 33600
  const pace = idealPace(goal, d.sy, today)
  const paceMin = idealPace(minGoal, d.sy, today)
  // Necessidade mensal: o que falta, descontando só os meses já encerrados
  const cur = monthKey(today)
  const closed = months.filter((m) => m.month < cur).reduce((a, m) => a + m.counted, 0)
  return {
    months, total, goal, minGoal, pace, paceMin,
    diff: total - pace,
    level: total >= pace ? 'ok' : total >= paceMin ? 'warn' : 'bad',
    needed: neededPerMonth(goal, closed, d.sy, today),
    goalsSum: months.reduce((a, m) => a + m.goal, 0),
  }
}

export type DayState = 'done' | 'part' | 'miss' | 'plan' | 'none'

export function dayState(d: YearData, date: string, today: Date) {
  const planned = sum(d.plan.filter((p) => p.date === date))
  const done = sum(d.entries.filter((e) => e.date === date))
  const logged = done > 0 || d.notes.some((n) => n.date === date)
  const past = date < isoDate(today)
  let state: DayState = 'none'
  if (done > 0 && done >= planned) state = 'done'
  else if (done > 0) state = 'part'
  else if (planned > 0 && (past || logged)) state = 'miss'
  else if (planned > 0) state = 'plan'
  return { planned, done, logged, state }
}

export function byModality(d: YearData, items: DayItem[]) {
  const map = new Map<string, number>()
  for (const i of items) map.set(i.modality_id, (map.get(i.modality_id) ?? 0) + i.minutes)
  return [...map.entries()]
    .map(([id, minutes]) => ({ modality: d.modalities.find((m) => m.id === id), minutes }))
    .filter((x) => x.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
}

export interface PlanVsDone {
  planned: number // minutos planejados até hoje
  done: number // minutos realizados até hoje
  pct: number | null // cumprimento (realizado / planejado)
  days: { done: number; part: number; miss: number; pending: number }
  pendingDates: string[]
  pendingPlanned: number // minutos planejados nos dias ainda não lançados
}

/**
 * Realizado × planejado no mês, até hoje. O dia de hoje só entra depois de lançado
 * (para não contar como falta um dia que ainda está em andamento).
 */
export function planVsDone(d: YearData, month: string, today: Date): PlanVsDone {
  const todayIso = isoDate(today)
  const dates = new Set<string>()
  for (const x of [...d.plan, ...d.entries]) if (x.date.startsWith(month) && x.date <= todayIso) dates.add(x.date)
  const r: PlanVsDone = { planned: 0, done: 0, pct: null, days: { done: 0, part: 0, miss: 0, pending: 0 }, pendingDates: [], pendingPlanned: 0 }
  for (const date of [...dates].sort()) {
    const st = dayState(d, date, today)
    if (date === todayIso && !st.logged) continue
    r.planned += st.planned
    r.done += st.done
    if (st.state === 'done') r.days.done++
    else if (st.state === 'part') r.days.part++
    else if (st.state === 'miss') {
      if (st.logged) r.days.miss++
      else { r.days.pending++; r.pendingDates.push(date); r.pendingPlanned += st.planned }
    }
  }
  r.pct = r.planned > 0 ? r.done / r.planned : null
  return r
}

/** Participante de atividades conjuntas (compartilhamento mútuo). */
export interface JointPartner {
  id: string
  name: string
  data: YearData
}

/** Bloco do participante com o mesmo group_id no mesmo dia (plano ou realizado). */
export function partnerHasGroup(items: DayItem[], date: string, groupId: string | null | undefined): boolean {
  return !!groupId && items.some((x) => x.date === date && x.group_id === groupId)
}

export interface MonthCard {
  status: MonthStatus
  target: number // minutos: plano, média necessária ou meta
  kind: 'plano' | 'precisa' | 'meta'
  note: string // linha abaixo da barra: "▲ +2,5", "▼ faltam 44", "✓ coberto", "sem plano"…
}

/** ✓ coberto (igual ao plano) · ▲ +X (acima) · ▼ faltam X (abaixo). */
export function planDelta(done: number, planned: number): string {
  const d = done - planned
  if (Math.abs(d) < 3) return '✓ coberto' // tolerância de arredondamento (< 3 min)
  return d > 0 ? `▲ +${fmtHours(d)}` : `▼ faltam ${fmtHours(-d)}`
}

/**
 * Linha do mês: com plano → compara com o plano (✓/▲/▼; meses futuros só mostram o plano).
 * Sem plano → atual/futuro compara com a média mensal necessária; encerrado compara com a meta do mês.
 */
export function monthCard(m: MonthStats, today: Date, needed: number): MonthCard {
  const cur = monthKey(today)
  if (m.planned > 0) {
    return { status: monthStatus(m.month, today, m.counted, m.planned), target: m.planned, kind: 'plano',
      note: m.month > cur ? '' : planDelta(m.counted, m.planned) }
  }
  if (m.month < cur) return { status: monthStatus(m.month, today, m.counted, m.goal), target: m.goal, kind: 'meta', note: 'sem plano' }
  return { status: monthStatus(m.month, today, m.counted, needed), target: needed, kind: 'precisa',
    note: m.month === cur ? 'sem plano · média necessária' : '' }
}
