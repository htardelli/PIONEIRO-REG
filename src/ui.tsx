import { useEffect, useState, type ReactNode } from 'react'
import { blockMinutes, fmtH, fmtHours, fromMinutes, MONTH_ABBR, toMinutes, type TimeBlock } from './domain'
import { monthCard, TARGET_LABEL, type MonthStats } from './data'
import type { Modality } from './types'

export type Tab = 'painel' | 'lancar' | 'plano' | 'relatorio' | 'casal' | 'config'

const ICONS: Record<Exclude<Tab, 'config'>, ReactNode> = {
  painel: <path d="M3 12l9-8 9 8v8a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z" />,
  lancar: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  plano: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  relatorio: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7" /></>,
  casal: <><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M15 14.5c3 0 6 2 6 5.5" /></>,
}
const LABELS = { painel: 'Painel', lancar: 'Lançar', plano: 'Plano', relatorio: 'Relatório', casal: 'Casal' }

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="tabbar">
      <div>
        {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => onTab(t)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{ICONS[t]}</svg>
            {LABELS[t]}
          </button>
        ))}
      </div>
    </nav>
  )
}

export function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : (p[0]?.[1] ?? ''))).toUpperCase()
}

export function Avatar({ name, color, onClick }: { name: string; color?: string; onClick?: () => void }) {
  return (
    <button className="avatar" style={{ background: color }} onClick={onClick} aria-label="Configurações">
      {initials(name)}
    </button>
  )
}

export function Header({ kicker, title, right }: { kicker: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="top">
      <div className="kicker">{kicker}</div>
      <div className="title"><span className="nav-arrows">{title}</span>{right}</div>
    </header>
  )
}

export interface MonthPickInfo { line: string; status?: string }

