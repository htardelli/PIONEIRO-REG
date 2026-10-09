import { useEffect, useState } from 'react'
import { api } from '../api'
import {
  blockErrors, blockMinutes, dateRuns, fmtRun, DEFAULT_EVENT_TYPES, EVENT_OTHER, eventName, holidayOf, HOLIDAY_LABEL, blocksSignature, daysInMonth, deleteRange, fmtH, fmtHours, isoDate, parseHM, monthLabel, parseIso, repeatDates,
  serviceYearMonths, toBlocks, WEEKDAY_PLURAL, WEEKDAY_SHORT, type DeleteScope, type TimeBlock, mondayIndex, WEEK_HEAD,
} from '../domain'
import { dayState, monthStats, partnerHasGroup, yearStats, type JointPartner, type YearData } from '../data'
import { BlocksEditor, CalLegend, Header, MonthNav, useChoice } from '../ui'
import type { DayEvent } from '../types'

type Scope = 'all' | 'me'

const DELETE_LABEL: Record<DeleteScope, string> = { day: 'Dia', week: 'Semana', month: 'Mês', year: 'Ano' }

export function Plano({ data, today, month, setMonth, reload, toast, partner }: {
  data: YearData; today: Date; month: string; setMonth: (m: string) => void; reload: () => Promise<void>; toast: (m: string) => void
  partner: JointPartner | null
}) {
  const choice = useChoice()
  const pFirst = partner?.name.split(' ')[0] ?? ''
  const months = serviceYearMonths(data.sy)
  const idx = months.indexOf(month)
  const ms = monthStats(data, month, today)
  const ys = yearStats(data, today)
  const todayIso = isoDate(today)
  const [sel, setSel] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [original, setOriginal] = useState<TimeBlock[]>([])
  const [delScope, setDelScope] = useState<DeleteScope>('day')
  const [delPast, setDelPast] = useState(false)
  const [differ, setDiffer] = useState<string[] | null>(null) // dias de destino com plano diferente (aguardando decisão)
  const [scope, setScope] = useState<'day' | 'month' | 'year'>('day')
  const [goalH, setGoalH] = useState(ms.goal ? fmtH(ms.goal) : '')
  const [busy, setBusy] = useState(false)
  const [multi, setMulti] = useState(false) // modo seleção de vários dias
  const [picked, setPicked] = useState<string[]>([])
  const [evDates, setEvDates] = useState<string[] | null>(null) // formulário de evento aberto para estas datas
  const [evRange, setEvRange] = useState(false) // formulário com período (data inicial e final)

  useEffect(() => { setGoalH(ms.goal ? fmtH(ms.goal) : ''); setSel(null) }, [month, ms.goal])
  useEffect(() => { setPicked([]); setEvDates(null) }, [month])
  useEffect(() => {
    if (!sel) return
    const loaded = toBlocks(data.plan.filter((x) => x.date === sel)).map((b) =>
      partner && partnerHasGroup(partner.data.plan, sel, b.group_id) ? { ...b, with: [partner.id] } : b)
    setBlocks(loaded)
    setOriginal(loaded)
    setDiffer(null)
    setScope('day')
    setDelScope('day')
    setDelPast(false)
  }, [sel, data])

  const [y, mo] = month.split('-').map(Number)
  const firstDow = mondayIndex(new Date(y, mo - 1, 1))
  const nDays = daysInMonth(month)

  async function saveGoal() {
    const min = parseHM(goalH) // vazio = sem meta
    if (min === null) return toast('Meta inválida: use hh:mm (ex.: 50:00)')
    const h = min
    await api.upsert('month_records', [{ user_id: data.userId, month, goal_min: min }], 'user_id,month')
    await reload()
    toast(h ? 'Meta do mês salva' : 'Meta do mês removida')
  }

  /** Primeiro passo: se algum dia de destino já tem plano diferente, pergunta antes de substituir. */
  function requestSave() {
    if (!sel) return
    const sig = blocksSignature(blocks)
    const conflicting = repeatDates(sel, scope, todayIso).filter((dt) => {
      if (dt === sel) return false
      const items = data.plan.filter((p) => p.date === dt)
      return items.length > 0 && blocksSignature(toBlocks(items)) !== sig
    })
    if (conflicting.length) setDiffer(conflicting)
    else void savePlan([])
  }

  async function savePlan(skip: string[]) {
    if (!sel) return
    setDiffer(null)
    const dates = repeatDates(sel, scope, todayIso).filter((dt) => !skip.includes(dt))
    const nameOfMod = (id: string) => data.modalities.find((m) => m.id === id)?.name ?? ''
    // Blocos conjuntos ganham um group_id (o mesmo nos dois planos)
    let next: TimeBlock[] = blocks.map((b) => (partner && b.with?.includes(partner.id) && !b.group_id ? { ...b, group_id: crypto.randomUUID() } : b))

    // Atividades conjuntas que já existiam e foram alteradas/removidas: perguntar o alcance
    const removedGroups: string[] = []
    const changedGroups: string[] = []
    if (partner) {
      for (const o of original.filter((x) => x.group_id && x.with?.includes(partner.id))) {
        const nb = next.find((x) => x.group_id === o.group_id)
        if (!nb || !nb.with?.includes(partner.id)) removedGroups.push(o.group_id!)
        else if (nb.start !== o.start || nb.end !== o.end || nb.modality_id !== o.modality_id) changedGroups.push(o.group_id!)
      }
    }
    let scopeChoice: Scope = 'all'
    if (removedGroups.length || changedGroups.length) {
      const r = await choice.ask<Scope>(
        'Atividade conjunta alterada',
        [{ label: 'Para todos os participantes', value: 'all' }, { label: 'Só para mim', value: 'me' }],
        `Você ${removedGroups.length ? 'removeu' : 'alterou'} uma atividade feita com ${pFirst}. A mudança vale para quem?`,
      )
      if (!r) return
      scopeChoice = r
      if (r === 'me') {
        // desvincula: o plano de quem não foi alterado fica como estava
        next = next.map((x) => (x.group_id && changedGroups.includes(x.group_id) ? { ...x, group_id: null, with: [] } : x))
      }
      // atividade que deixou de ser conjunta (chip desmarcado) perde o vínculo no meu plano
      next = next.map((x) => (x.group_id && removedGroups.includes(x.group_id) ? { ...x, group_id: null, with: [] } : x))
    }

    setBusy(true)
    try {
      if (partner) {
        const items = dates.flatMap((date) => next.filter((x) => x.with?.includes(partner.id) && x.group_id)
          .map((x) => ({ date, group_id: x.group_id, modality: nameOfMod(x.modality_id), start: x.start, end: x.end })))
        if (items.length) await api.rpc('partner_plan_upsert', { p_partner: partner.id, p_items: items })
        if (scopeChoice === 'all' && removedGroups.length) {
          await api.rpc('partner_plan_delete_dates', { p_partner: partner.id, p_groups: removedGroups, p_dates: dates })
        }
      }
      await api.remove('plan_items', { eq: { user_id: data.userId }, in: ['date', dates] })
      const rows = dates.flatMap((date) => next.map((x) => ({
        user_id: data.userId, date, modality_id: x.modality_id, minutes: blockMinutes(x), start_time: x.start, end_time: x.end,
        group_id: x.group_id ?? null,
      })))
      for (let i = 0; i < rows.length; i += 500) await api.insert('plan_items', rows.slice(i, i + 500))
      await reload()
      const joint = next.some((x) => partner && x.with?.includes(partner.id))
      toast((dates.length > 1 ? `Plano aplicado em ${dates.length} dias` : 'Plano salvo') + (joint ? ` · incluído no plano de ${pFirst}` : ''))
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
    const jointGroups = partner ? [...new Set(data.plan
      .filter((p) => p.date >= delFrom && p.date <= delTo && p.group_id && partnerHasGroup(partner.data.plan, p.date, p.group_id))
      .map((p) => p.group_id!))] : []
    let alsoPartner = false
    if (jointGroups.length) {
      const r = await choice.ask<Scope>(
        `Excluir o planejamento ${what}?`,
        [{ label: 'Para todos os participantes', value: 'all', kind: 'danger' }, { label: 'Só para mim', value: 'me', kind: 'outline' }],
        `Há atividades feitas com ${pFirst} nesse período. Excluir também do plano dele(a)?\nOs lançamentos (horas realizadas) não são afetados.`,
      )
      if (!r) return
      alsoPartner = r === 'all'
    } else if (!confirm(`Excluir o planejamento ${what}? Os lançamentos (horas realizadas) não são afetados.`)) return
    setBusy(true)
    try {
      if (alsoPartner && partner) {
        await api.rpc('partner_plan_delete', { p_partner: partner.id, p_groups: jointGroups, p_from: delFrom, p_to: delTo })
      }
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

  const fmtD = (d: string) => d.slice(8) + '/' + d.slice(5, 7)
  const eventsOn = (date: string) => data.events.filter((e) => e.date === date)
  const planDates = (dates: string[]) => dates.filter((dt) => data.plan.some((p) => p.date === dt))

  /** Exclui o plano das datas informadas (seleção de vários dias). Pergunta o alcance se houver atividade conjunta. */
  async function deleteDates(dates: string[], confirmFirst = true): Promise<boolean> {
    const withPlan = planDates(dates)
    if (!withPlan.length) return true
    const jointGroups = partner ? [...new Set(data.plan
      .filter((p) => withPlan.includes(p.date) && p.group_id && partnerHasGroup(partner.data.plan, p.date, p.group_id))
      .map((p) => p.group_id!))] : []
    const n = withPlan.length
    const what = `${n} ${n === 1 ? 'dia' : 'dias'} (${withPlan.slice(0, 6).map(fmtD).join(', ')}${n > 6 ? '…' : ''})`
    let alsoPartner = false
    if (jointGroups.length) {
      const r = await choice.ask<Scope>(`Excluir o planejamento de ${what}?`,
        [{ label: 'Para todos os participantes', value: 'all', kind: 'danger' }, { label: 'Só para mim', value: 'me', kind: 'outline' }],
        `Há atividades feitas com ${pFirst} nesses dias. Excluir também do plano dele(a)?\nOs lançamentos (horas realizadas) não são afetados.`)
      if (!r) return false
      alsoPartner = r === 'all'
    } else if (confirmFirst && !confirm(`Excluir o planejamento de ${what}? Os lançamentos (horas realizadas) não são afetados.`)) return false
    if (alsoPartner && partner) await api.rpc('partner_plan_delete_dates', { p_partner: partner.id, p_groups: jointGroups, p_dates: withPlan })
    await api.remove('plan_items', { eq: { user_id: data.userId }, in: ['date', withPlan] })
    return true
  }

  async function deletePicked() {
    setBusy(true)
    try {
      const n = planDates(picked).length
      if (!(await deleteDates(picked))) return
      await reload()
      toast(`Planejamento excluído (${n} ${n === 1 ? 'dia' : 'dias'})`)
      setPicked([]); setMulti(false)
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  async function addEvent(dates: string[], kind: string, title: string, both: boolean) {
    const withPlan = planDates(dates)
    let dropPlan = false
    if (withPlan.length) {
      const r = await choice.ask<'keep' | 'drop'>('Já existe plano nesses dias',
        [{ label: 'Excluir o plano', value: 'drop', kind: 'danger' }, { label: 'Manter o plano', value: 'keep', kind: 'outline' }],
        `${withPlan.length === 1 ? 'O dia' : 'Os dias'} ${withPlan.slice(0, 6).map(fmtD).join(', ')}${withPlan.length > 6 ? '…' : ''} já ${withPlan.length === 1 ? 'tem' : 'têm'} atividades planejadas. O que fazer com elas?`)
      if (!r) return
      dropPlan = r === 'drop'
    }
    setBusy(true)
    try {
      if (dropPlan && !(await deleteDates(withPlan, false))) return
      const group_id = both && partner ? crypto.randomUUID() : null
      await api.insert('day_events', dates.map((date) => ({ user_id: data.userId, date, kind, title, group_id })))
      if (group_id && partner) await api.rpc('partner_events_add', { p_partner: partner.id, p_items: dates.map((date) => ({ date, kind, title, group_id })) })
      await reload()
      toast(`${kind} marcado em ${dates.length} ${dates.length === 1 ? 'dia' : 'dias'}${group_id ? ` · também para ${pFirst}` : ''}${dropPlan ? ' · plano excluído' : ''}`)
      setEvDates(null); setEvRange(false); setPicked([]); setMulti(false)
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  async function removeEvent(evOrRun: DayEvent | DayEvent[]) {
    const evs = Array.isArray(evOrRun) ? evOrRun : [evOrRun]
    const ev = evs[0]
    const when = evs.length > 1 ? `de ${fmtRun(evs[0].date, evs[evs.length - 1].date)} (${evs.length} dias)` : `de ${fmtD(ev.date)}`
    const sharedEvs = evs.filter((e) => partner && e.group_id && partner.data.events.some((x) => x.date === e.date && x.group_id === e.group_id))
    let alsoPartner = false
    if (sharedEvs.length) {
      const r = await choice.ask<Scope>(`Remover "${eventName(ev)}" ${when}?`,
        [{ label: 'Para todos os participantes', value: 'all', kind: 'danger' }, { label: 'Só para mim', value: 'me', kind: 'outline' }],
        `Este evento também está no calendário de ${pFirst}.`)
      if (!r) return
      alsoPartner = r === 'all'
    } else if (!confirm(`Remover "${eventName(ev)}" ${when}?`)) return
    try {
      if (alsoPartner && partner) await api.rpc('partner_events_delete', { p_partner: partner.id,
        p_groups: [...new Set(sharedEvs.map((e) => e.group_id))], p_dates: sharedEvs.map((e) => e.date) })
      await api.remove('day_events', { eq: { user_id: data.userId }, in: ['id', evs.map((e) => e.id)] })
      await reload()
      toast('Evento removido')
    } catch (e) { toast((e as Error).message) }
  }

  const togglePick = (date: string) => setPicked((xs) => (xs.includes(date) ? xs.filter((x) => x !== date) : [...xs, date].sort()))
  // Feriados e eventos do mês: dias seguidos do mesmo evento viram uma linha só ("01 - 03/10 · Congresso")
  const monthDays = Array.from({ length: nDays }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
  const monthMarks = [
    ...dateRuns(monthDays.filter((d) => holidayOf(d)).map((d) => ({ date: d, hol: holidayOf(d)! })), (x) => x.hol.name)
      .map((r) => ({ ...r, hol: r.items[0].hol, evs: null as DayEvent[] | null })),
    ...dateRuns(data.events.filter((e) => e.date.startsWith(month)), (e) => `${e.kind}|${e.title}`)
      .map((r) => ({ from: r.from, to: r.to, hol: null, evs: r.items })),
  ].sort((a, b) => a.from.localeCompare(b.from))

  const selDow = sel ? parseIso(sel).getDay() : 0
  const ym = ys.months.find((x) => x.month === month)
  const slack = ms.planned - (ms.goal || ym?.target || 0)

  return (
    <>
      <Header kicker={`Plano · AS ${data.sy}`} title={
        <MonthNav label={monthLabel(month)} onPrev={() => setMonth(months[idx - 1])} onNext={() => setMonth(months[idx + 1])}
          prevDisabled={idx <= 0} nextDisabled={idx >= 11}
          months={months} current={month} onPick={setMonth} todayMonth={todayIso.slice(0, 7)}
          info={(m) => { const x = ys.months.find((k) => k.month === m)!; return { line: x.planned ? fmtH(x.planned) : '—', status: x.planned ? undefined : 'future' } }} />
      } />
      <div className="main">
        <div className="card" style={{ padding: 12 }}>
          <div className="card-head" style={{ marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
            {multi ? <span className="sub" style={{ fontWeight: 700 }}>Toque nos dias para selecionar</span> : (
              <button className="link" style={{ color: 'var(--credit)' }} onClick={() => { setSel(null); setEvRange(true); setEvDates([]) }}>📌 Marcar evento</button>
            )}
            <button className="link" onClick={() => { setMulti(!multi); setPicked([]); setSel(null); setEvDates(null) }}>
              {multi ? 'Cancelar seleção' : '☐ Selecionar vários dias'}
            </button>
          </div>
          <div className="cal">
            {WEEK_HEAD.map((h, i) => <div className="h" key={i}>{h}</div>)}
            {Array.from({ length: firstDow }, (_, i) => <div className="d x" key={'x' + i} />)}
            {Array.from({ length: nDays }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, '0')}`
              const st = dayState(data, date, today)
              const shown = st.done > 0 ? st.done : st.planned
              const hol = holidayOf(date)
              const evs = eventsOn(date)
              return (
                <button key={date} title={[hol?.name, ...evs.map(eventName)].filter(Boolean).join(' · ') || undefined}
                  className={`d ${st.state === 'miss' && !st.logged ? 'pend' : st.state} ${date === todayIso ? 'today' : ''} ${sel === date ? 'sel' : ''} ${hol ? 'holday' : ''} ${data.entries.some((e) => e.date === date) || data.notes.some((n) => n.date === date) ? 'lanc' : ''} ${picked.includes(date) ? 'msel' : ''} ${evs.length ? 'evday' : ''}`}
                  onClick={() => (multi ? togglePick(date) : setSel(date))}>
                  {i + 1}
                  {(hol || evs.length > 0) && <span className="dmk">{hol && <i className={`hol ${hol.kind}`} />}{evs.length > 0 && <i className="ev" />}</span>}
                  {shown > 0 ? <em>{fmtHours(shown)}</em> : st.faltou && <em className="off">✗</em>}
                </button>
              )
            })}
          </div>
          <div className="legend">
            <CalLegend />
          </div>
        </div>

        {multi && (
          <div className="selbar">
            <b>{picked.length} {picked.length === 1 ? 'dia selecionado' : 'dias selecionados'}</b>
            <button className="btn small" style={{ background: '#fff', color: 'var(--bad)' }} disabled={busy || planDates(picked).length === 0} onClick={deletePicked}>
              Excluir plano{planDates(picked).length ? ` (${planDates(picked).length})` : ''}
            </button>
            <button className="btn small" style={{ background: 'var(--credit)', color: '#fff' }} disabled={busy || picked.length === 0} onClick={() => { setEvRange(false); setEvDates(picked) }}>
              Marcar evento
            </button>
          </div>
        )}

        {evDates && (
          <EventForm dates={evDates} partnerName={partner ? pFirst : ''} busy={busy} onCancel={() => { setEvDates(null); setEvRange(false) }}
            types={data.eventTypes.length ? data.eventTypes.map((t) => t.name) : DEFAULT_EVENT_TYPES}
            range={evRange ? { start: month === todayIso.slice(0, 7) ? todayIso : `${month}-01`, min: months[0] + '-01', max: `${months[11]}-31` } : undefined}
            onSave={(k, t, both, dates) => addEvent(dates, k, t, both)} />
        )}

        {sel ? (
          <div className="card">
            <div className="card-head">
              <h3>Planejar {WEEKDAY_SHORT[selDow]}, {sel.slice(8)}/{sel.slice(5, 7)}</h3>
              <button className="link" onClick={() => setSel(null)}>Fechar</button>
            </div>
            <div className="daytags">
              {holidayOf(sel) && <div className="daytag hol"><span className="grow">🇧🇷 {holidayOf(sel)!.name}</span><span className="sub">{HOLIDAY_LABEL[holidayOf(sel)!.kind]}</span></div>}
              {eventsOn(sel).map((ev) => (
                <div className="daytag ev" key={ev.id}>
                  <span className="grow">📌 {eventName(ev)}{ev.group_id ? ` · com ${pFirst || 'cônjuge'}` : ''}</span>
                  <button className="link" style={{ color: 'var(--bad)' }} onClick={() => removeEvent(ev)}>Remover</button>
                </div>
              ))}
            </div>
            <BlocksEditor modalities={data.modalities} value={blocks} onChange={setBlocks} errors={errors}
              partners={partner ? [{ id: partner.id, name: partner.name }] : []} />
            <div className="sub" style={{ fontWeight: 700, margin: '14px 0 6px' }}>REPETIR EM</div>
            <div className="seg">
              <button className={scope === 'day' ? 'on' : ''} onClick={() => setScope('day')}>Só este dia</button>
              <button className={scope === 'month' ? 'on' : ''} onClick={() => setScope('month')}>{cap(WEEKDAY_PLURAL[selDow])} do mês</button>
              <button className={scope === 'year' ? 'on' : ''} onClick={() => setScope('year')}>{cap(WEEKDAY_PLURAL[selDow])} do ano</button>
            </div>
            {scope !== 'day' && (
              <div className="sub" style={{ marginTop: 8 }}>
                Aplica em {repeatDates(sel, scope, todayIso).length} dias ({scope === 'year' ? 'desta data até 31/ago' : 'de hoje até o fim do mês'}). Total do dia: {fmtH(dayTotal)}.
              </div>
            )}
            {hasErrors && <div className="error" style={{ marginTop: 10 }}>Corrija os horários em vermelho para salvar.</div>}
            {differ ? (
              <div className="alert" style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 6 }}>
                  ⚠ {differ.length} {differ.length === 1 ? 'dia já tem' : 'dias já têm'} um plano diferente:{' '}
                  {differ.slice(0, 6).map((dt) => dt.slice(8) + '/' + dt.slice(5, 7)).join(', ')}{differ.length > 6 ? '…' : ''}.
                  O que fazer com {differ.length === 1 ? 'ele' : 'eles'}?
                </div>
                <div className="form" style={{ gap: 8 }}>
                  <button className="btn brand small" onClick={() => savePlan([])}>Substituir pelo novo plano</button>
                  <button className="btn outline small" onClick={() => savePlan(differ)}>Pular esses dias (manter o plano deles)</button>
                  <button className="btn ghost small" onClick={() => setDiffer(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button className="btn brand" style={{ marginTop: 12 }} disabled={busy || hasErrors} onClick={requestSave}>
                {busy ? 'Salvando…' : `Salvar plano (${fmtH(dayTotal)})`}
              </button>
            )}

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
        ) : !multi && (
          <div className="info">Toque num dia para planejar (com horário de início e fim), marcar um evento ou excluir o planejamento. Para excluir ou marcar vários dias de uma vez, use "Selecionar vários dias".</div>
        )}

        {monthMarks.length > 0 && (
          <div className="card">
            <h3>Feriados e eventos do mês</h3>
            <div className="daytags" style={{ marginBottom: 0 }}>
              {monthMarks.map((m) => m.hol ? (
                <div className="daytag hol" key={m.from + 'h'}><span className="grow">{fmtRun(m.from, m.to)} · {m.hol.name}</span><span className="sub">{HOLIDAY_LABEL[m.hol.kind]}</span></div>
              ) : (
                <div className="daytag ev" key={m.evs![0].id}><span className="grow">{fmtRun(m.from, m.to)} · {eventName(m.evs![0])}</span>
                  <button className="link" style={{ color: 'var(--bad)' }} onClick={() => removeEvent(m.evs!)}>Remover</button></div>
              ))}
            </div>
          </div>
        )}

        <div className="card" style={{ padding: '8px 16px' }}>
          <div className="kv">
            <span>Meta do mês</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="input" style={{ width: 86, padding: 8, textAlign: 'right' }} inputMode="numeric" value={goalH}
                onChange={(e) => setGoalH(e.target.value)} placeholder="hh:mm" onBlur={() => parseHM(goalH) !== ms.goal && saveGoal()} />
              <b>h</b>
            </span>
          </div>
          {ym && (
            <div className="kv"><span>Alvo do mês<div className="sub">{ym.targetKind === 'plano' ? 'o plano substitui a meta' : ym.targetKind === 'meta' ? 'meta (mês sem plano)' : 'rateio: falta p/ a meta anual ÷ meses sem plano e sem meta'}</div></span>
              <b>{fmtHours(ym.target)}</b></div>
          )}
          <div className="kv"><span>Planejado no mês</span><span><b>{fmtHours(ms.planned)}</b>{' '}
            <span className={`pill ${slack >= 0 ? 'ok' : 'warn'}`}>{slack >= 0 ? `folga ${fmtHours(slack)}` : `faltam ${fmtHours(-slack)}`}</span></span></div>
          <div className="kv"><span>Planejamento anual</span><span><b>{fmtHours(ys.plannedSum)}</b>{' '}
            <span className={`pill ${ys.plannedSum >= ys.goal ? 'ok' : 'warn'}`}>{ys.plannedSum >= ys.goal ? 'cobre a meta' : `faltam ${fmtHours(ys.goal - ys.plannedSum)}`}</span></span></div>
          <div className="sub" style={{ paddingBottom: 8 }}>O plano do mês substitui a meta; a meta só vale nos meses sem plano.</div>
        </div>
      </div>
      {choice.node}
    </>
  )
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

function EventForm({ dates, types, range, partnerName, busy, onCancel, onSave }: {
  dates: string[]; types: string[]; range?: { start: string; min: string; max: string }; partnerName: string; busy: boolean
  onCancel: () => void; onSave: (kind: string, title: string, both: boolean, dates: string[]) => void
}) {
  const kinds = [...types, EVENT_OTHER]
  const [kind, setKind] = useState<string>(kinds[0])
  const [title, setTitle] = useState('')
  const [both, setBoth] = useState(!!partnerName)
  const [from, setFrom] = useState(range?.start ?? '')
  const [to, setTo] = useState(range?.start ?? '')
  const fmt = (d: string) => d.slice(8) + '/' + d.slice(5, 7)
  const list = range ? datesBetween(from, to) : dates
  const invalid = (kind === EVENT_OTHER && !title.trim()) || list.length === 0 || list.length > 31
  return (
    <div className="card form">
      <h3 style={{ margin: 0 }}>Marcar evento{!range && ` · ${dates.length === 1 ? fmt(dates[0]) : `${dates.length} dias`}`}</h3>
      {range && (
        <div className="row" style={{ gap: 10 }}>
          <label className="field">De<input type="date" value={from} min={range.min} max={range.max} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value) }} /></label>
          <label className="field">Até<input type="date" value={to} min={from || range.min} max={range.max} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      )}
      {list.length > 1 && <div className="sub">{list.length} dias: {list.slice(0, 10).map(fmt).join(', ')}{list.length > 10 ? '…' : ''}</div>}
      {list.length > 31 && <div className="error">Período longo demais (máx. 31 dias).</div>}
      <div className="chips">
        {kinds.map((k) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{k}</button>)}
      </div>
      <input className="input" placeholder={kind === EVENT_OTHER ? 'Qual evento? (obrigatório)' : 'Detalhe (opcional, ex.: local)'} value={title} onChange={(e) => setTitle(e.target.value)} />
      {partnerName && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
          <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} /> Também para {partnerName}
        </label>
      )}
      <div className="row" style={{ gap: 10 }}>
        <button className="btn ghost small" onClick={onCancel}>Cancelar</button>
        <button className="btn small" style={{ background: 'var(--credit)', color: '#fff' }} disabled={busy || invalid}
          onClick={() => onSave(kind, title.trim(), both, list)}>Salvar evento</button>
      </div>
    </div>
  )
}

function datesBetween(from: string, to: string): string[] {
  if (!from || !to || to < from) return []
  const out: string[] = []
  for (let d = parseIso(from); isoDate(d) <= to && out.length <= 31; d.setDate(d.getDate() + 1)) out.push(isoDate(d))
  return out
}
