import { useEffect, useState } from 'react'
import { api } from '../api'
import { blockErrors, blockMinutes, eventName, fmtH, HOLIDAY_LABEL, holidayOf, isoDate, MONTH_NAME, parseIso, toBlocks, WEEKDAY, mondayIndex, WEEK_HEAD, type TimeBlock } from '../domain'
import { dayState, partnerHasGroup, yearRange, type JointPartner, type YearData } from '../data'
import { BlocksEditor, CalLegend, newBlockAfter, useChoice } from '../ui'
import type { DayItem } from '../types'

const sumMin = (xs: { minutes: number }[]) => xs.reduce((a, x) => a + x.minutes, 0)

export function ItemRow({ item, data }: { item: DayItem; data: YearData }) {
  const m = data.modalities.find((x) => x.id === item.modality_id)
  return (
    <div className="mod">
      <i className="dot" style={{ background: m?.color }} />
      <span className="n">{m?.name}{item.start_time && <span className="sub"> · {item.start_time.slice(0, 5)}–{item.end_time?.slice(0, 5)}</span>}{item.group_id && <span className="sub"> · 👥</span>}</span>
      {item.absent ? <span className="pill bad">✗ falta</span> : <b>{fmtH(item.minutes)}</b>}
    </div>
  )
}

export const byStart = (a: DayItem, b: DayItem) => (a.start_time ?? '').localeCompare(b.start_time ?? '')

const ABSENCE_PREFIX = 'Faltei'
const ABSENCE_REASONS = ['Saúde', 'Trabalho', 'Família', 'Clima', 'Viagem', 'Outro']

