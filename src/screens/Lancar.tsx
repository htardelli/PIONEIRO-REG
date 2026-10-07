import { useEffect, useState } from 'react'
import { api } from '../api'
import { blockErrors, blockMinutes, fmtH, isoDate, MONTH_NAME, parseIso, toBlocks, WEEKDAY, type TimeBlock } from '../domain'
import { yearRange, type YearData } from '../data'
import { BlocksEditor } from '../ui'
import type { DayItem } from '../types'

const sumMin = (xs: { minutes: number }[]) => xs.reduce((a, x) => a + x.minutes, 0)

function ItemRow({ item, data }: { item: DayItem; data: YearData }) {
  const m = data.modalities.find((x) => x.id === item.modality_id)
  return (
    <div className="mod">
      <i className="dot" style={{ background: m?.color }} />
      <span className="n">{m?.name}{item.start_time && <span className="sub"> · {item.start_time.slice(0, 5)}–{item.end_time?.slice(0, 5)}</span>}</span>
      <b>{fmtH(item.minutes)}</b>
    </div>
  )
}

const byStart = (a: DayItem, b: DayItem) => (a.start_time ?? '').localeCompare(b.start_time ?? '')

const ABSENCE_PREFIX = 'Faltei'
const ABSENCE_REASONS = ['Saúde', 'Trabalho', 'Família', 'Clima', 'Viagem', 'Outro']

export function Lancar({ data, today, date, setDate, reload, toast }: {
  data: YearData; today: Date; date: string; setDate: (d: string) => void; reload: () => Promise<void>; toast: (m: string) => void
}) {
  const plan = data.plan.filter((p) => p.date === date).sort(byStart)
  const done = data.entries.filter((e) => e.date === date).sort(byStart)
  const note = data.notes.find((n) => n.date === date)
  const logged = done.length > 0 || !!note
  const [editing, setEditing] = useState(false)
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [absent, setAbsent] = useState(false)
  const [reason, setReason] = useState('')
  const [absText, setAbsText] = useState('')

  useEffect(() => {
    setEditing(false)
    setAbsent(false); setReason(''); setAbsText('')
    setBlocks(toBlocks(done.length ? done : plan))
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

  async function save(items: TimeBlock[], noteText: string) {
    setBusy(true)
    try {
      await api.remove('entries', { eq: { user_id: data.userId, date } })
      await api.insert('entries', items.filter((b) => blockMinutes(b) > 0).map((b) => ({
        user_id: data.userId, date, modality_id: b.modality_id, minutes: blockMinutes(b), start_time: b.start, end_time: b.end,
      })))
      await api.upsert('day_notes', [{ user_id: data.userId, date, note: noteText }], 'user_id,date')
      await reload()
      toast('Dia lançado ✓')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const isAbsence = logged && done.length === 0 && (note?.note ?? '').startsWith(ABSENCE_PREFIX)
  const absenceNote = () => [ABSENCE_PREFIX + (reason ? ` (${reason.toLowerCase()})` : ''), absText.trim()].filter(Boolean).join(': ')

  const nameOf = (id: string) => data.modalities.find((m) => m.id === id)?.name ?? ''
  const errors = blockErrors(blocks, nameOf)
  const hasErrors = Object.keys(errors).length > 0
  const planTotal = sumMin(plan)
  const doneTotal = sumMin(done)
  const valTotal = blocks.reduce((a, b) => a + blockMinutes(b), 0)
  const showEditor = editing || (!logged && plan.length === 0)

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
            <div className="card-head">
              <h3>Lançado · {fmtH(doneTotal)}</h3>
              {isAbsence
                ? <span className="pill bad">✗ Faltei</span>
                : <span className={`pill ${doneTotal >= planTotal ? 'ok' : 'warn'}`}>{planTotal ? `plano ${fmtH(planTotal)}` : 'sem plano'}</span>}
            </div>
            {done.length === 0 && !isAbsence && <div className="empty">Nenhuma hora neste dia.</div>}
            {done.map((e) => <ItemRow key={e.id} item={e} data={data} />)}
            {note?.note && <div className="sub" style={{ marginTop: 8, fontSize: 14 }}>{isAbsence ? note.note : `Obs.: ${note.note}`}</div>}
            <button className="btn outline small" style={{ marginTop: 12 }} onClick={() => setEditing(true)}>Editar lançamento</button>
          </div>
        )}

        {!logged && plan.length > 0 && (
          <>
            <div className="card">
              <h3>Planejado para o dia · {fmtH(planTotal)}</h3>
              {plan.map((p) => <ItemRow key={p.id} item={p} data={data} />)}
            </div>
            {!editing && !absent && (
              <>
                <button className="btn primary" disabled={busy} onClick={() => save(toBlocks(plan), '')}>✓ Cumpri o planejado</button>
                <button className="btn outline" onClick={() => { setBlocks(toBlocks(plan)); setEditing(true) }}>Fiz diferente ▾</button>
                <button className="btn danger" onClick={() => setAbsent(true)}>✗ Faltei</button>
              </>
            )}
            {absent && (
              <div className="card form">
                <h3 style={{ margin: 0 }}>Faltei · motivo</h3>
                <div className="chips">
                  {ABSENCE_REASONS.map((r) => (
                    <button key={r} className={`chip ${reason === r ? 'on' : ''}`} onClick={() => setReason(reason === r ? '' : r)}>{r}</button>
                  ))}
                </div>
                <input className="input" placeholder="Detalhe (opcional)" value={absText} onChange={(e) => setAbsText(e.target.value)} />
                <div className="sub">O dia fica como não realizado (0 h). Você pode editar depois.</div>
                <div className="row" style={{ gap: 10 }}>
                  <button className="btn ghost small" onClick={() => setAbsent(false)}>Cancelar</button>
                  <button className="btn small" style={{ background: 'var(--bad)', color: '#fff' }} disabled={busy}
                    onClick={() => save([], absenceNote())}>Confirmar falta</button>
                </div>
              </div>
            )}
          </>
        )}

        {!logged && plan.length === 0 && (
          <div className="info">Nada planejado para este dia. Se fez algo, lance abaixo com os horários.</div>
        )}

        {showEditor && (
          <>
            <div className="card">
              <h3>O que foi realizado</h3>
              <div className="sub" style={{ marginBottom: 10 }}>Ajuste a modalidade e os horários reais de início e fim de cada atividade.</div>
              <BlocksEditor modalities={data.modalities} value={blocks} onChange={setBlocks} errors={errors} />
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
            {hasErrors && <div className="error">Corrija os horários em vermelho para salvar.</div>}
            <button className="btn brand" disabled={busy || hasErrors} onClick={() => save(blocks, text)}>{busy ? 'Salvando…' : 'Salvar'}</button>
            {editing && <button className="btn ghost small" onClick={() => setEditing(false)}>Cancelar</button>}
          </>
        )}
      </div>
    </>
  )
}
