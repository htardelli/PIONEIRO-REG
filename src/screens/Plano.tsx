import { useEffect, useState } from 'react'
import { api } from '../api'
import {
  blockErrors, blockMinutes, daysInMonth, deleteRange, fmtH, fmtHours, fromMinutes, isoDate, monthLabel, parseIso, repeatDates,
  serviceYearMonths, WEEKDAY_PLURAL, WEEKDAY_SHORT, type DeleteScope, type TimeBlock,
} from '../domain'
import { dayState, monthStats, yearStats, type YearData } from '../data'
import { BlocksEditor, Header, MonthNav } from '../ui'

const DELETE_LABEL: Record<DeleteScope, string> = { day: 'Dia', week: 'Semana', month: 'Mês', year: 'Ano' }

export function Plano({ data, today, month, setMonth, reload, toast }: {
  data: YearData; today: Date; month: string; setMonth: (m: string) => void; reload: () => Promise<void>; toast: (m: string) => void
}) {
  const months = serviceYearMonths(data.sy)
  const idx = months.indexOf(month)
  const ms = monthStats(data, month, today)
  const ys = yearStats(data, today)
  const todayIso = isoDate(today)
  const [sel, setSel] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [delScope, setDelScope] = useState<DeleteScope>('day')
  const [delPast, setDelPast] = useState(false)
  const [scope, setScope] = useState<'day' | 'month' | 'year'>('day')
  const [goalH, setGoalH] = useState(String(ms.goal / 60))
  const [busy, setBusy] = useState(false)

  useEffect(() => { setGoalH(String(ms.goal / 60)); setSel(null) }, [month, ms.goal])
  useEffect(() => {
    if (!sel) return
    // Itens antigos sem horário recebem horários em sequência a partir das 08:00 para ajuste
    let clock = 8 * 60
    const items = data.plan.filter((x) => x.date === sel)
      .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'))
    setBlocks(items.map((p) => {
      const start = p.start_time?.slice(0, 5) ?? fromMinutes(clock)
      const end = p.end_time?.slice(0, 5) ?? fromMinutes(clock + p.minutes)
      clock = Math.max(clock, Number(end.slice(0, 2)) * 60 + Number(end.slice(3)))
      return { modality_id: p.modality_id, start, end }
    }))
    setScope('day')
    setDelScope('day')
    setDelPast(false)
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
      const rows = dates.flatMap((date) => blocks.map((b) => ({
        user_id: data.userId, date, modality_id: b.modality_id, minutes: blockMinutes(b), start_time: b.start, end_time: b.end,
      })))
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

  const nameOf = (id: string) => data.modalities.find((m) => m.id === id)?.name ?? ''
  const errors = blockErrors(blocks, nameOf)
  const hasErrors = Object.keys(errors).length > 0
  const dayTotal = blocks.reduce((a, b) => a + blockMinutes(b), 0)

  const [delFrom, delTo] = sel ? deleteRange(sel, delScope, todayIso, delPast) : ['', '']
  const delDays = new Set(data.plan.filter((p) => p.date >= delFrom && p.date <= delTo).map((p) => p.date)).size

  async function deletePlan() {
    if (!sel) return
    const fmt = (d: string) => d.split('-').reverse().join('/')
    const what = delFrom === delTo ? `do dia ${fmt(delFrom)}` : `de ${fmt(delFrom)} a ${fmt(delTo)}`
    if (!confirm(`Excluir o planejamento ${what}? Os lançamentos (horas realizadas) não são afetados.`)) return
    setBusy(true)
    try {
      await api.remove('plan_items', { eq: { user_id: data.userId }, range: ['date', delFrom, delTo] })
      await reload()
      toast(`Planejamento excluído (${delDays} ${delDays === 1 ? 'dia' : 'dias'})`)
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
            <BlocksEditor modalities={data.modalities} value={blocks} onChange={setBlocks} errors={errors} />
            <div className="sub" style={{ fontWeight: 700, margin: '14px 0 6px' }}>REPETIR EM</div>
            <div className="seg">
              <button className={scope === 'day' ? 'on' : ''} onClick={() => setScope('day')}>Só este dia</button>
              <button className={scope === 'month' ? 'on' : ''} onClick={() => setScope('month')}>{cap(WEEKDAY_PLURAL[selDow])} do mês</button>
              <button className={scope === 'year' ? 'on' : ''} onClick={() => setScope('year')}>{cap(WEEKDAY_PLURAL[selDow])} do ano</button>
            </div>
            {scope !== 'day' && (
              <div className="sub" style={{ marginTop: 8 }}>
                Substitui o plano de {repeatDates(sel, scope).length} dias ({scope === 'year' ? 'desta data até 31/ago' : 'neste mês'}). Total do dia: {fmtH(dayTotal)}.
              </div>
            )}
            {hasErrors && <div className="error" style={{ marginTop: 10 }}>Corrija os horários em vermelho para salvar.</div>}
            <button className="btn brand" style={{ marginTop: 12 }} disabled={busy || hasErrors} onClick={savePlan}>
              {busy ? 'Salvando…' : `Salvar plano (${fmtH(dayTotal)})`}
            </button>

            <div style={{ borderTop: '1px solid var(--line)', marginTop: 16, paddingTop: 12 }}>
              <div className="sub" style={{ fontWeight: 700, marginBottom: 6 }}>EXCLUIR PLANEJAMENTO</div>
              <div className="seg">
                {(Object.keys(DELETE_LABEL) as DeleteScope[]).map((k) => (
                  <button key={k} className={delScope === k ? 'on' : ''} onClick={() => setDelScope(k)}>{DELETE_LABEL[k]}</button>
                ))}
              </div>
              {delScope !== 'day' && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 8, color: 'var(--muted)', fontWeight: 600 }}>
                  <input type="checkbox" checked={delPast} onChange={(e) => setDelPast(e.target.checked)} />
                  Incluir dias que já passaram
                </label>
              )}
              <div className="sub" style={{ marginTop: 6 }}>
                {delDays > 0 ? `${delDays} ${delDays === 1 ? 'dia planejado' : 'dias planejados'} no período.` : 'Nenhum dia planejado no período.'}
                {delScope !== 'day' && !delPast && ' Dias passados são preservados para não distorcer o histórico.'}
              </div>
              <button className="btn danger small" style={{ marginTop: 8 }} disabled={busy || delDays === 0} onClick={deletePlan}>
                Excluir planejamento ({DELETE_LABEL[delScope].toLowerCase()})
              </button>
            </div>
          </div>
        ) : (
          <div className="info">Toque num dia para planejar (com horário de início e fim) ou excluir o planejamento do dia, da semana, do mês ou do ano.</div>
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
