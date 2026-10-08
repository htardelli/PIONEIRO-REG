import { useEffect, useRef, useState } from 'react'
import { eventName, fmtH, HOLIDAY_LABEL, holidayOf, isoDate, monthKey, monthLabel, mondayIndex, serviceYearMonths, WEEK_HEAD, WEEKDAY } from '../domain'
import { cancelledPlan, dayState, pairDay, planDelta, yearStats, type YearData } from '../data'
import { CalLegend, Header, MonthNav } from '../ui'
import { byStart } from './Lancar'

/** Realizado dia a dia: calendário do mês e, ao tocar num dia, o detalhe das atividades logo abaixo. */
export function Mes({ data, today, onEdit }: { data: YearData; today: Date; onEdit: (date: string) => void }) {
  const todayIso = isoDate(today)
  const months = serviceYearMonths(data.sy)
  const [month, setMonth] = useState(monthKey(today))
  const [sel, setSel] = useState<string | null>(todayIso)
  useEffect(() => { setSel(month === monthKey(today) ? todayIso : null) }, [month]) // eslint-disable-line react-hooks/exhaustive-deps
  const detailRef = useRef<HTMLDivElement>(null)
  const pick = (date: string) => { setSel(date); setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50) }
  const idx = months.indexOf(month)
  const ys = yearStats(data, today)
  const ms = ys.months.find((m) => m.month === month)!

  const [y, mo] = month.split('-').map(Number)
  const firstDow = mondayIndex(new Date(y, mo - 1, 1))
  const nDays = new Date(y, mo, 0).getDate()
  const days = Array.from({ length: nDays }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
  const lastDay = month === monthKey(today) ? todayIso : days[nDays - 1]
  const daysDone = days.filter((dt) => dt <= lastDay && data.entries.some((e) => e.date === dt && e.minutes > 0)).length

  return (
    <>
      <Header kicker={`Realizado · AS ${data.sy}`} title={
        <MonthNav label={monthLabel(month)} onPrev={() => setMonth(months[idx - 1])} onNext={() => setMonth(months[idx + 1])}
          prevDisabled={idx <= 0} nextDisabled={idx >= 11} months={months} current={month} onPick={setMonth} todayMonth={monthKey(today)}
          info={(m) => { const x = ys.months.find((k) => k.month === m)!; return { line: fmtH(x.counted), status: x.status } }} />
      } />
      <div className="main">
        <div className="card" style={{ padding: '12px 16px' }}>
          <div className="kv"><span>Realizado no mês</span><b>{fmtH(ms.ministry)}</b></div>
          {ms.creditUsed > 0 && <div className="kv"><span>Crédito considerado</span><b style={{ color: 'var(--credit)' }}>{fmtH(ms.creditUsed)}</b></div>}
          <div className="kv"><span>Alvo ({ms.targetKind}){' '}
            {ms.target > 0 && <span className={`pill ${ms.counted >= ms.target ? 'ok' : 'warn'}`}>{planDelta(ms.counted, ms.target)}</span>}</span>
            <b>{fmtH(ms.target)}</b></div>
          <div className="kv" style={{ borderBottom: 0 }}><span>Dias com serviço</span><b>{daysDone}</b></div>
        </div>

        <div className="card" style={{ padding: 12 }}>
          <div className="cal">
            {WEEK_HEAD.map((h, i) => <div className="h" key={i}>{h}</div>)}
            {Array.from({ length: firstDow }, (_, i) => <div className="d x" key={'x' + i} />)}
            {days.map((date, i) => {
              const st = dayState(data, date, today)
              const hol = holidayOf(date)
              const ev = data.events.some((e) => e.date === date)
              const future = date > todayIso
              const cls = future ? '' : st.state === 'plan' ? '' : st.state
              return (
                <button key={date} onClick={() => pick(date)}
                  className={`d ${cls} ${date === todayIso ? 'today' : ''} ${sel === date ? 'sel' : ''} ${hol ? 'holday' : ''} ${data.entries.some((e) => e.date === date) || data.notes.some((n) => n.date === date) ? 'lanc' : ''} ${ev ? 'evday' : ''}`}>
                  {i + 1}
                  {(hol || ev) && <span className="dmk">{hol && <i className={`hol ${hol.kind}`} />}{ev && <i className="ev" />}</span>}
                  {st.done > 0 ? <em>{fmtH(st.done)}</em> : st.absentMin > 0 && <em className="off">✗</em>}
                </button>
              )
            })}
          </div>
          <div className="legend">
            <CalLegend />
          </div>
        </div>

        {sel ? <div ref={detailRef} style={{ scrollMarginBottom: 90 }}><DayDetail data={data} date={sel} today={today} onEdit={onEdit} /></div> : <div className="info">Toque num dia para ver as atividades realizadas.</div>}
      </div>
    </>
  )
}

