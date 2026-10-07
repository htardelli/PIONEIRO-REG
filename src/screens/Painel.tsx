import { daysLeftInYear, fmtHours, isoDate, MONTH_NAME, monthKey, WEEKDAY_SHORT } from '../domain'
import { yearStats, type YearData } from '../data'
import { DiffPill, GoalBar, MonthGrid, Ring } from '../ui'

export function PainelBody({ data, today, onLaunch, onPickMonth, color }: {
  data: YearData; today: Date; onLaunch?: () => void; onPickMonth?: (m: string) => void; color?: string
}) {
  const ys = yearStats(data, today)
  const cur = ys.months.find((m) => m.month === monthKey(today))
  const daysLeft = daysLeftInYear(data.sy, today)
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const curLeft = cur ? Math.max(0, cur.goal - cur.counted) : 0
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
