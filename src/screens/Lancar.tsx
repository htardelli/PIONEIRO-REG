import { useEffect, useState } from 'react'
import { api } from '../api'
import { blockErrors, blockMinutes, toMinutes, eventName, fmtH, HOLIDAY_LABEL, holidayOf, isoDate, MONTH_NAME, parseIso, toBlocks, WEEKDAY, mondayIndex, WEEK_HEAD, type TimeBlock } from '../domain'
import { absenceOf, dayState, isJoint, pairDay, partnerHasGroup, yearRange, type JointPartner, type YearData } from '../data'
import { BlocksEditor, CalLegend, newBlockAfter, useChoice } from '../ui'
import type { DayItem } from '../types'
import { Icon } from '../icons'

const sumMin = (xs: { minutes: number }[]) => xs.reduce((a, x) => a + x.minutes, 0)

export function ItemRow({ item, data }: { item: DayItem; data: YearData }) {
  const m = data.modalities.find((x) => x.id === item.modality_id)
  return (
    <div className="mod">
      <i className="dot" style={{ background: m?.color }} />
      <span className="n">{m?.name}{item.start_time && <span className="sub"> · {item.start_time.slice(0, 5)}–{item.end_time?.slice(0, 5)}</span>}{isJoint(data, item) && <span className="sub"> · <Icon name="users" size={14} label="atividade conjunta" /></span>}</span>
      {item.absent ? <span className="pill bad">✕ falta</span> : <b>{fmtH(item.minutes)}</b>}
    </div>
  )
}

type Draft = { items: TimeBlock[]; note: string; at: string }

export const byStart = (a: DayItem, b: DayItem) => (a.start_time ?? '').localeCompare(b.start_time ?? '')

const ABSENCE_PREFIX = 'Faltei'
const ABSENCE_REASONS = ['Saúde', 'Trabalho', 'Família', 'Clima', 'Viagem', 'Outro']