function DayDetail({ data, date, today, onEdit }: { data: YearData; date: string; today: Date; onEdit: (date: string) => void }) {
  const st = dayState(data, date, today)
  const entries = data.entries.filter((e) => e.date === date).sort(byStart)
  const plan = data.plan.filter((p) => p.date === date).sort(byStart)
  const note = data.notes.find((n) => n.date === date)?.note
  const hol = holidayOf(date)
  const events = data.events.filter((e) => e.date === date)
  const d = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8)))
  const future = date > isoDate(today)
  const rows = pairDay(plan, entries)
  const off = cancelledPlan(data)
  return (
    <div className="card">
      <div className="card-head">
        <h3>{WEEKDAY[d.getDay()]}, {date.slice(8)}/{date.slice(5, 7)}</h3>
        {!future && st.absentMin > 0 && st.done === 0 ? <span className="pill bad">✗ Faltou</span> : !future && (st.done > 0 || st.planned > 0) && (
          <span className={`pill ${st.planned === 0 || st.done >= st.planned ? 'ok' : st.done > 0 ? 'warn' : 'bad'}`}>
            {st.planned > 0 ? `${fmtH(st.done)} de ${fmtH(st.planned)}` : fmtH(st.done)}
          </span>
        )}
      </div>
      {(hol || events.length > 0) && (
        <div className="daytags">
          {hol && <div className="daytag hol"><span className="grow">🇧🇷 {hol.name}</span><span className="sub">{HOLIDAY_LABEL[hol.kind]}</span></div>}
          {events.map((e) => <div className="daytag ev" key={e.id}>📌 {eventName(e)}</div>)}
        </div>
      )}
      {rows.length > 0 ? (
        <>
          <div className="drow head"><span>Atividade</span><span>Plano</span><span>Realizado</span></div>
          {rows.map((r, i) => {
            const it = r.done ?? r.plan!
            const m = data.modalities.find((x) => x.id === it.modality_id)
            const t = it.start_time ? `${it.start_time.slice(0, 5)}–${it.end_time?.slice(0, 5)}` : ''
            return (
              <div className="drow" key={i}>
                <span className="n"><i className="dot" style={{ background: m?.color }} />
                  <span>{m?.name}{it.group_id && ' 👥'}{t && <span className="sub"><br />{t}</span>}</span></span>
                <span className="pl">{!r.plan ? '—' : off.has(r.plan.id) ? <s title="Falta: não conta no planejado">{fmtH(r.plan.minutes)}</s> : fmtH(r.plan.minutes)}</span>
                <span className="dn">{r.done?.absent ? <span className="pill bad">✗ falta</span> : r.done ? fmtH(r.done.minutes) : future ? '' : <span className="miss">—</span>}</span>
              </div>
            )
          })}
          <div className="drow tot"><span>Total</span><span className="pl">{st.planned ? fmtH(st.planned) : '—'}</span><span className="dn">{future ? '' : fmtH(st.done)}</span></div>
        </>
      ) : <div className="empty">{future ? 'Nada planejado.' : st.logged ? 'Nenhuma hora neste dia.' : 'Nada planejado nem lançado.'}</div>}
      {note && <div className="sub" style={{ marginTop: 6, fontSize: 14 }}>{st.absentMin > 0 && st.done === 0 ? 'Justificativa' : 'Obs.'}: {note}</div>}
      {st.absentMin > 0 && <div className="sub" style={{ marginTop: 4 }}>{fmtH(st.absentMin)} planejadas foram zeradas pela falta (não contam no planejado).</div>}
      {entries.some((e) => e.absent && e.note) && <div className="sub" style={{ marginTop: 6, fontSize: 14 }}>{entries.find((e) => e.absent && e.note)!.note}</div>}
      {!future && <button className="btn outline small" style={{ marginTop: 12 }} onClick={() => onEdit(date)}>{entries.length || st.logged ? 'Editar lançamento' : 'Lançar este dia'}</button>}
    </div>
  )
}
