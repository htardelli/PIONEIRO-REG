import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import {
  fmtHours, countedMinutes, idealPace, isoDate, monthKey, monthStatus, neededPerMonth, serviceYearMonths, type MonthStatus,
} from './domain'
import type { Credit, DayEvent, DayItem, DayNote, Modality, MonthRecord, Profile } from './types'


export interface YearData {
  userId: string
  sy: number
  profile: Profile | null
  modalities: Modality[]
  records: MonthRecord[]
  plan: DayItem[]
  entries: DayItem[]
  notes: DayNote[]
  events: DayEvent[]
  credits: Credit[]
}

export function yearRange(sy: number): [string, string] {
  return [`${sy - 1}-09-01`, `${sy}-08-31`]
}

export async function loadYear(userId: string, sy: number): Promise<YearData> {
  const [from, to] = yearRange(sy)
  const months = serviceYearMonths(sy)
  const eq = { user_id: userId }
  const [profiles, modalities, records, plan, entries, notes, events, credits] = await Promise.all([
    api.select<Profile>('profiles', { eq: { id: userId } }),
    api.select<Modality>('modalities', { eq }),
    api.select<MonthRecord>('month_records', { eq, in: ['month', months] }),
    api.select<DayItem>('plan_items', { eq, range: ['date', from, to] }),
    api.select<DayItem>('entries', { eq, range: ['date', from, to] }),
    api.select<DayNote>('day_notes', { eq, range: ['date', from, to] }),
    api.select<DayEvent>('day_events', { eq, range: ['date', from, to] }).catch(() => [] as DayEvent[]),
    api.select<Credit>('credits', { eq, in: ['month', months] }),
  ])
  modalities.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  return { userId, sy, profile: profiles[0] ?? null, modalities, records, plan, entries, notes, events, credits }
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
  target: number // alvo do mês: PLANO > META > RATEIO (horas que faltam ÷ meses sem plano e sem meta)
  targetKind: TargetKind
  status: MonthStatus
  studies: number
  justification: string
}

export type TargetKind = 'plano' | 'meta' | 'rateio'

/** Estatística isolada do mês. O alvo "rateio" só é calculado em yearStats (depende do ano todo). */
export function monthStats(d: YearData, month: string, today: Date): MonthStats {
  const rec = d.records.find((r) => r.month === month)
  const ministry = sum(d.entries.filter((e) => e.date.startsWith(month)))
  const credit = sum(d.credits.filter((c) => c.month === month))
  const { counted, creditUsed, creditLost } = countedMinutes(ministry, credit)
  const goal = rec?.goal_min ?? 0 // 0 = mês sem meta cadastrada
  const planned = sum(d.plan.filter((p) => p.date.startsWith(month)))
  const target = planned > 0 ? planned : goal // o plano sobrepõe a meta
  return {
    month, goal, ministry, credit, creditUsed, creditLost, counted, planned, target,
    targetKind: planned > 0 ? 'plano' : goal > 0 ? 'meta' : 'rateio',
    status: monthStatus(month, today, counted, target),
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
  committed: number // feito nos meses encerrados + alvos (plano/meta) dos meses em aberto
  freeMonths: number // meses em aberto sem plano e sem meta (recebem o rateio)
  share: number // rateio: (meta anual − committed) ÷ freeMonths
  plannedSum: number // total planejado no ano
  plannedMonths: number // meses com plano
}

export function yearStats(d: YearData, today: Date): YearStats {
  const cur = monthKey(today)
  const goalY = d.profile?.annual_goal_min ?? 36000
  const months = serviceYearMonths(d.sy).map((m) => monthStats(d, m, today))
  // Rateio: o que falta para a meta anual, dividido pelos meses em aberto sem plano e sem meta
  const open = (m: MonthStats) => m.month >= cur
  const committed = months.reduce((a, m) => a + (open(m) ? (m.targetKind === 'rateio' ? 0 : m.target) : m.counted), 0)
  const free = months.filter((m) => open(m) && m.targetKind === 'rateio')
  const share = free.length ? Math.max(0, goalY - committed) / free.length : 0
  for (const m of months) {
    if (m.targetKind !== 'rateio') continue
    m.target = open(m) ? share : 0
    // mês encerrado sem plano e sem meta: não há alvo; vale o que foi feito
    m.status = open(m) ? monthStatus(m.month, today, m.counted, m.target) : m.counted > 0 ? 'ok' : 'bad'
  }
  const total = months.reduce((a, m) => a + m.counted, 0)
  const goal = goalY
  const minGoal = d.profile?.min_goal_min ?? 33600
  const pace = idealPace(goal, d.sy, today)
  const paceMin = idealPace(minGoal, d.sy, today)
  // Necessidade mensal: o que falta, descontando só os meses já encerrados
  const closed = months.filter((m) => m.month < cur).reduce((a, m) => a + m.counted, 0)
  return {
    months, total, goal, minGoal, pace, paceMin,
    diff: total - pace,
    level: total >= pace ? 'ok' : total >= paceMin ? 'warn' : 'bad',
    needed: neededPerMonth(goal, closed, d.sy, today),
    committed, freeMonths: free.length, share,
    plannedSum: months.reduce((a, m) => a + m.planned, 0),
    plannedMonths: months.filter((m) => m.planned > 0).length,
  }
}

export type DayState = 'done' | 'part' | 'miss' | 'plan' | 'none'

export function dayState(d: YearData, date: string, today: Date) {
  const dayPlan = d.plan.filter((p) => p.date === date)
  const dayEntries = d.entries.filter((e) => e.date === date)
  const planned = sum(dayPlan)
  const done = sum(dayEntries)
  // Faltas por atividade (conjunta): o dia só conta como lançado se TODAS as atividades planejadas foram cobertas
  const absentGroups = new Set(dayEntries.filter((e) => e.absent && e.group_id).map((e) => e.group_id))
  const allAbsent = absentGroups.size > 0 && dayPlan.every((p) => p.group_id && absentGroups.has(p.group_id))
  const logged = done > 0 || allAbsent || d.notes.some((n) => n.date === date)
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
  target: number
  kind: TargetKind
  note: string // abaixo da barra: "▲ +2,5", "▼ faltam 44", "✓ coberto" (vazio em meses futuros)
}

/** ✓ coberto (igual ao alvo) · ▲ +X (acima) · ▼ faltam X (abaixo). */
export function planDelta(done: number, planned: number): string {
  const d = done - planned
  if (Math.abs(d) < 3) return '✓ coberto' // tolerância de arredondamento (< 3 min)
  return d > 0 ? `▲ +${fmtHours(d)}` : `▼ faltam ${fmtHours(-d)}`
}

/** Card do mês a partir das estatísticas do ano (alvo já resolvido: plano > meta > rateio). */
export function monthCard(m: MonthStats, today: Date): MonthCard {
  const future = m.month > monthKey(today)
  const note = future ? '' : m.target <= 0 ? 'sem plano/meta' : planDelta(m.counted, m.target)
  return { status: m.status, target: m.target, kind: m.targetKind, note }
}

export const TARGET_LABEL: Record<TargetKind, string> = { plano: 'plano', meta: 'meta', rateio: 'rateio' }