/** Navegação mensal. Com `months` + `onPick`, tocar no nome do mês abre a grade dos 12 meses do ano de serviço. */
export function MonthNav({ label, onPrev, onNext, prevDisabled, nextDisabled, months, current, onPick, info, todayMonth }: {
  label: string; onPrev: () => void; onNext: () => void; prevDisabled?: boolean; nextDisabled?: boolean
  months?: string[]; current?: string; onPick?: (m: string) => void; info?: (m: string) => MonthPickInfo; todayMonth?: string
}) {
  const [open, setOpen] = useState(false)
  const pickable = !!(months && onPick)
  return (
    <>
      <button className="arrow" onClick={onPrev} disabled={prevDisabled} aria-label="Anterior">‹</button>
      {pickable ? (
        <button className="date-pick" onClick={() => setOpen(true)} aria-label="Escolher o mês">{label} <span className="caret">▾</span></button>
      ) : label}
      <button className="arrow" onClick={onNext} disabled={nextDisabled} aria-label="Próximo">›</button>
      {open && pickable && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="card dialog" onClick={(e) => e.stopPropagation()}>
            <div className="card-head"><h3>Ano de serviço · {Number(months![11].slice(0, 4))}</h3><button className="link" onClick={() => setOpen(false)}>Fechar</button></div>
            <div className="mpick">
              {months!.map((m) => {
                const x = info?.(m)
                const mo = Number(m.slice(5, 7))
                return (
                  <button key={m} className={`${m === current ? 'on' : ''} ${m === todayMonth ? 'now' : ''}`} onClick={() => { onPick!(m); setOpen(false) }}>
                    <b>{MONTH_ABBR[mo - 1]}<small> {m.slice(2, 4)}</small></b>
                    {x && <span style={{ color: x.status ? STATUS_COLOR[x.status] : undefined }}>{x.line}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function Stepper({ value, onChange, step = 15 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="step">
      <button onClick={() => onChange(Math.max(0, value - step))} aria-label="Diminuir">−</button>
      <span>{fmtH(value)}</span>
      <button onClick={() => onChange(value + step)} aria-label="Aumentar">+</button>
    </div>
  )
}

export function Ring({ value, max, label, sub, color = '#2E75B6', size = 104 }: {
  value: number; max: number; label: string; sub: string; color?: string; size?: number
}) {
  const c = 2 * Math.PI * 50
  const frac = max > 0 ? Math.min(1, value / max) : 0
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
      <circle cx="60" cy="60" r="50" fill="none" stroke="#E3E8EF" strokeWidth="12" />
      {frac > 0 && (
        <circle cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${frac * c} ${c}`} transform="rotate(-90 60 60)" />
      )}
      <text x="60" y="58" textAnchor="middle" fontSize="26" fontWeight="800" fill="#0F1B2D">{label}</text>
      <text x="60" y="76" textAnchor="middle" fontSize="11" fontWeight="600" fill="#66748A">{sub}</text>
    </svg>
  )
}

export function GoalBar({ total, goal, minGoal, color }: { total: number; goal: number; minGoal: number; color?: string }) {
  const scale = Math.max(goal, total) || 1
  return (
    <div style={{ margin: '12px 4px 20px' }}>
      <div className="bar">
        <i style={{ width: `${(total / scale) * 100}%`, background: color }} />
        <div className="mk" style={{ left: `${(minGoal / scale) * 100}%`, background: 'var(--warn)' }}>
          <span style={{ right: 4 }}>{fmtHours(minGoal)}</span>
        </div>
        <div className="mk" style={{ left: `calc(${(goal / scale) * 100}% - 2px)` }}>
          <span style={{ right: -2 }}>{fmtHours(goal)}</span>
        </div>
      </div>
    </div>
  )
}

const STATUS_COLOR: Record<string, string> = { ok: 'var(--ok)', bad: 'var(--bad)', now: 'var(--now)', future: 'var(--future)' }

/** Meses do ano de serviço: grade de 3 colunas; cada card mostra realizado / alvo, barra de progresso e ✓/▲/▼. */
export function MonthGrid({ months, today, needed, onPick }: {
  months: MonthStats[]; today: Date; needed: number; onPick?: (m: string) => void
}) {
  return (
    <>
      <div className="mgrid">
        {months.map((m) => {
          const c = monthCard(m, today)
          const pct = c.target > 0 ? Math.min(100, (m.counted / c.target) * 100) : 0
          const noteColor = c.note.startsWith('▼') ? 'var(--bad)' : /^[▲✓]/.test(c.note) ? 'var(--ok)' : 'var(--muted)'
          const future = c.status === 'future'
          return (
            <button key={m.month} className={`mcard s-${c.status}`} onClick={() => onPick?.(m.month)}>
              <span className="mtitle">{MONTH_ABBR[Number(m.month.slice(5)) - 1]}</span>
              <span className="mnum">
                <b className={future ? 'muted' : ''}>{future ? '–' : fmtHours(m.counted)}</b>
                {c.target > 0 && <span className="muted"> / {fmtHours(c.target)}</span>}
              </span>
              <span className="bar"><i style={{ width: `${pct}%`, background: future ? '#C3CBD7' : STATUS_COLOR[c.status] }} /></span>
              <span className="mnote" style={{ color: c.note ? noteColor : 'var(--muted)' }}>
                {c.note || TARGET_LABEL[c.kind]}
              </span>
            </button>
          )
        })}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--ok)' }} />Coberto</span>
        <span><i style={{ background: 'var(--bad)' }} />Abaixo</span>
        <span><i style={{ background: 'var(--now)' }} />Em andamento</span>
        <span><i style={{ background: 'var(--future)' }} />A vir</span>
      </div>
      <div className="sub" style={{ marginTop: 4, fontSize: 11 }}>Realizado / alvo do mês. Alvo = plano; sem plano, a meta; sem plano e sem meta, o rateio (horas que faltam para a meta anual ÷ meses livres).</div>
    </>
  )
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2200)
    return () => clearTimeout(t)
  }, [msg])
  return { show: setMsg, node: msg ? <div className="toast">{msg}</div> : null }
}

export function Loading({ error }: { error?: string | null }) {
  return <div className="main">{error ? <div className="error">{error}</div> : <div className="empty">Carregando…</div>}</div>
}

export function DiffPill({ diff, level }: { diff: number; level: 'ok' | 'warn' | 'bad' }) {
  return <span className={`pill ${level}`}>{diff >= 0 ? '▲ +' : '▼ −'}{fmtHours(Math.abs(diff))} {diff >= 0 ? 'adiantado' : 'atrasado'}</span>
}

/** Editor do plano do dia: atividades com modalidade, início e fim. Mostra conflitos de horário. */
export interface Partner { id: string; name: string }

export function BlocksEditor({ modalities, value, onChange, errors, partners = [], partnerHint }: {
  modalities: Modality[]; value: TimeBlock[]; onChange: (v: TimeBlock[]) => void; errors: Record<number, string>
  partners?: Partner[] // participantes possíveis (compartilhamento mútuo)
  partnerHint?: string // texto do toggle (ex.: "Com Jessika" / "Jessika participou")
}) {
  const active = modalities.filter((m) => m.active)
  const set = (i: number, patch: Partial<TimeBlock>) => onChange(value.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  function add() {
    const last = value.reduce((a, b) => Math.max(a, b.end ? toMinutes(b.end) : 0), 0)
    const start = last || 8 * 60
    onChange([...value, { modality_id: active[0]?.id ?? '', start: fromMinutes(start), end: fromMinutes(start + 60) }])
  }
  return (
    <div>
      {value.length === 0 && <div className="empty">Nenhuma atividade planejada neste dia.</div>}
      {value.map((b, i) => {
        const m = modalities.find((x) => x.id === b.modality_id)
        const err = errors[i]
        return (
          <div key={i} className="block" style={{ borderColor: err ? 'var(--bad)' : undefined }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <i className="dot" style={{ background: m?.color ?? '#999' }} />
              <select className="input" style={{ padding: 8, fontSize: 15, fontWeight: 600 }} value={b.modality_id}
                onChange={(e) => set(i, { modality_id: e.target.value })}>
                {!m && <option value="">Escolha…</option>}
                {modalities.filter((x) => x.active || x.id === b.modality_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <button className="link" style={{ color: 'var(--bad)', fontSize: 18, padding: '0 4px' }} aria-label="Remover"
                onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input className="input" type="time" step={300} style={{ padding: 8, flex: 1, minWidth: 0 }} value={b.start} onChange={(e) => set(i, { start: e.target.value })} aria-label="Início" />
              <span className="muted">às</span>
              <input className="input" type="time" step={300} style={{ padding: 8, flex: 1, minWidth: 0 }} value={b.end} onChange={(e) => set(i, { end: e.target.value })} aria-label="Fim" />
              <b style={{ flexShrink: 0, fontSize: 14 }}>{fmtH(blockMinutes(b))}</b>
            </div>
            {partners.length > 0 && (
              <div className="chips" style={{ marginTop: 8 }}>
                {partners.map((pt) => {
                  const on = (b.with ?? []).includes(pt.id)
                  return (
                    <button key={pt.id} className={`chip ${on ? 'on' : ''}`} onClick={() => set(i, {
                      with: on ? (b.with ?? []).filter((x) => x !== pt.id) : [...(b.with ?? []), pt.id],
                    })}>
                      👥 {partnerHint ? partnerHint.replace('{nome}', pt.name.split(' ')[0]) : `Com ${pt.name.split(' ')[0]}`}{on ? ' ✓' : ''}
                    </button>
                  )
                })}
              </div>
            )}
            {err && <div style={{ color: 'var(--bad)', fontSize: 12, fontWeight: 700, marginTop: 6 }}>⚠ {err}</div>}
          </div>
        )
      })}
      <button className="btn outline small" style={{ marginTop: 10 }} onClick={add} disabled={active.length === 0}>+ Adicionar atividade</button>
    </div>
  )
}

// ---------- Diálogo de escolha (múltipla escolha) ----------
export interface ChoiceOption<T> { label: string; value: T; kind?: 'brand' | 'outline' | 'ghost' | 'danger' }
interface ChoiceReq { title: string; text?: string; options: ChoiceOption<unknown>[]; resolve: (v: unknown) => void }

/** ask() abre um diálogo e devolve a opção escolhida (ou null se cancelado). */
export function useChoice() {
  const [req, setReq] = useState<ChoiceReq | null>(null)
  const ask = <T,>(title: string, options: ChoiceOption<T>[], text?: string) =>
    new Promise<T | null>((resolve) => setReq({ title, text, options: options as ChoiceOption<unknown>[], resolve: resolve as (v: unknown) => void }))
  const close = (v: unknown) => { req?.resolve(v); setReq(null) }
  const node = req ? (
    <div className="overlay" onClick={() => close(null)}>
      <div className="card form dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{req.title}</div>
        {req.text && <div className="sub" style={{ fontSize: 14, whiteSpace: 'pre-line' }}>{req.text}</div>}
        {req.options.map((o, i) => (
          <button key={i} className={`btn small ${o.kind ?? (i === 0 ? 'brand' : 'outline')}`} onClick={() => close(o.value)}>{o.label}</button>
        ))}
        <button className="btn ghost small" onClick={() => close(null)}>Cancelar</button>
      </div>
    </div>
  ) : null
  return { ask, node }
}
