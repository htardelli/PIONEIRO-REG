import { useEffect, useState, type ReactNode } from 'react'
import { blockMinutes, fmtH, fmtHours, fromMinutes, MONTH_ABBR, toMinutes, type TimeBlock } from './domain'
import { monthCard, type MonthStats } from './data'
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

export function MonthNav({ label, onPrev, onNext, prevDisabled, nextDisabled }: {
  label: string; onPrev: () => void; onNext: () => void; prevDisabled?: boolean; nextDisabled?: boolean
}) {
  return (
    <>
      <button className="arrow" onClick={onPrev} disabled={prevDisabled} aria-label="Anterior">‹</button>
      {label}
      <button className="arrow" onClick={onNext} disabled={nextDisabled} aria-label="Próximo">›</button>
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

export function MonthGrid({ months, today, needed, onPick }: {
  months: MonthStats[]; today: Date; needed: number; onPick?: (m: string) => void
}) {
  return (
    <>
      <div className="months">
        {months.map((m) => {
          const c = monthCard(m, today, needed)
          return (
            <button key={m.month} className={`m s-${c.status}`} onClick={() => onPick?.(m.month)}>
              <div className="t">{MONTH_ABBR[Number(m.month.slice(5)) - 1]}</div>
              <div className="r">{c.status === 'future' ? '–' : fmtHours(m.counted)}</div>
              <div className="g">{c.lines[0]}</div>
              <div className="g" style={{ fontWeight: 800 }}>{c.lines[1]}</div>
              <div className="g">{c.lines[2] || '\u00a0'}</div>
            </button>
          )
        })}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--ok)' }} />Plano coberto</span>
        <span><i style={{ background: 'var(--bad)' }} />Abaixo do plano</span>
        <span><i style={{ background: 'var(--now)' }} />Em andamento</span>
        <span><i style={{ background: 'var(--future)' }} />A vir</span>
      </div>
      <div className="sub" style={{ marginTop: 4, fontSize: 11 }}>Mês sem plano mostra a média mensal necessária para fechar o ano.</div>
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
  return <span className={`pill ${level}`}>{diff >= 0 ? '▲ +' : '▼ −'}{fmtHours(Math.abs(diff))} h {diff >= 0 ? 'adiantado' : 'atrasado'}</span>
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
