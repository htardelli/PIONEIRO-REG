import { useState } from 'react'
import { api } from '../api'
import { fmtHours, isoDate, monthKey } from '../domain'
import { yearStats, type YearData } from '../data'
import { Avatar, DiffPill, Header, initials } from '../ui'
import { PainelBody } from './Painel'

const LEVEL_TXT = { ok: 'No ritmo de 600 h', warn: 'Entre 560 e 600 h', bad: 'Abaixo de 560 h' }

export function Casal({ me, partner, today, onLinked, toast }: {
  me: YearData; partner: YearData | null; today: Date; onLinked: () => void; toast: (m: string) => void
}) {
  const [view, setView] = useState<'resumo' | 'painel'>('resumo')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function link() {
    setBusy(true)
    try {
      await api.rpc('link_partner', { partner_email: email })
      toast('Vínculo criado ✓')
      onLinked()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!partner) {
    return (
      <>
        <Header kicker={`AS ${me.sy}`} title="Nós dois" />
        <div className="main">
          <div className="card form">
            <h3>Vincular cônjuge</h3>
            <div className="sub" style={{ fontSize: 14 }}>
              Informe o e-mail da conta do cônjuge. Os dois passam a ver o desempenho um do outro (somente leitura). A outra pessoa precisa já ter se cadastrado.
            </div>
            <input className="input" type="email" placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn brand" disabled={busy || !email.includes('@')} onClick={link}>Vincular</button>
          </div>
        </div>
      </>
    )
  }

  const people = [me, partner].map((d) => ({ d, ys: yearStats(d, today), name: d.profile?.name ?? '', color: d.profile?.color ?? '#2E75B6' }))
  const cur = monthKey(today)
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay())
  const week = Array.from({ length: 7 }, (_, i) => { const x = new Date(weekStart); x.setDate(weekStart.getDate() + i); return isoDate(x) })
  const weekMax = Math.max(60, ...people.flatMap((p) => week.map((w) => p.d.entries.filter((e) => e.date === w).reduce((a, e) => a + e.minutes, 0))))

  return (
    <>
      <Header kicker={`AS ${me.sy} · até ${isoDate(today).slice(8)}/${isoDate(today).slice(5, 7)}`} title="Nós dois" />
      <div className="main">
        <div className="seg">
          <button className={view === 'resumo' ? 'on' : ''} onClick={() => setView('resumo')}>Comparativo</button>
          <button className={view === 'painel' ? 'on' : ''} onClick={() => setView('painel')}>Painel de {partner.profile?.name || 'cônjuge'}</button>
        </div>

        {view === 'painel' ? (
          <PainelBody data={partner} today={today} color={people[1].color} />
        ) : (
          <>
            <div className="card">
              {people.map(({ ys, name, color }, i) => (
                <div key={i} style={{ marginBottom: i === 0 ? 18 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <Avatar name={name} color={color} />
                    <div style={{ flex: 1 }}><b>{name}</b><div className="sub">{fmtHours(ys.total)} h · ritmo {fmtHours(ys.pace)} h</div></div>
                    <DiffPill diff={ys.diff} level={ys.level} />
                  </div>
                  <div className="bar"><i style={{ width: `${(ys.total / ys.goal) * 100}%`, background: color }} /></div>
                </div>
              ))}
            </div>
            <div className="card">
              <h3>Status</h3>
              {people.map(({ ys, name }, i) => {
                const m = ys.months.find((x) => x.month === cur)
                return (
                  <div className="kv" key={i}>
                    <span>{name}<div className="sub">Mês: {fmtHours(m?.counted ?? 0)}/{fmtHours(m?.goal ?? 0)} h · precisa {fmtHours(ys.needed)} h/mês</div></span>
                    <span className={`pill ${ys.level}`}>{LEVEL_TXT[ys.level]}</span>
                  </div>
                )
              })}
            </div>
            <div className="card">
              <h3>Esta semana</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', height: 90, gap: 4 }}>
                {week.map((w, i) => (
                  <div key={w} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 70 }}>
                      {people.map((p, j) => {
                        const v = p.d.entries.filter((e) => e.date === w).reduce((a, e) => a + e.minutes, 0)
                        return <div key={j} style={{ width: 12, height: Math.max(2, (v / weekMax) * 70), background: v ? p.color : 'var(--line)', borderRadius: 3 }} />
                      })}
                    </div>
                    <span className="sub" style={{ fontSize: 10, fontWeight: 600 }}>{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][i]}</span>
                  </div>
                ))}
              </div>
              <div className="legend">{people.map((p, i) => <span key={i}><i style={{ background: p.color }} />{p.name}</span>)}</div>
            </div>
            <button className="btn danger small" onClick={async () => {
              if (!confirm(`Desfazer o vínculo com ${partner.profile?.name}?`)) return
              await api.rpc('unlink_partner', { partner: partner.userId }); onLinked()
            }}>Desfazer vínculo ({initials(partner.profile?.name ?? '')})</button>
          </>
        )}
      </div>
    </>
  )
}
