import { useEffect, useState } from 'react'
import { api } from '../api'
import {
  daysInMonth, fmtH, fmtHours, isoDate, monthLabel, parseIso, repeatDates, serviceYearMonths, WEEKDAY_PLURAL, WEEKDAY_SHORT,
} from '../domain'
import { dayState, monthStats, yearStats, type YearData } from '../data'
import { Header, ItemsEditor, MonthNav } from '../ui'

export function Plano({ data, today, month, setMonth, reload, toast }: {
  data: YearData; today: Date; month: string; setMonth: (m: string) => void; reload: () => Promise<void>; toast: (m: string) => void
}) {
  const months = serviceYearMonths(data.sy)
  const idx = months.indexOf(month)
  const ms = monthStats(data, month, today)
  const ys = yearStats(data, today)
  const todayIso = isoDate(today)
  const [sel, setSel] = useState<string | null>(null)
  const [value, setValue] = useState<Record<string, number>>({})
  const [scope, setScope] = useState<'day' | 'month' | 'year'>('day')
  const [goalH, setGoalH] = useState(String(ms.goal / 60))
  const [busy, setBusy] = useState(false)

  useEffect(() => { setGoalH(String(ms.goal / 60)); setSel(null) }, [month, ms.goal])
  useEffect(() => {
    if (!sel) return
    const m: Record<string, number> = {}
    for (const p of data.plan.filter((x) => x.date === sel)) m[p.modality_id] = (m[p.modality_id] ?? 0) + p.minutes
    setValue(m)
    setScope('day')
  }, [sel, data])

  const [y, mo] = month.split('-').map(Number)
  const firstDow = new Date(y, mo - 1, 1).getDay()
  const nDays = daysInMonth(month)

  async function saveGoal() {
    const h = Number(goalH.replace(',', '.'))
    if (!Number.isFinite(h) || h < 0) return toast('Meta inválida')
    await api.upsert('month_records', [{ user_id: data.userId, month, goal_min: Math.round(h * 60) }], 'user_id,month')
    await reload()
    toast('Meta do mês salva')
  }

  async function savePlan() {
    if (!sel) return
    setBusy(true)
    try {
      const dates = repeatDates(sel, scope)
      await api.remove('plan_items', { eq: { user_id: data.userId }, in: ['date', dates] })
      const rows = dates.flatMap((date) => Object.entries(value).filter(([, m]) => m > 0)
        .map(([modality_id, minutes]) => ({ user_id: data.userId, date, modality_id, minutes })))
      for (let i = 0; i < rows.length; i += 500) await api.insert('plan_items', rows.slice(i, i + 500))
      await reload()
      toast(dates.length > 1 ? `Plano aplicado em ${dates.length} dias` : 'Plano salvo')
      setSel(null)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const selDow = sel ? parseIso(sel).getDay() : 0
  const slack = ms.planned - ms.goal

  return (
    <>
      <Header kicker={`Plano · AS ${data.sy}`} title={
        <MonthNav label={monthLabel(month)} onPrev={() => setMonth(months[idx - 1])} onNext={() => setMonth(months[idx + 1])}
          prevDisabled={idx <= 0} nextDisabled={idx >= 11} />
      } />
      <div className="main">
        <div className="card" style={{ padding: 12 }}>
          <div className="cal">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((h, i) => <div className="h" key={i}>{h}</div>)}
            {Array.from({ length: firstDow }, (_, i) => <div className="d x" key={'x' + i} />)}
            {Array.from({ length: nDays }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, '0')}`
              const st = dayState(data, date, today)
              const shown = st.done > 0 ? st.done : st.planned
              return (
                <button key={date} className={`d ${st.state} ${date === todayIso ? 'today' : ''} ${sel === date ? 'sel' : ''}`} onClick={() => setSel(date)}>
                  {i + 1}
                  {shown > 0 && <em>{fmtHours(shown)}</em>}
                </button>
              )
            })}
          </div>
          <div className="legend">
            <span><i style={{ background: 'var(--ok-soft)', border: '1px solid var(--ok)' }} />Cumprido</span>
            <span><i style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }} />Parcial</span>
            <span><i style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)' }} />Não feito</span>
            <span><i style={{ background: '#F7F9FB', border: '1px solid var(--line)' }} />Planejado</span>
          </div>
        </div>

        {sel ? (
          <div className="card">
            <div className="card-head">
              <h3>Planejar {WEEKDAY_SHORT[selDow]}, {sel.slice(8)}/{sel.slice(5, 7)}</h3>
              <button className="link" onClick={() => setSel(null)}>Fechar</button>
            </div>
            <ItemsEditor modalities={data.modalities} value={value} onChange={setValue} />
            <div className="sub" style={{ fontWeight: 700, margin: '14px 0 6px' }}>REPETIR EM</div>
            <div className="seg">
              <button className={scope === 'day' ? 'on' : ''} onClick={() => setScope('day')}>Só este dia</button>
              <button className={scope === 'month' ? 'on' : ''} onClick={() => setScope('month')}>{cap(WEEKDAY_PLURAL[selDow])} do mês</button>
              <button className={scope === 'year' ? 'on' : ''} onClick={() => setScope('year')}>{cap(WEEKDAY_PLURAL[selDow])} do ano</button>
            </div>
            {scope !== 'day' && (
              <div className="sub" style={{ marginTop: 8 }}>
                Substitui o plano de {repeatDates(sel, scope).length} dias ({scope === 'year' ? 'desta data até 31/ago' : 'neste mês'}). Total do dia: {fmtH(Object.values(value).reduce((a, b) => a + b, 0))}.
              </div>
            )}
            <button className="btn brand" style={{ marginTop: 12 }} disabled={busy} onClick={savePlan}>{busy ? 'Salvando…' : 'Salvar plano'}</button>
          </div>
        ) : (
          <div className="info">Toque num dia para planejar. Você pode repetir o plano em todos os mesmos dias da semana do mês ou do ano.</div>
        )}

        <div className="card" style={{ padding: '8px 16px' }}>
          <div className="kv">
            <span>Meta do mês</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="input" style={{ width: 70, padding: 8, textAlign: 'right' }} inputMode="decimal" value={goalH}
                onChange={(e) => setGoalH(e.target.value)} onBlur={() => Number(goalH.replace(',', '.')) * 60 !== ms.goal && saveGoal()} />
              <b>h</b>
            </span>
          </div>
          <div className="kv"><span>Planejado no mês</span><span><b>{fmtHours(ms.planned)} h</b>{' '}
            <span className={`pill ${slack >= 0 ? 'ok' : 'warn'}`}>{slack >= 0 ? `folga ${fmtHours(slack)} h` : `faltam ${fmtHours(-slack)} h`}</span></span></div>
          <div className="kv"><span>Soma das metas do ano</span><span><b>{fmtHours(ys.goalsSum)} h</b>{' '}
            <span className={`pill ${ys.goalsSum >= ys.goal ? 'ok' : 'bad'}`}>{ys.goalsSum >= ys.goal ? 'ok' : `< ${fmtHours(ys.goal)}`}</span></span></div>
        </div>
      </div>
    </>
  )
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