export function Lancar({ data, today, minDate, date, setDate, reload, toast, partner }: {
  data: YearData; today: Date; minDate?: string; date: string; setDate: (d: string) => void; reload: () => Promise<void>; toast: (m: string) => void
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
  const absences = dayEntries.filter((e) => e.absent) // faltas por atividade (cada uma ligada à sua atividade)
  const done = dayEntries.filter((e) => !e.absent)
  const absentGroups = new Set(absences.map((e) => e.group_id))
  const plan = planAll.filter((p) => !absences.some((a) => absenceOf(p, a.group_id))) // o que ainda falta lançar
  const note = data.notes.find((n) => n.date === date)
  const logged = done.length > 0 || !!note || (absences.length > 0 && plan.length === 0)
  const [editing, setEditing] = useState(false)
  const [extra, setExtra] = useState<'plan' | 'done' | null>(null) // editor aberto pelo "+ atividade não planejada"
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const clock = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() }
  const [nowMin, setNowMin] = useState(clock)
  useEffect(() => { const t = setInterval(() => setNowMin(clock()), 30000); return () => clearInterval(t) }, [])
  const [picking, setPicking] = useState(false)
  const [absent, setAbsent] = useState(false)
  const [reason, setReason] = useState('')
  const [absText, setAbsText] = useState('')
  const [absSel, setAbsSel] = useState<string[]>([]) // atividades marcadas como falta (ids do plano)
  // Rascunho local: se o salvamento falhar (sem internet), o que foi digitado fica neste aparelho
  const draftKey = `pioneiro-rascunho-${data.userId}-${date}`
  const readDraft = (): Draft | null => { try { return JSON.parse(localStorage.getItem(draftKey) ?? 'null') } catch { return null } }
  const writeDraft = (v: Draft) => { try { localStorage.setItem(draftKey, JSON.stringify(v)) } catch { /* sem armazenamento */ } }
  const clearDraft = () => { try { localStorage.removeItem(draftKey) } catch { /* idem */ } setDraft(null) }
  const [draft, setDraft] = useState<Draft | null>(readDraft)
  useEffect(() => setDraft(readDraft()), [draftKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Troca de dia: fecha edição e formulário de falta
  useEffect(() => {
    setEditing(false); setExtra(null)
    setAbsent(false); setReason(''); setAbsText('')
  }, [date])
  // Dados novos (inclusive vindos do cônjuge em tempo real) só substituem a tela se nada estiver sendo editado
  useEffect(() => {
    if (editing || absent) return
    setBlocks(done.length ? toBlocks(done) : withPartner(toBlocks(plan)))
    setText(note?.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, data, editing, absent])

  /** "+ Atividade não planejada": abre o lançamento do dia com uma atividade nova no fim. */
  function addExtra() {
    const base = done.length ? toBlocks(done) : withPartner(toBlocks(plan.filter((p) => !notYet(p.end_time))))
    setBlocks([...base, newBlockAfter(base, data.modalities)])
    setExtra(base.length > 0 && !done.length ? 'plan' : 'done')
    setEditing(true)
  }

  const d = parseIso(date)
  const from = minDate ?? yearRange(data.sy)[0] // permite o ano de serviço anterior
  const todayIso = isoDate(today)
  const shift = (n: number) => {
    const x = new Date(d); x.setDate(x.getDate() + n)
    setDate(isoDate(x))
  }

  /** Linha de uma falta: atividade, motivo e "Desfazer" (para falta lançada por engano). */
  const AbsentRow = ({ item }: { item: DayItem }) => (
    <div className="absrow">
      <ItemRow item={item} data={data} />
      <div className="absrow-foot">
        {item.note && <span className="sub">{item.note}</span>}
        <button className="link" disabled={busy} onClick={() => undoAbsence(item.id)}>Desfazer falta</button>
      </div>
    </div>
  )

  /** Grava a falta de cada atividade escolhida (só dela — as outras do dia continuam pendentes). */
  async function insertAbsences(items: DayItem[], noteText: string) {
    await api.insert('entries', items.map((p) => ({
      user_id: data.userId, date, modality_id: p.modality_id, minutes: 0, start_time: p.start_time, end_time: p.end_time,
      group_id: p.group_id ?? p.id, absent: true, note: noteText,
    })))
  }

  /** Falta nas atividades marcadas. Se alguma for conjunta e o participante ainda não lançou, pergunta se ele(a) também faltou. */
  async function confirmAbsence() {
    const note = absenceNote()
    const chosen = pending.filter((p) => absSel.includes(p.id))
    if (!chosen.length) return toast('Marque em qual atividade você faltou.')
    const joint = partner ? chosen.filter((p) => p.group_id && partnerHasGroup(partner.data.plan, date, p.group_id)
      && !partnerHasGroup(partner.data.entries, date, p.group_id)) : []
    let both = false
    if (partner && joint.length) {
      const desc = joint.map((p) => `${nameOf(p.modality_id)} ${p.start_time?.slice(0, 5)}–${p.end_time?.slice(0, 5)}`).join('\n')
      const r = await choice.ask<'both' | 'me'>(
        `${pFirst} também faltou?`,
        [{ label: 'Sim, os dois faltamos', value: 'both', kind: 'danger' }, { label: 'Só eu faltei', value: 'me', kind: 'outline' }],
        `Atividade conjunta:\n${desc}\n\nSe sim, a falta (com o mesmo motivo) é lançada para ${pFirst} só nessa atividade.`,
      )
      if (!r) return
      both = r === 'both'
    }
    setBusy(true)
    try {
      if (both && partner) await api.rpc('partner_absence_add', { p_partner: partner.id, p_date: date, p_groups: joint.map((p) => p.group_id), p_note: `${note} — atividade conjunta` })
      await insertAbsences(chosen, note)
      setAbsent(false); setReason(''); setAbsText(''); setAbsSel([])
      await reload()
      toast(`Falta lançada${chosen.length > 1 ? ` em ${chosen.length} atividades` : ''}${both ? ` · também para ${pFirst}` : ''}`)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** Desfaz a falta de UMA atividade (lançada por engano): ela volta a ficar pendente. Sem id: falta antiga do dia inteiro. */
  async function undoAbsence(entryId?: string) {
    if (!confirm('Desfazer esta falta? A atividade volta a ficar pendente para lançar.')) return
    setBusy(true)
    try {
      if (entryId) await api.remove('entries', { eq: { id: entryId, user_id: data.userId } })
      // dia sem horas que ficou só com a observação de falta (ou vazia): o dia volta a ficar sem lançamento
      const left = absences.filter((a) => a.id !== entryId)
      if (done.length === 0 && note && (!entryId || left.length === 0) && (note.note === '' || note.note.startsWith(ABSENCE_PREFIX)))
        await api.remove('day_notes', { eq: { user_id: data.userId, date } })
      await reload()
      toast('Falta desfeita')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
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
      // tudo numa transação só (save_day): ou grava o dia inteiro, ou nada muda.
      // mantém as faltas por atividade, exceto das atividades que agora foram lançadas
      const relaunched = blocks.map((b) => b.group_id).filter((g): g is string => !!g && absentGroups.has(g))
      // dia com horas deixa de ser falta: a nota "Faltei…" não fica como observação
      const finalNote = blocks.some((b) => blockMinutes(b) > 0) && noteText.startsWith(ABSENCE_PREFIX) ? '' : noteText
      await api.rpc('save_day', {
        p_date: date, p_note: finalNote, p_relaunched: relaunched,
        p_items: blocks.filter((b) => blockMinutes(b) > 0).map((b) => ({
          modality_id: b.modality_id, minutes: blockMinutes(b), start: b.start, end: b.end, group_id: b.group_id ?? null,
        })),
      })
      clearDraft()
      setEditing(false); setExtra(null); setAbsent(false); setReason(''); setAbsText('')
      await reload()
      toast(shared ? `Dia lançado ✓ · também para ${pFirst}` : 'Dia lançado ✓')
    } catch (e) {
      // sem conexão ou erro do servidor: nada foi gravado; guarda o que foi digitado para não perder
      // guarda os blocos já com group_id: ao reenviar, o cônjuge não recebe a atividade em dobro
      const dr = { items: blocks, note: noteText, at: new Date().toISOString() }
      writeDraft(dr)
      setDraft(dr)
      toast(`Não foi salvo: ${(e as Error).message} — rascunho guardado neste aparelho.`)
    } finally {
      setBusy(false)
    }
  }

  /** Salvar do editor: dia sem nenhuma hora não vira falta "muda" — pergunta o motivo (ou apaga o lançamento). */
  async function saveEditor() {
    if (blocks.some((b) => blockMinutes(b) > 0) || text.startsWith(ABSENCE_PREFIX)) return save(blocks, text)
    if (planAll.length) {
      const r = await choice.ask<string>('Nenhuma hora lançada. Foi falta?',
        ABSENCE_REASONS.map((x) => ({ label: `Faltei · ${x}`, value: x, kind: 'outline' as const })),
        'Escolha o motivo para registrar a falta. Para lançar horas, toque em Cancelar e adicione as atividades.')
      if (!r) return
      // falta em cada atividade planejada do dia (individual); o que tinha sido lançado sai
      setBusy(true)
      try {
        await api.remove('entries', { eq: { user_id: data.userId, date, absent: false } })
        await api.remove('day_notes', { eq: { user_id: data.userId, date } })
        await insertAbsences(plan, [`${ABSENCE_PREFIX} (${r.toLowerCase()})`, text.trim()].filter(Boolean).join(': '))
        clearDraft(); setEditing(false); setExtra(null)
        await reload(); toast('Falta lançada')
      } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
      return
    }
    if (!logged) return toast('Nada para salvar: adicione uma atividade com horário.')
    if (!confirm('Apagar o lançamento deste dia? Ele volta a ficar sem lançamento.')) return
    setBusy(true)
    try {
      await api.remove('entries', { eq: { user_id: data.userId, date, absent: false } })
      await api.remove('day_notes', { eq: { user_id: data.userId, date } })
      clearDraft(); setEditing(false); setExtra(null); await reload(); toast('Lançamento apagado')
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  /** "Cumpri o planejado": se houver atividade conjunta ainda não lançada pelo participante, pergunta se ele(a) participou. */
  async function confirmPlanned() {
    let bs = withPartner(toBlocks(ready))
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
    const all = [...toBlocks(done), ...bs] // mantém o que já foi lançado no dia
    if (Object.keys(blockErrors(all, nameOf)).length) { // horário em conflito com algo já lançado: abre para ajustar
      setBlocks(all); setEditing(true)
      return toast('Há conflito de horário com o que já foi lançado. Ajuste e salve.')
    }
    await save(all, note?.note ?? '')
  }

  const isAbsence = logged && done.length === 0 && ((note?.note ?? '').startsWith(ABSENCE_PREFIX) || (absences.length > 0 && plan.length === 0))
  const legacyAbsence = isAbsence && absences.length === 0 // falta antiga (dia inteiro, gravada na observação)
  const absenceNote = () => [ABSENCE_PREFIX + (reason ? ` (${reason.toLowerCase()})` : ''), absText.trim()].filter(Boolean).join(': ')

  const nameOf = (id: string) => data.modalities.find((m) => m.id === id)?.name ?? ''
  // Não deixa lançar atividade de hoje que ainda não terminou (fim depois do horário atual)
  const notYet = (end?: string | null) => date === todayIso && !!end && toMinutes(end.slice(0, 5)) > nowMin
  const errors: Record<number, string> = { ...blockErrors(blocks, nameOf) }
  blocks.forEach((b, i) => { if (!errors[i] && notYet(b.end)) errors[i] = `Termina às ${b.end.slice(0, 5)}: só pode ser lançada depois desse horário.` })
  // Atividades do plano ainda não lançadas: as que já terminaram podem ser lançadas agora; as demais, depois do horário
  const pending = !logged || date === todayIso ? pairDay(plan, done).filter((r) => r.plan && !r.done).map((r) => r.plan!) : []
  const ready = pending.filter((p) => !notYet(p.end_time))
  const later = pending.filter((p) => notYet(p.end_time))
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
        {draft && (
          <div className="alert">
            <div className="grow">
              <b>Lançamento não salvo</b>
              <div className="sub">Rascunho de {fmtH(draft.items.reduce((a, b) => a + blockMinutes(b), 0))} guardado neste aparelho em {new Date(draft.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.</div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn small primary" onClick={() => { setBlocks(draft.items); setText(draft.note); setExtra(null); setEditing(true) }}>Recuperar</button>
                <button className="btn small ghost" onClick={() => { if (confirm('Descartar o rascunho?')) clearDraft() }}>Descartar</button>
              </div>
            </div>
          </div>
        )}
        {(holidayOf(date) || data.events.some((e) => e.date === date)) && (
          <div className="daytags" style={{ marginBottom: 0 }}>
            {holidayOf(date) && <div className="daytag hol"><span className="grow"><Icon name="flag" /> {holidayOf(date)!.name}</span><span className="sub">{HOLIDAY_LABEL[holidayOf(date)!.kind]}</span></div>}
            {data.events.filter((e) => e.date === date).map((e) => <div className="daytag ev" key={e.id}><Icon name="pin" /> {eventName(e)}</div>)}
          </div>
        )}
        {logged && !editing && (
          <div className="card">
            <div className="card-head">
              <h3>Lançado · {fmtH(doneTotal)}</h3>
              {isAbsence
                ? <span className="pill bad">✕ Faltei</span>
                : <span className={`pill ${doneTotal >= planTotal ? 'ok' : 'warn'}`}>{planTotal ? `plano ${fmtH(planTotal)}` : 'sem plano'}</span>}
            </div>
            {done.length === 0 && !isAbsence && <div className="empty">Nenhuma hora neste dia.</div>}
            {[...done, ...absences].sort(byStart).map((e) => e.absent ? <AbsentRow key={e.id} item={e} /> : <ItemRow key={e.id} item={e} data={data} />)}
            {note?.note && <div className="sub" style={{ marginTop: 8, fontSize: 14 }}>{legacyAbsence ? note.note : `Obs.: ${note.note}`}</div>}
            {legacyAbsence && <button className="link" style={{ marginTop: 6 }} disabled={busy} onClick={() => undoAbsence()}>Desfazer falta</button>}
            <button className="btn outline small" style={{ marginTop: 12 }} onClick={() => setEditing(true)}>Editar lançamento</button>
          </div>
        )}

        {!logged && absences.length > 0 && (
          <div className="card">
            <h3>Falta registrada</h3>
            {absences.map((e) => <AbsentRow key={e.id} item={e} />)}
          </div>
        )}

        {pending.length > 0 && !isAbsence && !editing && (
          <>
            <div className="card">
              <h3>{done.length ? 'Ainda a lançar' : 'Planejado para o dia'} · {fmtH(sumMin(pending))}</h3>
              {pending.map((p) => (
                <div key={p.id} style={{ opacity: notYet(p.end_time) ? 0.55 : 1 }}>
                  <ItemRow item={p} data={data} />
                  {notYet(p.end_time) && <div className="sub" style={{ marginTop: -4, marginBottom: 4 }}><Icon name="clock" size={13} /> libera às {p.end_time!.slice(0, 5)}</div>}
                </div>
              ))}
            </div>
            {!absent && (
              <>
                <button className="btn primary" disabled={busy || ready.length === 0} onClick={confirmPlanned}>
                  {ready.length === 0 ? `✓ Cumpri o planejado · após ${later[0].end_time!.slice(0, 5)}`
                    : later.length ? `✓ Cumpri as que já terminaram (${ready.length})` : '✓ Cumpri o planejado'}
                </button>
                <button className="btn outline" onClick={() => { setBlocks([...toBlocks(done), ...withPartner(toBlocks(pending))]); setEditing(true) }}>Fiz diferente ▾</button>
                <button className="btn danger" onClick={() => { setAbsSel(pending.length === 1 ? [pending[0].id] : []); setAbsent(true) }}>✕ Faltei</button>
              </>
            )}
            {absent && (
              <div className="card form">
                <h3 style={{ margin: 0 }}>Faltei · em qual atividade?</h3>
                <div className="abs-pick">
                  {pending.map((p) => (
                    <label key={p.id} className={`abs-opt ${absSel.includes(p.id) ? 'on' : ''}`}>
                      <input type="checkbox" checked={absSel.includes(p.id)}
                        onChange={() => setAbsSel((xs) => (xs.includes(p.id) ? xs.filter((x) => x !== p.id) : [...xs, p.id]))} />
                      <span>{p.start_time?.slice(0, 5)}–{p.end_time?.slice(0, 5)} · <b>{nameOf(p.modality_id)}</b></span>
                      <span className="sub">{fmtH(p.minutes)}</span>
                    </label>
                  ))}
                </div>
                <h3 style={{ margin: '4px 0 0' }}>Motivo</h3>
                <div className="chips">
                  {ABSENCE_REASONS.map((r) => (
                    <button key={r} className={`chip ${reason === r ? 'on' : ''}`} onClick={() => setReason(reason === r ? '' : r)}>{r}</button>
                  ))}
                </div>
                <input className="input" placeholder="Detalhe (opcional)" value={absText} onChange={(e) => setAbsText(e.target.value)} />
                <div className="sub">Só as atividades marcadas ficam como falta (0 h); as outras do dia continuam para lançar. Dá para desfazer depois.</div>
                <div className="row" style={{ gap: 10 }}>
                  <button className="btn ghost small" onClick={() => setAbsent(false)}>Cancelar</button>
                  <button className="btn small" style={{ background: 'var(--bad)', color: '#fff' }} disabled={busy}
                    onClick={confirmAbsence}>Confirmar falta{absSel.length > 1 ? ` (${absSel.length})` : ''}</button>
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
            <button className="btn brand" disabled={busy || hasErrors} onClick={saveEditor}>{busy ? 'Salvando…' : 'Salvar'}</button>
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