export function Lancar({ data, today, date, setDate, reload, toast, partner }: {
  data: YearData; today: Date; date: string; setDate: (d: string) => void; reload: () => Promise<void>; toast: (m: string) => void
  partner: JointPartner | null
}) {
  const choice = useChoice()
  const pFirst = partner?.name.split(' ')[0] ?? ''
  /** Marca como "participou" as atividades conjuntas que o participante ainda não lançou. */
  const withPartner = (bs: TimeBlock[]): TimeBlock[] => bs.map((b) =>
    partner && b.group_id && partnerHasGroup(partner.data.plan, date, b.group_id) && !partnerHasGroup(partner.data.entries, date, b.group_id)
      ? { ...b, with: [partner.id] } : b)
  const planAll = data.plan.filter((p) => p.date === date).sort(byStart)
  const dayEntries = data.entries.filter((e) => e.date === date).sort(byStart)
  const absences = dayEntries.filter((e) => e.absent) // faltas por atividade (conjunta)
  const done = dayEntries.filter((e) => !e.absent)
  const absentGroups = new Set(absences.map((e) => e.group_id))
  const plan = planAll.filter((p) => !(p.group_id && absentGroups.has(p.group_id))) // o que ainda falta lançar
  const note = data.notes.find((n) => n.date === date)
  const logged = done.length > 0 || !!note || (absences.length > 0 && plan.length === 0)
  const [editing, setEditing] = useState(false)
  const [extra, setExtra] = useState<'plan' | 'done' | null>(null) // editor aberto pelo "+ atividade não planejada"
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [absent, setAbsent] = useState(false)
  const [reason, setReason] = useState('')
  const [absText, setAbsText] = useState('')

  useEffect(() => {
    setEditing(false); setExtra(null)
    setAbsent(false); setReason(''); setAbsText('')
    setBlocks(done.length ? toBlocks(done) : withPartner(toBlocks(plan)))
    setText(note?.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, data])

  /** "+ Atividade não planejada": abre o lançamento do dia com uma atividade nova no fim. */
  function addExtra() {
    const base = done.length ? toBlocks(done) : withPartner(toBlocks(plan))
    setBlocks([...base, newBlockAfter(base, data.modalities)])
    setExtra(done.length || !plan.length ? 'done' : 'plan')
    setEditing(true)
  }

  const d = parseIso(date)
  const [from] = yearRange(data.sy)
  const todayIso = isoDate(today)
  const shift = (n: number) => {
    const x = new Date(d); x.setDate(x.getDate() + n)
    setDate(isoDate(x))
  }

  /** Falta: se houver atividade conjunta que o participante ainda não lançou, pergunta se ele(a) também faltou. */
  async function confirmAbsence() {
    const note = absenceNote()
    // só as atividades conjuntas que o participante ainda não lançou
    const joint = partner ? toBlocks(plan).filter((b) => b.group_id && partnerHasGroup(partner.data.plan, date, b.group_id)
      && !partnerHasGroup(partner.data.entries, date, b.group_id)) : []
    if (partner && joint.length) {
      const desc = joint.map((b) => `${data.modalities.find((m) => m.id === b.modality_id)?.name ?? ''} ${b.start}–${b.end}`).join('\n')
      const r = await choice.ask<'both' | 'me'>(
        `${pFirst} também faltou?`,
        [{ label: 'Sim, os dois faltamos', value: 'both', kind: 'danger' }, { label: 'Só eu faltei', value: 'me', kind: 'outline' }],
        `Atividade conjunta neste dia:\n${desc}\n\nSe sim, a falta (com o mesmo motivo) é lançada para ${pFirst} só nessa atividade — as outras atividades dele(a) no dia continuam para ele(a) lançar.`,
      )
      if (!r) return
      if (r === 'both') {
        try {
          await api.rpc('partner_absence_add', { p_partner: partner.id, p_date: date, p_groups: joint.map((b) => b.group_id), p_note: `${note} — atividade conjunta` })
        } catch (e) {
          return toast((e as Error).message)
        }
        await save([], note)
        return toast(`Falta lançada para você e ${pFirst}`)
      }
    }
    await save([], note)
  }

  async function save(items: TimeBlock[], noteText: string) {
    const nameOfMod = (id: string) => data.modalities.find((m) => m.id === id)?.name ?? ''
    const blocks = items.map((b) => (partner && b.with?.includes(partner.id) && !b.group_id ? { ...b, group_id: crypto.randomUUID() } : b))
    setBusy(true)
    try {
      let shared = 0
      if (partner) {
        const pItems = blocks.filter((b) => b.with?.includes(partner.id) && blockMinutes(b) > 0)
          .map((b) => ({ date, group_id: b.group_id, modality: nameOfMod(b.modality_id), start: b.start, end: b.end }))
        if (pItems.length) shared = Number(await api.rpc('partner_entries_add', { p_partner: partner.id, p_items: pItems })) || 0
      }
      // mantém as faltas por atividade, exceto das atividades que agora foram lançadas
      await api.remove('entries', { eq: { user_id: data.userId, date, absent: false } })
      const relaunched = blocks.map((b) => b.group_id).filter((g): g is string => !!g && absentGroups.has(g))
      if (relaunched.length) await api.remove('entries', { eq: { user_id: data.userId, date, absent: true }, in: ['group_id', relaunched] })
      await api.insert('entries', blocks.filter((b) => blockMinutes(b) > 0).map((b) => ({
        user_id: data.userId, date, modality_id: b.modality_id, minutes: blockMinutes(b), start_time: b.start, end_time: b.end,
        group_id: b.group_id ?? null,
      })))
      await api.upsert('day_notes', [{ user_id: data.userId, date, note: noteText }], 'user_id,date')
      await reload()
      toast(shared ? `Dia lançado ✓ · também para ${pFirst}` : 'Dia lançado ✓')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** "Cumpri o planejado": se houver atividade conjunta ainda não lançada pelo participante, pergunta se ele(a) participou. */
  async function confirmPlanned() {
    let bs = withPartner(toBlocks(plan))
    const pending = bs.filter((b) => b.with?.length)
    if (pending.length && partner) {
      const desc = pending.map((b) => `${data.modalities.find((m) => m.id === b.modality_id)?.name ?? ''} ${b.start}–${b.end}`).join('\n')
      const r = await choice.ask<'both' | 'me'>(
        `${pFirst} também participou?`,
        [{ label: `Sim, os dois participamos`, value: 'both' }, { label: 'Só eu participei', value: 'me' }],
        `Atividade conjunta:\n${desc}\n\nSe sim, o realizado também é lançado para ${pFirst} (que pode ajustar depois).`,
      )
      if (!r) return
      if (r === 'me') bs = bs.map((b) => ({ ...b, with: [] }))
    }
    await save(bs, '')
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
            <button className="date-pick" onClick={() => setPicking(true)} aria-label="Escolher data no calendário">
              {d.getDate()} de {MONTH_NAME[d.getMonth()].toLowerCase()} <span className="caret">▾</span>
            </button>
            <button className="arrow" onClick={() => shift(1)} disabled={date >= todayIso}>›</button>
          </span>
          {date === todayIso ? <span className="link">Hoje</span> : <button className="link" onClick={() => setDate(todayIso)}>Ir p/ hoje</button>}
        </div>
      </header>
      <div className="main">
        {(holidayOf(date) || data.events.some((e) => e.date === date)) && (
          <div className="daytags" style={{ marginBottom: 0 }}>
            {holidayOf(date) && <div className="daytag hol"><span className="grow">🇧🇷 {holidayOf(date)!.name}</span><span className="sub">{HOLIDAY_LABEL[holidayOf(date)!.kind]}</span></div>}
            {data.events.filter((e) => e.date === date).map((e) => <div className="daytag ev" key={e.id}>📌 {eventName(e)}</div>)}
          </div>
        )}
        {logged && !editing && (
          <div className="card">
            <div className="card-head">
              <h3>Lançado · {fmtH(doneTotal)}</h3>
              {isAbsence
                ? <span className="pill bad">✗ Faltei</span>
                : <span className={`pill ${doneTotal >= planTotal ? 'ok' : 'warn'}`}>{planTotal ? `plano ${fmtH(planTotal)}` : 'sem plano'}</span>}
            </div>
            {done.length === 0 && !isAbsence && <div className="empty">Nenhuma hora neste dia.</div>}
            {[...done, ...absences].sort(byStart).map((e) => <ItemRow key={e.id} item={e} data={data} />)}
            {note?.note && <div className="sub" style={{ marginTop: 8, fontSize: 14 }}>{isAbsence ? note.note : `Obs.: ${note.note}`}</div>}
            <button className="btn outline small" style={{ marginTop: 12 }} onClick={() => setEditing(true)}>Editar lançamento</button>
          </div>
        )}

        {!logged && absences.length > 0 && (
          <div className="card">
            <h3>Falta registrada</h3>
            {absences.map((e) => <ItemRow key={e.id} item={e} data={data} />)}
            {absences[0]?.note && <div className="sub" style={{ marginTop: 6 }}>{absences[0].note}</div>}
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
                <button className="btn primary" disabled={busy} onClick={confirmPlanned}>✓ Cumpri o planejado</button>
                <button className="btn outline" onClick={() => { setBlocks(withPartner(toBlocks(plan))); setEditing(true) }}>Fiz diferente ▾</button>
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
                    onClick={confirmAbsence}>Confirmar falta</button>
                </div>
              </div>
            )}
          </>
        )}

        {!logged && plan.length === 0 && (
          <div className="info">Nada planejado para este dia. Se fez algo, lance abaixo com os horários.</div>
        )}

        {!showEditor && !absent && (
          <button className="btn outline" onClick={addExtra}>+ Atividade não planejada</button>
        )}

        {showEditor && (
          <>
            <div className="card">
              <h3>O que foi realizado</h3>
              <div className="sub" style={{ marginBottom: 10 }}>
                {extra === 'plan' ? 'A nova atividade foi adicionada no fim. As atividades do plano vieram junto: ajuste ou remova (✕) as que não fez.'
                  : extra === 'done' ? 'A nova atividade foi adicionada no fim. Ajuste a modalidade e os horários.'
                  : 'Ajuste a modalidade e os horários reais de início e fim de cada atividade.'}
              </div>
              <BlocksEditor modalities={data.modalities} value={blocks} onChange={setBlocks} errors={errors}
                partners={partner ? [{ id: partner.id, name: partner.name }] : []} partnerHint="{nome} participou" />
              {partner && <div className="sub" style={{ marginTop: 8 }}>Marque "{pFirst} participou" para lançar também para {pFirst} (se ainda não lançou). Ajustes posteriores de um não alteram o do outro.</div>}
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
            {editing && <button className="btn ghost small" onClick={() => { setEditing(false); setExtra(null); setBlocks(done.length ? toBlocks(done) : withPartner(toBlocks(plan))) }}>Cancelar</button>}
          </>
        )}
      </div>
      {picking && (
        <DatePickerSheet data={data} today={today} value={date} min={from} max={todayIso}
          onPick={(dt) => { setDate(dt); setPicking(false) }} onClose={() => setPicking(false)} />
      )}
      {choice.node}
    </>
  )
}

/** Calendário para escolher o dia a lançar; as cores mostram o que já foi lançado. */
function DatePickerSheet({ data, today, value, min, max, onPick, onClose }: {
  data: YearData; today: Date; value: string; min: string; max: string; onPick: (d: string) => void; onClose: () => void
}) {
  const [month, setMonth] = useState(value.slice(0, 7))
  const [y, m] = month.split('-').map(Number)
  const firstDow = mondayIndex(new Date(y, m - 1, 1))
  const nDays = new Date(y, m, 0).getDate()
  const shiftMonth = (n: number) => {
    const x = new Date(y, m - 1 + n, 1)
    setMonth(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  }
  const prevOk = `${month}-01` > min
  const nextOk = `${month}-31` < max
  let pending = 0
  const cells = Array.from({ length: nDays }, (_, i) => {
    const dt = `${month}-${String(i + 1).padStart(2, '0')}`
    const disabled = dt < min || dt > max
    const st = dayState(data, dt, today)
    // pendente: dia passado com plano e sem nenhum lançamento
    const cls = disabled ? 'off' : st.state === 'done' ? 'done' : st.state === 'part' ? 'part'
      : st.state === 'miss' ? (st.logged ? 'miss' : 'pend') : st.logged ? 'done' : ''
    if (cls === 'pend') pending++
    const hol = holidayOf(dt)
    const ev = data.events.some((e) => e.date === dt)
    const mark = (hol || ev) ? <span className="dmk">{hol && <i className={`hol ${hol.kind}`} />}{ev && <i className="ev" />}</span> : null
    return { dt, day: i + 1, disabled, cls, done: st.done, mark }
  })
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card dialog" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <span className="nav-arrows" style={{ fontWeight: 800, fontSize: 18 }}>
            <button className="arrow" onClick={() => shiftMonth(-1)} disabled={!prevOk}>‹</button>
            {MONTH_NAME[m - 1]} {y}
            <button className="arrow" onClick={() => shiftMonth(1)} disabled={!nextOk}>›</button>
          </span>
          <button className="link" onClick={onClose}>Fechar</button>
        </div>
        <div className="cal">
          {WEEK_HEAD.map((h, i) => <div className="h" key={i}>{h}</div>)}
          {Array.from({ length: firstDow }, (_, i) => <div className="d x" key={'x' + i} />)}
          {cells.map((c) => (
            <button key={c.dt} disabled={c.disabled} onClick={() => onPick(c.dt)}
              className={`d ${c.cls} ${c.dt === value ? 'sel' : ''} ${c.dt === max ? 'today' : ''}`}>
              {c.day}
              {c.mark}
              {c.done > 0 && <em>{fmtH(c.done)}</em>}
            </button>
          ))}
        </div>
        <div className="legend">
          <CalLegend pending />
        </div>
        {pending > 0 && <div className="sub" style={{ marginTop: 8 }}>{pending} dia{pending > 1 ? 's' : ''} planejado{pending > 1 ? 's' : ''} sem lançamento neste mês.</div>}
      </div>
    </div>
  )
}
