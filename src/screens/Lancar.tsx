import { useEffect, useState } from 'react'
import { api } from '../api'
import { fmtH, isoDate, MONTH_NAME, parseIso, WEEKDAY } from '../domain'
import { yearRange, type YearData } from '../data'
import { ItemsEditor } from '../ui'

const toMap = (items: { modality_id: string; minutes: number }[]) => {
  const m: Record<string, number> = {}
  for (const i of items) m[i.modality_id] = (m[i.modality_id] ?? 0) + i.minutes
  return m
}
const total = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0)

export function Lancar({ data, today, date, setDate, reload, toast }: {
  data: YearData; today: Date; date: string; setDate: (d: string) => void; reload: () => Promise<void>; toast: (m: string) => void
}) {
  const plan = data.plan.filter((p) => p.date === date)
  const done = data.entries.filter((e) => e.date === date)
  const note = data.notes.find((n) => n.date === date)
  const logged = done.length > 0 || !!note
  const planMap = toMap(plan)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<Record<string, number>>({})
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setEditing(false)
    setValue(done.length ? toMap(done) : { ...planMap })
    setText(note?.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, data])

  const d = parseIso(date)
  const [from] = yearRange(data.sy)
  const todayIso = isoDate(today)
  const shift = (n: number) => {
    const x = new Date(d); x.setDate(x.getDate() + n)
    setDate(isoDate(x))
  }

  async function save(items: Record<string, number>, noteText: string) {
    setBusy(true)
    try {
      await api.remove('entries', { eq: { user_id: data.userId, date } })
      await api.insert('entries', Object.entries(items).filter(([, m]) => m > 0)
        .map(([modality_id, minutes]) => ({ user_id: data.userId, date, modality_id, minutes })))
      await api.upsert('day_notes', [{ user_id: data.userId, date, note: noteText }], 'user_id,date')
      await reload()
      toast('Dia lançado ✓')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const planTotal = total(planMap)
  const valTotal = total(value)
  const showEditor = editing || plan.length === 0

  return (
    <>
      <header className="top">
        <div className="kicker">{WEEKDAY[d.getDay()]}</div>
        <div className="title">
          <span className="nav-arrows">
            <button className="arrow" onClick={() => shift(-1)} disabled={date <= from}>‹</button>
            {d.getDate()} de {MONTH_NAME[d.getMonth()].toLowerCase()}
            <button className="arrow" onClick={() => shift(1)} disabled={date >= todayIso}>›</button>
          </span>
          {date === todayIso ? <span className="link">Hoje</span> : <button className="link" onClick={() => setDate(todayIso)}>Ir p/ hoje</button>}
        </div>
      </header>
      <div className="main">
        {logged && !editing && (
          <div className="card">
            <div className="card-head"><h3>Lançado · {fmtH(total(toMap(done)))}</h3><span className={`pill ${total(toMap(done)) >= planTotal ? 'ok' : 'warn'}`}>{planTotal ? `plano ${fmtH(planTotal)}` : 'sem plano'}</span></div>
            {done.length === 0 && <div className="empty">Nenhuma hora neste dia.</div>}
            {Object.entries(toMap(done)).map(([id, min]) => {
              const m = data.modalities.find((x) => x.id === id)
              return <div className="mod" key={id}><i className="dot" style={{ background: m?.color }} /><span className="n">{m?.name}</span><b>{fmtH(min)}</b></div>
            })}
            {note?.note && <div className="sub" style={{ marginTop: 8 }}>Obs.: {note.note}</div>}
            <button className="btn outline small" style={{ marginTop: 12 }} onClick={() => setEditing(true)}>Editar lançamento</button>
          </div>
        )}

        {!logged && plan.length > 0 && (
          <>
            <div className="card">
              <h3>Planejado para o dia · {fmtH(planTotal)}</h3>
              {[...plan].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')).map((p) => {
                const m = data.modalities.find((x) => x.id === p.modality_id)
                return (
                  <div className="mod" key={p.id}>
                    <i className="dot" style={{ background: m?.color }} />
                    <span className="n">{m?.name}{p.start_time && <span className="sub"> · {p.start_time.slice(0, 5)}–{p.end_time?.slice(0, 5)}</span>}</span>
                    <b>{fmtH(p.minutes)}</b>
                  </div>
                )
              })}
            </div>
            {!editing && (
              <>
                <button className="btn primary" disabled={busy} onClick={() => save(planMap, '')}>✓ Cumpri o planejado</button>
                <button className="btn outline" onClick={() => setEditing(true)}>Fiz diferente ▾</button>
              </>
            )}
          </>
        )}

        {!logged && plan.length === 0 && !editing && (
          <div className="info">Nada planejado para este dia. Se fez algo, lance abaixo.</div>
        )}

        {(showEditor && (editing || !logged)) && (
          <>
            <div className="card">
              <h3>Horas realizadas</h3>
              <ItemsEditor modalities={data.modalities} value={value} onChange={setValue} />
            </div>
            <div className="card" style={{ padding: '12px 16px' }}>
              <div className="kv" style={{ padding: '4px 0 10px' }}>
                <span>Total do dia</span>
                <span><b>{fmtH(valTotal)}</b>{' '}
                  {planTotal > 0 && valTotal !== planTotal && (
                    <span className={`pill ${valTotal > planTotal ? 'ok' : 'warn'}`}>{valTotal > planTotal ? '+' : ''}{fmtH(valTotal - planTotal)} vs plano</span>
                  )}
                </span>
              </div>
              <input className="input" placeholder="Motivo / observação (opcional)" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <button className="btn brand" disabled={busy} onClick={() => save(value, text)}>{busy ? 'Salvando…' : 'Salvar'}</button>
            {editing && <button className="btn ghost small" onClick={() => setEditing(false)}>Cancelar</button>}
          </>
        )}
      </div>
    </>
  )
}
