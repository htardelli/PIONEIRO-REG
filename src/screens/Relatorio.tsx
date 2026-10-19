import { useEffect, useState } from 'react'
import { api } from '../api'
import { CREDIT_TYPES, daysInMonth, fmtH, isoDate, fmtHours, MONTH_NAME, monthLabel, MONTHLY_CAP_MIN, serviceYearMonths } from '../domain'
import { absencesOf, byModality, closedMonthPace, monthStats, yearStats, type YearData } from '../data'
import { Header, MonthGrid, MonthNav, Seg, Stepper } from '../ui'
import type { MonthStats } from '../data'
import { Icon } from '../icons'

export function Relatorio({ data, today, curSy, month, setMonth, reload, toast, name }: {
  data: YearData; today: Date; curSy?: number; month: string; setMonth: (m: string) => void; reload: () => Promise<void>; toast: (m: string) => void; name: string
}) {
  const months = serviceYearMonths(data.sy)
  const idx = months.indexOf(month)
  const ms = monthStats(data, month, today)
  const ys = yearStats(data, today)
  const mods = byModality(data, data.entries.filter((e) => e.date.startsWith(month)))
  const credits = data.credits.filter((c) => c.month === month).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const faltas = absencesOf(data)
  const pace = closedMonthPace(data, month, today)
  const behind = !!pace && pace.cum < pace.ideal
  // Mensal (S-4 do mês) ou Anual (gráfico do ano de serviço); lembra a escolha neste aparelho
  const [view, setViewRaw] = useState<'mes' | 'ano'>(() => { try { return localStorage.getItem('relatorio-visao') === 'ano' ? 'ano' : 'mes' } catch { return 'mes' } })
  const setView = (v: 'mes' | 'ano') => { setViewRaw(v); try { localStorage.setItem('relatorio-visao', v) } catch { /* sem armazenamento */ } }
  const [adding, setAdding] = useState(false)
  const creditTypes = data.creditTypes.length ? data.creditTypes.map((t) => t.name) : CREDIT_TYPES
  const [cType, setCType] = useState(creditTypes[0])
  const [cMin, setCMin] = useState(240)
  const [cNote, setCNote] = useState('')
  // data do crédito: hoje se estiver no mês do relatório, senão o 1º dia do mês
  const monthFirst = `${month}-01`, monthLast = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
  const defaultDate = () => (isoDate(today).startsWith(month) ? isoDate(today) : monthFirst)
  const [cDate, setCDate] = useState(defaultDate)
  useEffect(() => setCDate(defaultDate()), [month]) // eslint-disable-line react-hooks/exhaustive-deps
  const [just, setJust] = useState(ms.justification)
  useEffect(() => setJust(ms.justification), [month, ms.justification])

  const upsertRecord = async (patch: Record<string, unknown>) => {
    await api.upsert('month_records', [{ user_id: data.userId, month, goal_min: ms.goal, ...patch }], 'user_id,month')
    await reload()
  }

  async function addCredit() {
    if (cDate && (cDate < monthFirst || cDate > monthLast)) return toast(`Escolha uma data de ${monthLabel(month).toLowerCase()}.`)
    await api.insert('credits', [{ user_id: data.userId, month, type: cType, minutes: cMin, note: cNote, date: cDate || null }])
    setAdding(false); setCNote('')
    await reload()
    toast('Crédito lançado')
  }

  const [, mo] = month.split('-').map(Number)
  const reportText = [
    `Relatório de ${MONTH_NAME[mo - 1]} — ${name}`,
    `Horas: ${fmtHours(ms.ministry)}`,
    `Estudos bíblicos: ${ms.studies}`,
    ms.creditUsed > 0 ? `Observações: ${fmtHours(ms.creditUsed)} de crédito (${credits.map((c) => c.type).join(', ')})` : '',
  ].filter(Boolean).join('\n')

  async function copy() {
    try { await navigator.clipboard.writeText(reportText); toast('Relatório copiado') } catch { toast('Não foi possível copiar') }
  }

  function exportCsv() {
    const rows = [['Mês', 'Meta (h)', 'Plano (h)', 'Alvo (h)', 'Ministério (h)', 'Crédito lançado (h)', 'Crédito considerado (h)', 'Total considerado (h)', 'Estudos', 'Justificativa']]
    for (const m of ys.months) {
      rows.push([monthLabel(m.month), h(m.goal), h(m.planned), h(m.target), h(m.ministry), h(m.credit), h(m.creditUsed), h(m.counted), String(m.studies), m.justification])
    }
    rows.push([], ['Data', 'Modalidade', 'Horas'])
    for (const e of [...data.entries].sort((a, b) => a.date.localeCompare(b.date)))
      rows.push([e.date.split('-').reverse().join('/'), data.modalities.find((m) => m.id === e.modality_id)?.name ?? '', h(e.minutes)])
    // Neutraliza fórmulas (=, +, -, @) para o Excel não executar conteúdo digitado (ex.: justificativa)
    const cell = (c: unknown) => { const v = String(c ?? ''); return /^[=+\-@\t\r]/.test(v) && !/^-?\d/.test(v.replace(/^[−-]/, '')) ? `'${v}` : v }
    const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${cell(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `pioneiro-reg-AS${data.sy}.csv`
    a.click()
  }

  const capPct = (x: number) => `${(x / Math.max(MONTHLY_CAP_MIN, ms.ministry + ms.creditUsed)) * 100}%`

  return (
    <>
      {view === 'ano' ? <Header kicker="Relatório anual" title={`Ano de serviço ${data.sy}`} /> : <Header kicker={`Relatório · AS ${data.sy}`} title={
        <MonthNav label={monthLabel(month)} onPrev={() => setMonth(idx > 0 ? months[idx - 1] : `${data.sy - 1}-08`)} onNext={() => setMonth(idx < 11 ? months[idx + 1] : `${data.sy}-09`)}
          prevDisabled={idx <= 0 && data.sy <= (curSy ?? data.sy) - 1} nextDisabled={idx >= 11 && data.sy >= (curSy ?? data.sy)}
          months={months} current={month} onPick={setMonth} todayMonth={isoDate(today).slice(0, 7)}
          info={(m) => { const x = ys.months.find((k) => k.month === m)!; return { line: fmtH(x.counted), status: x.status } }} />
      } />}
      <div className="main">
        <Seg value={view} onChange={setView} options={[['mes', 'Mensal'], ['ano', 'Anual']]} />
        {view === 'ano' ? <Anual data={data} today={today} ys={ys} faltas={faltas} exportCsv={exportCsv} onPick={(m) => { setMonth(m); setView('mes') }} /> : <>
        <div className="card">
          <h3>Para o relatório (S-4)</h3>
          <div className="kv"><span>Horas no ministério</span><b>{fmtHours(ms.ministry)}</b></div>
          <div className="kv"><span>Estudos bíblicos</span>
            <div className="step">
              <button onClick={() => upsertRecord({ bible_studies: Math.max(0, ms.studies - 1) })}>−</button>
              <span>{ms.studies}</span>
              <button onClick={() => upsertRecord({ bible_studies: ms.studies + 1 })}>+</button>
            </div>
          </div>
          <div className="kv"><span>Crédito (Observações)</span><b style={{ color: 'var(--credit)' }}>{fmtHours(ms.creditUsed)}</b></div>
          <div className="row" style={{ gap: 10, marginTop: 12 }}>
            <button className="btn brand small" onClick={copy}>Copiar relatório</button>
            <button className="btn ghost small" onClick={exportCsv}>Exportar Excel</button>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Teto mensal 55:00</h3><span className="pill cr">{fmtHours(ms.ministry + ms.creditUsed)} / 55:00</span></div>
          <div className="stack">
            <i style={{ width: capPct(ms.ministry), background: 'var(--brand-2)' }} />
            <i style={{ width: capPct(ms.creditUsed), background: 'var(--credit)' }} />
          </div>
          <div className="legend"><span><i style={{ background: 'var(--brand-2)' }} />Ministério</span><span><i style={{ background: 'var(--credit)' }} />Crédito</span></div>
          {ms.creditLost > 0 && <div style={{ fontSize: 13, color: 'var(--bad)', fontWeight: 600, marginTop: 8 }}><Icon name="alert" size={14} /> {fmtH(ms.creditLost)} de crédito acima do teto — não conta e não transfere.</div>}
          {credits.map((c) => (
            <div className="mod" key={c.id}>
              <i className="dot" style={{ background: 'var(--credit)' }} />
              <span className="n">{c.date && <b style={{ marginRight: 6 }}>{c.date.slice(8)}/{c.date.slice(5, 7)}</b>}{c.type}{c.note && <span className="sub"> · {c.note}</span>}</span>
              <b>{fmtH(c.minutes)}</b>
              <button className="link" style={{ color: 'var(--bad)' }} onClick={async () => { await api.remove('credits', { eq: { id: c.id } }); await reload() }}>✕</button>
            </div>
          ))}
          {adding ? (
            <div className="form" style={{ marginTop: 12 }}>
              <div className="chips">{creditTypes.map((t) => <button key={t} className={`chip ${t === cType ? 'on' : ''}`} onClick={() => setCType(t)}>{t}</button>)}</div>
              <div className="kv" style={{ borderBottom: 0 }}><span>Horas</span><Stepper value={cMin} onChange={setCMin} step={30} /></div>
              <label className="field">Data<input type="date" value={cDate} min={monthFirst} max={monthLast} onChange={(e) => setCDate(e.target.value)} /></label>
              <input className="input" placeholder="Observação (opcional)" value={cNote} onChange={(e) => setCNote(e.target.value)} />
              <div className="row" style={{ gap: 10 }}>
                <button className="btn ghost small" onClick={() => setAdding(false)}>Cancelar</button>
                <button className="btn brand small" onClick={addCredit} disabled={cMin <= 0}>Lançar crédito</button>
              </div>
            </div>
          ) : (
            <button className="btn outline small" style={{ marginTop: 12, borderColor: 'var(--credit)', color: 'var(--credit)' }} onClick={() => setAdding(true)}>+ Lançar crédito de horas</button>
          )}
        </div>

        <div className="card">
          <h3>Por modalidade</h3>
          {mods.length === 0 ? <div className="empty">Sem horas lançadas neste mês.</div> : (
            <>
              <div className="stack">{mods.map((x) => <i key={x.modality?.id} style={{ width: `${(x.minutes / ms.ministry) * 100}%`, background: x.modality?.color }} />)}</div>
              <div className="legend" style={{ fontSize: 12 }}>{mods.map((x) => <span key={x.modality?.id}><i style={{ background: x.modality?.color }} />{x.modality?.name} {fmtHours(x.minutes)}</span>)}</div>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Justificativa</h3>
            {behind && <span className="pill bad">abaixo do ritmo</span>}
          </div>
          {behind && pace && (
            <div className="alert" style={{ marginBottom: 10 }}>
              Mês fechado abaixo do ritmo ideal: acumulado {fmtH(pace.cum)} × ideal {fmtH(pace.ideal)} (faltaram {fmtH(pace.ideal - pace.cum)}). Registre a justificativa.
            </div>
          )}
          <textarea className="input" style={{ minHeight: 80 }} placeholder="Registro interno: o que impactou as horas neste mês?" value={just}
            onChange={(e) => setJust(e.target.value)} onBlur={() => just !== ms.justification && upsertRecord({ justification: just }).then(() => toast('Justificativa salva'))} />
        </div>
        </>}
      </div>
    </>
  )
}

const h = (min: number) => fmtH(min) // hh:mm (sem horas decimais)

const INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Visão anual: totais, gráfico mês a mês (realizado × alvo), meses do ano e faltas do ano. */
function Anual({ data, today, ys, faltas, exportCsv, onPick }: {
  data: YearData; today: Date; ys: ReturnType<typeof yearStats>; faltas: ReturnType<typeof absencesOf>; exportCsv: () => void; onPick: (m: string) => void
}) {
  const cur = isoDate(today).slice(0, 7)
  const elapsed = ys.months.filter((m) => m.month <= cur).length || 1
  const avg = ys.total / elapsed
  const left = Math.max(0, ys.goal - ys.total)
  return (
    <>
      <div className="card">
        <div className="kv"><span>Total no ano</span><b>{fmtHours(ys.total)} <span className="muted">/ {fmtHours(ys.goal)}</span></b></div>
        <div className="kv"><span>Média mensal ({elapsed} {elapsed === 1 ? 'mês' : 'meses'})</span><b>{fmtHours(avg)}</b></div>
        <div className="kv"><span>Ritmo ideal até hoje</span><b>{fmtHours(ys.pace)}</b></div>
        <div className="kv"><span>Faltam para a meta</span><b style={{ color: left > 0 ? 'var(--bad)' : 'var(--ok)' }}>{left > 0 ? fmtHours(left) : 'meta atingida ✓'}</b></div>
        <div className="kv" style={{ borderBottom: 0 }}><span>Com os planos atuais, o ano fecha em</span><b>{fmtHours(ys.committed)}</b></div>
      </div>
      <div className="card">
        <h3>Mês a mês</h3>
        <YearChart months={ys.months} cur={cur} monthlyIdeal={ys.goal / 12} onPick={onPick} />
        <div className="legend" style={{ justifyContent: 'space-between' }}>
          <span><i style={{ background: 'var(--brand-2)' }} />Realizado</span>
          <span><i style={{ background: '#fff', border: '1.5px dashed #8A96A8' }} />Alvo do mês</span>
          <span><i style={{ background: 'var(--ink)', height: 2, width: 12 }} />{fmtHours(ys.goal / 12)} por mês</span>
        </div>
      </div>
      <div className="card">
        <h3>Meses do ano de serviço</h3>
        <MonthGrid months={ys.months} today={today} needed={ys.needed} onPick={onPick} />
      </div>
      <div className="card">
        <div className="card-head"><h3>Faltas do ano</h3>{faltas.length > 0 && <span className="pill bad">{faltas.length} · {fmtH(faltas.reduce((a, f) => a + f.planned, 0))} zeradas</span>}</div>
        {faltas.length === 0 ? <div className="empty">Nenhuma falta lançada neste ano de serviço.</div> : faltas.map((f) => (
          <div className="mod" key={f.date}>
            <span className="n">{f.date.slice(8)}/{f.date.slice(5, 7)}{f.joint && <> <Icon name="users" size={14} label="atividade conjunta" /></>}<span className="sub"> · {f.reason || 'sem justificativa'}</span></span>
            <b style={{ color: 'var(--bad)' }}><s>{fmtH(f.planned)}</s></b>
          </div>
        ))}
        <div className="sub" style={{ marginTop: 8 }}>As horas planejadas dos dias de falta não contam no planejamento; a justificativa fica guardada aqui.</div>
      </div>

      <button className="btn ghost small" onClick={exportCsv}>Exportar Excel do ano</button>
    </>
  )
}

/** Barras mês a mês: realizado (preenchido) dentro do alvo do mês (tracejado); linha = média necessária para a meta. */
function YearChart({ months, cur, monthlyIdeal, onPick }: { months: MonthStats[]; cur: string; monthlyIdeal: number; onPick: (m: string) => void }) {
  const W = 336, H = 150, top = 14, slot = W / 12, bw = 16
  const max = Math.max(MONTHLY_CAP_MIN, monthlyIdeal, ...months.map((m) => Math.max(m.counted, m.target))) * 1.05
  const y = (v: number) => top + (H - top) * (1 - v / max)
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label="Horas por mês no ano de serviço">
      <line x1="0" x2={W} y1={y(monthlyIdeal)} y2={y(monthlyIdeal)} stroke="var(--ink)" strokeWidth="1.2" strokeDasharray="4 3" />
      {months.map((m, i) => {
        const x = i * slot + (slot - bw) / 2
        const isCur = m.month === cur
        return (
          <g key={m.month} onClick={() => onPick(m.month)} style={{ cursor: 'pointer' }}>
            <rect x={i * slot} y={0} width={slot} height={H + 22} fill="transparent" />
            {m.target > 0 && <rect x={x - 1} y={y(m.target)} width={bw + 2} height={H - y(m.target)} rx="4" fill="none" stroke="#8A96A8" strokeWidth="1.2" strokeDasharray="3 2" />}
            {m.counted > 0 && <rect x={x + 1} y={y(m.counted)} width={bw - 2} height={H - y(m.counted)} rx="3" fill="var(--brand-2)" />}
            <text x={i * slot + slot / 2} y={H + 15} textAnchor="middle" fontSize="11" fontWeight={isCur ? 800 : 600}
              fill={isCur ? 'var(--today)' : 'var(--muted)'}>{INITIALS[Number(m.month.slice(5)) - 1]}</text>
          </g>
        )
      })}
    </svg>
  )
}
