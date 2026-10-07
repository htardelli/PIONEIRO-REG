import { daysLeftInYear, fmtH, fmtHours, isoDate, MONTH_NAME, monthKey, WEEKDAY_SHORT } from '../domain'
import { planVsDone, yearStats, type YearData } from '../data'
import { DiffPill, GoalBar, MonthGrid, Ring } from '../ui'

export function PainelBody({ data, today, onLaunch, onPickMonth, onPickDate, color }: {
  data: YearData; today: Date; onLaunch?: () => void; onPickMonth?: (m: string) => void; onPickDate?: (d: string) => void; color?: string
}) {
  const ys = yearStats(data, today)
  const cur = ys.months.find((m) => m.month === monthKey(today))
  const daysLeft = daysLeftInYear(data.sy, today)
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const curLeft = cur ? Math.max(0, cur.goal - cur.counted) : 0
  const pvd = planVsDone(data, monthKey(today), today)
  const diff = pvd.done - pvd.planned
  const needJustification = ys.level !== 'ok' && cur && !cur.justification

  return (
    <>
      <div className="card" style={{ padding: 12 }}>
        <div className="card-head"><h3>Meses do ano de serviço</h3><span className="sub" style={{ fontWeight: 700 }}>realizado / meta</span></div>
        <MonthGrid months={ys.months} onPick={onPickMonth} />
      </div>

      <div className="card">
        <div className="ring-wrap">
          <Ring value={ys.total} max={ys.goal} label={fmtHours(ys.total)} sub={`de ${fmtHours(ys.goal)} h`} color={color} />
          <div>
            <DiffPill diff={ys.diff} level={ys.level} />
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
              Ritmo ideal hoje: <b style={{ color: 'var(--ink)' }}>{fmtHours(ys.pace)} h</b><br />
              Faltam <b style={{ color: 'var(--ink)' }}>{fmtHours(Math.max(0, ys.goal - ys.total))} h</b> em {daysLeft} dias
            </div>
          </div>
        </div>
        <GoalBar total={ys.total} goal={ys.goal} minGoal={ys.minGoal} color={color} />
      </div>

      {cur && (
        <div className="row">
          <div className="card">
            <h3>{MONTH_NAME[today.getMonth()]}</h3>
            <div className="big">{fmtHours(cur.counted)}<small> / {fmtHours(cur.goal)} h</small></div>
            <div className="sub">{curLeft > 0 ? `Faltam ${fmtHours(curLeft)} h em ${lastDay - today.getDate() + 1} dias` : 'Meta do mês atingida ✓'}</div>
          </div>
          <div className="card">
            <h3>Precisa/mês</h3>
            <div className="big">{fmtHours(ys.needed)}<small> h</small></div>
            <div className="sub">média nos meses restantes</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>Realizado × planejado · {MONTH_NAME[today.getMonth()].toLowerCase()}</h3>
          <span className="sub" style={{ fontWeight: 700 }}>até hoje</span>
        </div>
        {pvd.planned === 0 && pvd.done === 0 ? (
          <div className="empty">Nada planejado ou lançado neste mês até hoje.</div>
        ) : (
          <>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div><div className="sub">Planejado</div><div className="big" style={{ fontSize: 24 }}>{fmtHours(pvd.planned)}<small> h</small></div></div>
              <div><div className="sub">Realizado</div><div className="big" style={{ fontSize: 24 }}>{fmtHours(pvd.done)}<small> h</small></div></div>
              <div style={{ textAlign: 'right' }}>
                <div className="sub">Cumprimento</div>
                <div className="big" style={{ fontSize: 24, color: pvd.pct === null ? undefined : pvd.pct >= 1 ? 'var(--ok)' : pvd.pct >= 0.8 ? 'var(--warn)' : 'var(--bad)' }}>
                  {pvd.pct === null ? '—' : `${Math.round(pvd.pct * 100)}%`}
                </div>
              </div>
            </div>
            <div className="bar" style={{ marginTop: 12, height: 12 }}>
              <i style={{ width: `${Math.min(100, (pvd.done / Math.max(pvd.planned, pvd.done, 1)) * 100)}%`, background: color }} />
            </div>
            <div className="sub" style={{ marginTop: 6 }}>
              {diff === 0 ? 'Exatamente o planejado.' : diff > 0 ? `${fmtH(diff)} acima do planejado.` : `${fmtH(-diff)} abaixo do planejado.`}
            </div>
            <div className="chips" style={{ marginTop: 10 }}>
              <span className="pill ok">✓ {pvd.days.done} cumprido{pvd.days.done === 1 ? '' : 's'}</span>
              <span className="pill warn">◐ {pvd.days.part} parcia{pvd.days.part === 1 ? 'l' : 'is'}</span>
              <span className="pill bad">✗ {pvd.days.miss} falta{pvd.days.miss === 1 ? '' : 's'}</span>
              {pvd.days.pending > 0 && <span className="pill" style={{ background: 'var(--future)', color: '#3D4A5C' }}>? {pvd.days.pending} não lançado{pvd.days.pending === 1 ? '' : 's'}</span>}
            </div>
            {pvd.days.pending > 0 && (
              <div className="sub" style={{ marginTop: 8 }}>
                Inclui {fmtHours(pvd.pendingPlanned)} h planejadas em dias ainda não lançados (contam como 0 até você lançar).
              </div>
            )}
            {pvd.days.pending > 0 && onPickDate && (
              <button className="link" style={{ marginTop: 10, fontSize: 13 }} onClick={() => onPickDate(pvd.pendingDates[0])}>
                Lançar dias pendentes (a partir de {pvd.pendingDates[0].slice(8)}/{pvd.pendingDates[0].slice(5, 7)}) ›
              </button>
            )}
          </>
        )}
      </div>

      {ys.goalsSum < ys.goal && (
        <div className="alert">⚠ A soma das metas mensais é {fmtHours(ys.goalsSum)} h — menor que a meta anual de {fmtHours(ys.goal)} h. Ajuste no Plano.</div>
      )}
      {needJustification && onLaunch && (
        <div className="alert">
          {ys.level === 'bad' ? 'Abaixo do ritmo de 560 h.' : 'Abaixo do ritmo de 600 h.'} Registre uma justificativa no Relatório do mês.
        </div>
      )}

      {onLaunch && (
        <button className="btn brand" onClick={onLaunch}>
          + Lançar hoje ({WEEKDAY_SHORT[today.getDay()]}, {isoDate(today).slice(8)}/{isoDate(today).slice(5, 7)})
        </button>
      )}
    </>
  )
}
