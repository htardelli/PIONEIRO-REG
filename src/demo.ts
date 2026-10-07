// Dados de exemplo para o modo demonstração (?demo). Nada aqui vai para o servidor.
import { DEFAULT_MODALITIES, fromMinutes, isoDate, serviceYearMonths, serviceYearOf } from './domain'

export const DEMO_ME = 'demo-eu'
export const DEMO_PARTNER = 'demo-conjuge'

const GOALS_H = [50, 52, 50, 48, 50, 50, 55, 50, 50, 48, 55, 42]

export function buildDemoData(today: Date) {
  const sy = serviceYearOf(today)
  const months = serviceYearMonths(sy)
  let seq = 0
  const id = () => `d${++seq}`
  const db = {
    profiles: [
      { id: DEMO_ME, name: 'Você', email: 'voce@exemplo.com', color: '#2E75B6', annual_goal_min: 36000, min_goal_min: 33600, is_admin: true },
      { id: DEMO_PARTNER, name: 'Cônjuge', email: 'conjuge@exemplo.com', color: '#D35D8C', annual_goal_min: 36000, min_goal_min: 33600 },
    ],
    shares: [{ owner: DEMO_ME, viewer: DEMO_PARTNER }, { owner: DEMO_PARTNER, viewer: DEMO_ME }],
    modalities: [] as Record<string, unknown>[],
    month_records: [] as Record<string, unknown>[],
    plan_items: [] as Record<string, unknown>[],
    entries: [] as Record<string, unknown>[],
    day_notes: [] as Record<string, unknown>[],
    credits: [] as Record<string, unknown>[],
  }

  for (const [user, factor] of [[DEMO_ME, 1], [DEMO_PARTNER, 0.9]] as const) {
    const mod: Record<string, string> = {}
    DEFAULT_MODALITIES.forEach((m, i) => {
      const mid = `${user}-m${i}`
      mod[m.name] = mid
      db.modalities.push({ id: mid, user_id: user, name: m.name, color: m.color, active: true, sort: i })
    })
    months.forEach((m, i) =>
      db.month_records.push({ user_id: user, month: m, goal_min: GOALS_H[i] * 60, bible_studies: i < 2 ? 3 : 0, justification: '' }),
    )
    // Rotina semanal (minutos por modalidade), por dia da semana
    const routine: Record<number, [string, number][]> = {
      1: [['Casa em Casa', 120]],
      2: [['Casa em Casa', 90], ['Revisita', 60]],
      3: [['TPL · Carrinho', 120]],
      4: [['Estudo', 60]],
      5: [['Cartas', 90]],
      6: [['Casa em Casa', 120]],
      0: [['Informal', 60]],
    }
    const start = new Date(sy - 1, 8, 1)
    const end = new Date(sy, 7, 31)
    let n = 0
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = isoDate(d)
      let clock = 8 * 60 // atividades em sequência a partir das 08:00
      for (const [name, min] of routine[d.getDay()]) {
        db.plan_items.push({
          id: id(), user_id: user, date, modality_id: mod[name], minutes: min,
          start_time: fromMinutes(clock), end_time: fromMinutes(clock + min),
        })
        clock += min
        if (d < today && !(d.getMonth() === today.getMonth() && d.getDate() === today.getDate())) {
          n++
          // Variação determinística: alguns dias parciais/perdidos
          const r = (n * 37 + (user === DEMO_ME ? 0 : 11)) % 10
          const done = r === 0 ? 0 : r === 1 ? min / 2 : r === 2 ? min + 30 : min
          const m2 = Math.round((done * factor) / 15) * 15
          const st = clock - min
          if (m2 > 0) db.entries.push({
            id: id(), user_id: user, date, modality_id: mod[name], minutes: m2,
            start_time: fromMinutes(st), end_time: fromMinutes(st + m2),
          })
        }
      }
    }
    if (user === DEMO_ME) {
      db.credits.push({ id: id(), user_id: user, month: months[0], type: 'LDC / Construção', minutes: 600, note: 'Apoio LDC' })
    }
  }
  return db
}
