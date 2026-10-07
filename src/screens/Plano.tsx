import { useEffect, useState } from 'react'
import { api } from '../api'
import {
  blockErrors, blockMinutes, blocksSignature, daysInMonth, deleteRange, fmtH, fmtHours, isoDate, parseHM, monthLabel, parseIso, repeatDates,
  serviceYearMonths, toBlocks, WEEKDAY_PLURAL, WEEKDAY_SHORT, type DeleteScope, type TimeBlock,
} from '../domain'
import { dayState, monthStats, partnerHasGroup, yearStats, type JointPartner, type YearData } from '../data'
import { BlocksEditor, Header, MonthNav, useChoice } from '../ui'

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

  useEffect(() => { setGoalH(ms.goal ? fmtH(ms.goal) : ''); setSel(null) }, [month, ms.goal])
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
  const firstDow = new Date(y, mo - 1, 1).getDay()
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
    const conflicting = repeatDates(sel, scope).filter((dt) => {
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
    const dates = repeatDates(sel, scope).filter((dt) => !skip.includes(dt))
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
    }

    setBusy(true)
    try {
      if (partner) {
        const items = dates.flatMap((date) => next.filter((x) => x.with?.includes(partner.id) && x.group_id)
          .map((x) => ({ date, group_id: x.group_id, modality: nameOfMod(x.modality_id), start: x.start, end: x.end })))
        if (items.length) await api.rpc('partner_plan_upsert', { p_partner: partner.id, p_items: items })
        if (scopeChoice === 'all' && removedGroups.length) {
          await api.rpc('partner_plan_delete', { p_partner: partner.id, p_groups: removedGroups, p_from: dates[0], p_to: dates[dates.length - 1] })
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

  const selDow = sel ? parseIso(sel).getDay() : 0
  const ym = ys.months.find((x) => x.month === month)
  const slack = ms.planned - (ms.goal || ym?.target || 0)

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
                Aplica em {repeatDates(sel, scope).length} dias ({scope === 'year' ? 'desta data até 31/ago' : 'neste mês'}). Total do dia: {fmtH(dayTotal)}.
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
        ) : (
          <div className="info">Toque num dia para planejar (com horário de início e fim) ou excluir o planejamento do dia, da semana, do mês ou do ano.</div>
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
