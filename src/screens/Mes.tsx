import { useEffect, useRef, useState } from 'react'
import { eventName, fmtH, HOLIDAY_LABEL, holidayOf, isoDate, monthKey, monthLabel, mondayIndex, serviceYearMonths, WEEK_HEAD, WEEKDAY } from '../domain'
import { dayState, planDelta, yearStats, type YearData } from '../data'
import { Header, MonthNav } from '../ui'
import { byStart, ItemRow } from './Lancar'

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
          <div className="kv"><span>Alvo ({ms.targetKind})</span><span><b>{fmtH(ms.target)}</b>{' '}
            {ms.target > 0 && <span className={`pill ${ms.counted >= ms.target ? 'ok' : 'warn'}`}>{planDelta(ms.counted, ms.target)}</span>}</span></div>
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
                  className={`d ${cls} ${date === todayIso ? 'today' : ''} ${sel === date ? 'sel' : ''} ${hol && hol.kind !== 'facultativo' ? 'holday' : ''} ${ev ? 'evday' : ''}`}>
                  {i + 1}
                  {(hol || ev) && <span className="dmk">{hol && <i className={`hol ${hol.kind}`} />}{ev && <i className="ev" />}</span>}
                  {st.done > 0 && <em>{fmtH(st.done)}</em>}
                </button>
              )
            })}
          </div>
          <div className="legend">
            <span><i style={{ background: 'var(--ok-soft)', border: '1px solid var(--ok)' }} />Cumpriu o plano</span>
            <span><i style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }} />Parcial</span>
            <span><i style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)' }} />Não feito</span>
            <span><i className="hol" style={{ borderRadius: '50%' }} />Feriado</span>
            <span><i className="ev" style={{ borderRadius: '50%' }} />Evento</span>
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
  return (
    <div className="card">
      <div className="card-head">
        <h3>{WEEKDAY[d.getDay()]}, {date.slice(8)}/{date.slice(5, 7)}</h3>
        {!future && (st.done > 0 || st.planned > 0) && (
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
      <div className="sub" style={{ fontWeight: 700, margin: '4px 0' }}>REALIZADO</div>
      {entries.length ? entries.map((e) => <ItemRow key={e.id} item={e} data={data} />)
        : <div className="empty">{future ? 'Dia ainda não chegou.' : st.logged ? 'Nenhuma hora neste dia.' : 'Nada lançado.'}</div>}
      {note && <div className="sub" style={{ marginTop: 6, fontSize: 14 }}>Obs.: {note}</div>}
      {entries.some((e) => e.absent && e.note) && <div className="sub" style={{ marginTop: 6, fontSize: 14 }}>{entries.find((e) => e.absent && e.note)!.note}</div>}
      {plan.length > 0 && (
        <>
          <div className="sub" style={{ fontWeight: 700, margin: '12px 0 4px' }}>PLANEJADO · {fmtH(st.planned)}</div>
          {plan.map((p) => <ItemRow key={p.id} item={p} data={data} />)}
        </>
      )}
      {!future && <button className="btn outline small" style={{ marginTop: 12 }} onClick={() => onEdit(date)}>{entries.length ? 'Editar lançamento' : 'Lançar este dia'}</button>}
    </div>
  )
}
