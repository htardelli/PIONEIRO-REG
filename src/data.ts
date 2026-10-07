import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import {
  countedMinutes, idealPace, isoDate, monthKey, monthStatus, neededPerMonth, serviceYearMonths, type MonthStatus,
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
