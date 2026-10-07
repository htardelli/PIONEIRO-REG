import { useEffect, useState } from 'react'
import { api } from '../api'
import { CREDIT_TYPES, fmtH, isoDate, fmtHours, MONTH_NAME, monthLabel, MONTHLY_CAP_MIN, serviceYearMonths } from '../domain'
import { absencesOf, byModality, monthStats, yearStats, type YearData } from '../data'
import { Header, MonthNav, Stepper } from '../ui'

export function Relatorio({ data, today, month, setMonth, reload, toast, name }: {
  data: YearData; today: Date; month: string; setMonth: (m: string) => void; reload: () => Promise<void>; toast: (m: string) => void; name: string
}) {
  const months = serviceYearMonths(data.sy)
  const idx = months.indexOf(month)
  const ms = monthStats(data, month, today)
  const ys = yearStats(data, today)
  const mods = byModality(data, data.entries.filter((e) => e.date.startsWith(month)))
  const credits = data.credits.filter((c) => c.month === month)
  const faltas = absencesOf(data)
  const [adding, setAdding] = useState(false)
  const [cType, setCType] = useState(CREDIT_TYPES[0])
  const [cMin, setCMin] = useState(240)
  const [cNote, setCNote] = useState('')
  const [just, setJust] = useState(ms.justification)
  useEffect(() => setJust(ms.justification), [month, ms.justification])

  const upsertRecord = async (patch: Record<string, unknown>) => {
    await api.upsert('month_records', [{ user_id: data.userId, month, goal_min: ms.goal, ...patch }], 'user_id,month')
    await reload()
  }

  async function addCredit() {
    await api.insert('credits', [{ user_id: data.userId, month, type: cType, minutes: cMin, note: cNote }])
    setAdding(false); setCNote('')
    await reload()
    toast('Crédito lançado')
  }

  const [, mo] = month.split('-').map(Number)
  const reportText = [
    `Relatório de ${MONTH_NAME[mo - 1]} — ${name}`,
    `Horas: ${fmtHours(ms.ministry)}`,
    `Estudos bíblicos: ${ms.studies}`,
    ms.credit > 0 ? `Observações: ${fmtHours(ms.creditUsed)} de crédito (${credits.map((c) => c.type).join(', ')})` : '',
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
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `pioneiro-reg-AS${data.sy}.csv`
    a.click()
  }

  const capPct = (x: number) => `${(x / Math.max(MONTHLY_CAP_MIN, ms.ministry + ms.creditUsed)) * 100}%`

  return (
    <>
      <Header kicker={`Relatório · AS ${data.sy}`} title={
        <MonthNav label={monthLabel(month)} onPrev={() => setMonth(months[idx - 1])} onNext={() => setMonth(months[idx + 1])}
          prevDisabled={idx <= 0} nextDisabled={idx >= 11}
          months={months} current={month} onPick={setMonth} todayMonth={isoDate(today).slice(0, 7)}
          info={(m) => { const x = ys.months.find((k) => k.month === m)!; return { line: fmtH(x.counted), status: x.status } }} />
      } />
      <div className="main">
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
          {ms.creditLost > 0 && <div style={{ fontSize: 13, color: 'var(--bad)', fontWeight: 600, marginTop: 8 }}>⚠ {fmtH(ms.creditLost)} de crédito acima do teto — não conta e não transfere.</div>}
          {credits.map((c) => (
            <div className="mod" key={c.id}>
              <i className="dot" style={{ background: 'var(--credit)' }} />
              <span className="n">{c.type}{c.note && <span className="sub"> · {c.note}</span>}</span>
              <b>{fmtH(c.minutes)}</b>
              <button className="link" style={{ color: 'var(--bad)' }} onClick={async () => { await api.remove('credits', { eq: { id: c.id } }); await reload() }}>✕</button>
            </div>
          ))}
          {adding ? (
            <div className="form" style={{ marginTop: 12 }}>
              <div className="chips">{CREDIT_TYPES.map((t) => <button key={t} className={`chip ${t === cType ? 'on' : ''}`} onClick={() => setCType(t)}>{t}</button>)}</div>
              <div className="kv" style={{ borderBottom: 0 }}><span>Horas</span><Stepper value={cMin} onChange={setCMin} step={30} /></div>
              <input className="input" placeholder="Observação (ex.: datas)" value={cNote} onChange={(e) => setCNote(e.target.value)} />
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
          <div className="card-head"><h3>Faltas do ano</h3>{faltas.length > 0 && <span className="pill bad">{faltas.length} · {fmtH(faltas.reduce((a, f) => a + f.planned, 0))} zeradas</span>}</div>
          {faltas.length === 0 ? <div className="empty">Nenhuma falta lançada neste ano de serviço.</div> : faltas.map((f) => (
            <div className="mod" key={f.date}>
              <span className="n">{f.date.slice(8)}/{f.date.slice(5, 7)}{f.joint && ' 👥'}<span className="sub"> · {f.reason || 'sem justificativa'}</span></span>
              <b style={{ color: 'var(--bad)' }}><s>{fmtH(f.planned)}</s></b>
            </div>
          ))}
          <div className="sub" style={{ marginTop: 8 }}>As horas planejadas dos dias de falta não contam no planejamento; a justificativa fica guardada aqui.</div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Justificativa</h3>
            {ys.level !== 'ok' && <span className={`pill ${ys.level}`}>{ys.level === 'bad' ? 'abaixo de 560 h' : 'abaixo de 600 h'}</span>}
          </div>
          <textarea className="input" style={{ minHeight: 80 }} placeholder="Registro interno: o que impactou as horas neste mês?" value={just}
            onChange={(e) => setJust(e.target.value)} onBlur={() => just !== ms.justification && upsertRecord({ justification: just }).then(() => toast('Justificativa salva'))} />
        </div>
      </div>
    </>
  )
}

const h = (min: number) => fmtH(min) // hh:mm (sem horas decimais)
