import { useState } from 'react'
import { daysLeftInYear, fmtH, fmtHours, isoDate, MONTH_NAME, monthKey, monthLabel, parseIso, WEEKDAY_SHORT } from '../domain'
import { cancelledPlan, dayState, pairDay, plansBelowPace, planToIcs, planVsDone, weekStats, yearStats, type WeekStats, type YearData } from '../data'
import { DiffPill, GoalBar, MonthGrid, Ring } from '../ui'

export function PainelBody({ data, today, onLaunch, onPickMonth, onPickDate, onPlanMonth, color }: {
  data: YearData; today: Date; onLaunch?: () => void; onPickMonth?: (m: string) => void; onPickDate?: (d: string) => void
  onPlanMonth?: (m: string) => void; color?: string
}) {
  const ys = yearStats(data, today)
  const cur = ys.months.find((m) => m.month === monthKey(today))
  const daysLeft = daysLeftInYear(data.sy, today)
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const curLeft = cur ? Math.max(0, cur.target - cur.counted) : 0
  const pvd = planVsDone(data, monthKey(today), today)
  // Planejamento do dia
  const todayIso = isoDate(today)
  const td = dayState(data, todayIso, today)
  const todayPlan = data.plan.filter((p) => p.date === todayIso).sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  const [todayStatus, todayColor] = td.faltou ? ['✗ faltou', 'var(--bad)']
    : td.done > 0 && td.done >= td.planned ? ['✓ cumprido', 'var(--ok)']
    : td.planned > 0 ? [`faltam ${fmtH(td.planned - td.done)}`, td.done > 0 ? 'var(--warn)' : 'var(--today)']
    : td.logged ? ['lançado', 'var(--muted)']
    : ['', '']
  // Tudo de hoje já lançado (feito ou falta)? Então o botão Lançar fica inativo
  const offToday = cancelledPlan(data)
  const allLaunched = todayPlan.length > 0 && (td.faltou || pairDay(todayPlan.filter((p) => !offToday.has(p.id)),
    data.entries.filter((e) => e.date === todayIso && !e.absent)).every((r) => !r.plan || r.done))
  const [monthsOpen, setMonthsOpen] = useState(false) // sempre inicia oculto
  const week = weekStats(data, today)
  const below = plansBelowPace(data, today)
  // Alerta fechado fica oculto até a situação mudar (outro mês abaixo ou plano alterado)
  const alertKey = below.map((m) => `${m.month}:${m.planned}`).join('|')
  const [closedKey, setClosedKey] = useState(() => { try { return localStorage.getItem(`painel-alerta-fechado-${data.userId}`) ?? '' } catch { return '' } })
  const closeAlert = () => { setClosedKey(alertKey); try { localStorage.setItem(`painel-alerta-fechado-${data.userId}`, alertKey) } catch { /* sem armazenamento */ } }
  /** Baixa um .ics com o plano dos próximos 30 dias (abre na agenda do celular / importa no Outlook). */
  function exportAgenda() {
    const to = new Date(today); to.setDate(to.getDate() + 30)
    const ics = planToIcs(data, todayIso, isoDate(to))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    a.download = `pioneiro-plano-${todayIso}.ics`
    a.click()
  }
  const toggleMonths = () => setMonthsOpen((o) => !o)
  const diff = pvd.done - pvd.planned
  const actsTotal = pvd.acts.done + pvd.acts.part + pvd.acts.miss + pvd.acts.pending // atividades planejadas até hoje

  const ringCard = (
      <div className="card">
        <div className="ring-wrap">
          <Ring value={ys.total} max={ys.goal} label={fmtHours(ys.total)} sub={`de ${fmtHours(ys.goal)}`} color={color} />
          <div>
            <DiffPill diff={ys.diff} level={ys.level} />
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
              Ritmo ideal hoje: <b style={{ color: 'var(--ink)' }}>{fmtHours(ys.pace)}</b><br />
              Faltam <b style={{ color: 'var(--ink)' }}>{fmtHours(Math.max(0, ys.goal - ys.total))}</b> em {daysLeft} dias
            </div>
          </div>
        </div>
        <GoalBar total={ys.total} goal={ys.goal} minGoal={ys.minGoal} color={color} pace={ys.pace} />
      </div>
  )

  return (
    <>
      {below.length > 0 && closedKey !== alertKey && (
        <div className="alert" style={{ display: 'flex', gap: 10, position: 'relative', paddingRight: 36 }}>
          <button className="xclose" aria-label="Fechar alerta" onClick={closeAlert}>✕</button>
          <span style={{ fontSize: 18 }}>⚠</span>
          <div>
            Plano de <b>{monthLabel(below[0].month).split(' ')[0].toLowerCase()}</b> ({fmtHours(below[0].planned)}) está abaixo do ritmo necessário (<b>{fmtHours(below[0].needed)}</b>).
            Faltam planejar <b>{fmtHours(below[0].needed - below[0].planned)}</b>.
            {below.length > 1 && <> Mais {below.length - 1} {below.length === 2 ? 'mês está' : 'meses estão'} abaixo.</>}
            {onPlanMonth && <div style={{ marginTop: 8 }}><button className="pill" style={{ background: 'var(--warn)', color: '#fff' }} onClick={() => onPlanMonth(below[0].month)}>Ajustar plano ›</button></div>}
          </div>
        </div>
      )}

      <div className="card today-card">
        <div className="card-head" style={{ marginBottom: 6 }}>
          <h3 style={{ whiteSpace: 'nowrap' }}>Hoje · {WEEKDAY_SHORT[today.getDay()]}</h3>
          {onLaunch && <button className="pill" style={{ background: 'var(--brand-soft)', color: 'var(--brand)', fontSize: 11, padding: '3px 7px' }} title="Enviar o plano dos próximos 30 dias para a agenda"
            onClick={exportAgenda}>📅 Agenda</button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="big">{fmtHours(td.done)}<small> / {td.rawPlanned ? fmtHours(td.planned) : '—'}</small></div>
            {td.planned > 0 && <div className="bar" style={{ margin: '6px 0 8px', height: 8 }}><i style={{ width: `${Math.min(100, (td.done / td.planned) * 100)}%`, background: td.done >= td.planned ? 'var(--ok)' : 'var(--today)' }} /></div>}
            {todayPlan.length ? todayPlan.map((p) => (
              <div className="sub" key={p.id}>
                {p.start_time?.slice(0, 5)}–{p.end_time?.slice(0, 5)} · <b style={{ color: 'var(--ink)' }}>{data.modalities.find((m) => m.id === p.modality_id)?.name ?? ''}</b>{p.group_id && ' 👥'}
              </div>
            )) : <div className="sub">Sem plano para hoje</div>}
            <div className="sub">{todayPlan.length > 0 && `${todayPlan.length} atividade${todayPlan.length > 1 ? 's' : ''}`}{todayStatus && <>{todayPlan.length > 0 && ' · '}<b style={{ color: todayColor }}>{todayStatus}</b></>}</div>
          </div>
          {onLaunch && <button className="btn brand small" style={{ width: 'auto', padding: '10px 18px', flexShrink: 0 }} onClick={onLaunch} disabled={allLaunched}
            title={allLaunched ? 'Todas as atividades de hoje já foram lançadas' : undefined}>{allLaunched ? 'Lançado ✓' : 'Lançar'}</button>}
        </div>
      </div>

      <WeekCard week={week} today={todayIso} color={color} />

      <div className="card">
        <div className="card-head">
          <h3>{MONTH_NAME[today.getMonth()]} | Realizado × planejado</h3>
          <span className="sub" style={{ fontWeight: 700 }}>até hoje</span>
        </div>
        {pvd.planned === 0 && pvd.done === 0 ? (
          <div className="empty">Nada planejado ou lançado neste mês até hoje.</div>
        ) : (
          <>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div><div className="sub">Planejado</div><div className="big" style={{ fontSize: 24, color: '#97A3B6' }}>{fmtHours(pvd.planned)}</div></div>
              <div><div className="sub">Realizado</div><div className="big" style={{ fontSize: 24 }}>{fmtHours(pvd.done)}</div></div>
              <div style={{ textAlign: 'right' }}>
                <div className="sub">{diff < 0 ? 'Faltam' : diff > 0 ? 'Acima' : 'Coberto'}</div>
                <div className="big" style={{ fontSize: 24, color: diff < 0 ? 'var(--bad)' : 'var(--ok)' }}>
                  {diff < 0 ? fmtH(-diff) : diff > 0 ? `+${fmtH(diff)}` : '✓'}
                </div>
              </div>
            </div>
            <div className="bar" style={{ marginTop: 12, height: 12 }}>
              <i style={{ width: `${Math.min(100, (pvd.done / Math.max(pvd.planned, pvd.done, 1)) * 100)}%`, background: color }} />
            </div>
            <div className="chips" style={{ marginTop: 10 }}>
              <span className="pill" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>📋 {actsTotal} planejada{actsTotal === 1 ? '' : 's'}</span>
              <span className="pill ok">✓ {pvd.acts.done} cumprida{pvd.acts.done === 1 ? '' : 's'}</span>
              <span className="pill warn">◐ {pvd.acts.part} parcia{pvd.acts.part === 1 ? 'l' : 'is'}</span>
              <span className="pill bad">✗ {pvd.acts.miss} falta{pvd.acts.miss === 1 ? '' : 's'}</span>
              {pvd.acts.pending > 0 && <span className="pill" style={{ background: 'var(--future)', color: '#3D4A5C' }}>? {pvd.acts.pending} não lançada{pvd.acts.pending === 1 ? '' : 's'}</span>}
            </div>
            {pvd.acts.pending > 0 && (
              <div className="sub" style={{ marginTop: 8 }}>
                Inclui {fmtHours(pvd.pendingPlanned)} planejadas em atividades ainda não lançadas (contam como 0 até você lançar).
              </div>
            )}
            {pvd.pendingDates.length > 0 && onPickDate && (
              <button className="link" style={{ marginTop: 10, fontSize: 13 }} onClick={() => onPickDate(pvd.pendingDates[0])}>
                Lançar dias pendentes (a partir de {pvd.pendingDates[0].slice(8)}/{pvd.pendingDates[0].slice(5, 7)}) ›
              </button>
            )}
          </>
        )}
      </div>

      {cur && (
        <div className="card">
          <h3>{MONTH_NAME[today.getMonth()]}</h3>
          <div className="big">{fmtHours(cur.counted)}<small> / {fmtHours(cur.target)}</small></div>
          <div className="sub">{cur.targetKind === 'plano' ? 'plano do mês' : cur.targetKind === 'meta' ? 'meta do mês (sem plano)' : 'rateio (sem plano e sem meta)'}</div>
          <div className="sub">{curLeft > 0 ? `Faltam ${fmtHours(curLeft)} em ${lastDay - today.getDate() + 1} dias` : 'Meta do mês atingida ✓'}</div>
        </div>
      )}
      {ringCard}

      <div className="card" style={{ padding: 12 }}>
        <button className="card-head expander" onClick={toggleMonths} aria-expanded={monthsOpen}>
          <h3>Meses do ano de serviço</h3>
          <span className="xbtn">{monthsOpen ? 'Ocultar' : 'Ver meses'}<span className={`chev ${monthsOpen ? 'open' : ''}`}>▾</span></span>
        </button>
        {monthsOpen && <MonthGrid months={ys.months} today={today} needed={ys.needed} onPick={onPickMonth} />}
        <div className="ytotal">
          <div className="ytop">
            <span>Planejamento anual</span>
            <span><b>{fmtHours(ys.plannedSum)}</b><span className="muted"> / {fmtHours(ys.goal)}</span></span>
          </div>
          <span className="bar"><i style={{ width: `${Math.min(100, (ys.plannedSum / ys.goal) * 100)}%`, background: ys.plannedSum >= ys.goal ? 'var(--ok)' : 'var(--brand-2)' }} /></span>
          <div className="ybot">
            <span>{ys.plannedMonths} de 12 meses planejados</span>
            {ys.plannedSum < ys.goal
              ? <span>faltam planejar <b style={{ color: 'var(--bad)' }}>{fmtHours(ys.goal - ys.plannedSum)}</b></span>
              : <span style={{ color: 'var(--ok)', fontWeight: 700 }}>✓ cobre a meta anual</span>}
          </div>
        </div>
      </div>

      {ys.freeMonths === 0 && ys.committed < ys.goal && (
        <div className="alert">⚠ Com os planos e metas atuais, o ano fecha em {fmtHours(ys.committed)} — menos que a meta anual de {fmtHours(ys.goal)}. Ajuste no Plano.</div>
      )}

      {onLaunch && (
        <button className="btn brand" onClick={onLaunch}>
          + Lançar hoje ({WEEKDAY_SHORT[today.getDay()]}, {isoDate(today).slice(8)}/{isoDate(today).slice(5, 7)})
        </button>
      )}
    </>
  )
}

/** Esta semana (seg–dom): meta pelo ritmo, barra com o ponto ideal e barras por dia (plano tracejado × feito). */
function WeekCard({ week, today, color }: { week: WeekStats; today: string; color?: string }) {
  const left = week.target - week.done
  const max = Math.max(60, ...week.days.map((x) => Math.max(x.planned, x.done)))
  const pos = (v: number) => `${Math.min(100, (v / Math.max(week.target, week.done, 1)) * 100)}%`
  const fill: Record<string, string> = { done: 'var(--ok)', part: 'var(--warn)', miss: 'var(--bad)' }
  return (
    <div className="card">
      <div className="card-head"><h3>Esta semana · {week.from.slice(8)} a {week.to.slice(8)}/{week.to.slice(5, 7)}</h3></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="big">{fmtHours(week.done)}<small> / {fmtHours(week.target)}</small></div>
        <span className={`pill ${left > 0 ? 'bad' : 'ok'}`}>{left > 0 ? `▼ faltam ${fmtH(left)}` : '✓ meta da semana'}</span>
      </div>
      <div className="bar" style={{ margin: '10px 4px 14px' }}>
        <i style={{ width: pos(week.done), background: color }} />
        <b className="gdot" style={{ left: pos(week.ideal), background: 'var(--credit)' }} title={`Ideal até hoje ${fmtHours(week.ideal)}`} />
      </div>
      <div className="wbars">
        {week.days.map((x) => {
          const d = parseIso(x.date)
          return (
            <div key={x.date} className={`wday ${x.date === today ? 'today' : ''}`}>
              <div className="wcol">
                {x.planned > 0 && <span className="wplan" style={{ height: `${(x.planned / max) * 100}%` }} />}
                {x.done > 0 && <span className="wdone" style={{ height: `${(x.done / max) * 100}%`, background: fill[x.state] ?? 'var(--brand-2)' }} />}
                {x.absent && <span className="wx">✗</span>}
              </div>
              <span className="wlbl">{WEEKDAY_SHORT[d.getDay()][0].toUpperCase()} {x.date.slice(8)}</span>
              <span className="wplanh">{x.planned > 0 ? fmtH(x.planned) : ''}</span>
            </div>
          )
        })}
      </div>
      <div className="wleg">
        <div>Meta ideal: <b>{fmtHours(week.target)}</b> <span className="sep">|</span> Seu plano: <b>{fmtHours(week.planned)}</b></div>
        <div>Sugestão: {week.planned < week.target
          ? <b style={{ color: 'var(--bad)' }}>Planeje + {fmtH(week.target - week.planned)}</b>
          : <b style={{ color: 'var(--ok)' }}>✓ plano cobre a meta</b>}</div>
      </div>
    </div>
  )
}
