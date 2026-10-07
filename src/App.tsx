import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { DEFAULT_MODALITIES, isoDate, monthKey, parseIso, serviceYearOf } from './domain'
import { useYear } from './data'
import type { AuthUser, Share } from './types'
import { Avatar, Header, Loading, TabBar, useToast, type Tab } from './ui'
import { Auth } from './screens/Auth'
import { PainelBody } from './screens/Painel'
import { Lancar } from './screens/Lancar'
import { Plano } from './screens/Plano'
import { Relatorio } from './screens/Relatorio'
import { Casal } from './screens/Casal'
import { Config } from './screens/Config'

function getToday(): Date {
  // ?hoje=AAAA-MM-DD permite simular uma data (útil para testes)
  const q = new URLSearchParams(location.search).get('hoje')
  return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? parseIso(q) : new Date()
}

export function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  useEffect(() => {
    const refresh = () => api.getUser().then(setUser)
    void refresh()
    return api.onAuthChange(refresh)
  }, [])

  if (user === undefined) return <div className="center"><div className="empty">Carregando…</div></div>
  if (!user) return <Auth />
  return <Main user={user} />
}

function Main({ user }: { user: AuthUser }) {
  const today = useMemo(getToday, [])
  const sy = serviceYearOf(today)
  const me = useYear(user.id, sy)
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [sharedOut, setSharedOut] = useState(false)
  const partner = useYear(partnerId, sy)
  const [tab, setTab] = useState<Tab>('painel')
  const [date, setDate] = useState(isoDate(today))
  const [month, setMonth] = useState(monthKey(today))
  const toast = useToast()

  const loadPartner = useCallback(async () => {
    const [incoming, outgoing] = await Promise.all([
      api.select<Share>('shares', { eq: { viewer: user.id } }),
      api.select<Share>('shares', { eq: { owner: user.id } }),
    ])
    setPartnerId(incoming.find((s) => s.owner !== user.id)?.owner ?? null)
    setSharedOut(outgoing.some((s) => s.viewer !== user.id))
  }, [user.id])
  useEffect(() => { void loadPartner().catch(() => {}) }, [loadPartner])

  // Primeiro acesso: cria as modalidades padrão (uma única vez)
  const seeded = useRef(false)
  useEffect(() => {
    if (me.data && me.data.modalities.length === 0 && !seeded.current) {
      seeded.current = true
      void api.insert('modalities', DEFAULT_MODALITIES.map((m, i) => ({ user_id: user.id, name: m.name, color: m.color, active: true, sort: i })))
        .then(me.reload)
    }
  }, [me.data, me.reload, user.id])

  const name = me.data?.profile?.name || user.email.split('@')[0]
  const color = me.data?.profile?.color
  const go = (t: Tab) => { setTab(t); window.scrollTo(0, 0) }
  const d = me.data

  let body
  if (!d) body = <><Header kicker="" title="" /><Loading error={me.error} /></>
  else if (tab === 'painel') body = (
    <>
      <Header kicker={`Ano de serviço ${sy} · mês ${((today.getMonth() + 4) % 12) + 1} de 12`} title={`Olá, ${name.split(' ')[0]}!`}
        right={<Avatar name={name} color={color} onClick={() => go('config')} />} />
      <div className="main">
        <PainelBody data={d} today={today} color={color}
          onLaunch={() => { setDate(isoDate(today)); go('lancar') }}
          onPickMonth={(m) => { setMonth(m); go('relatorio') }}
          onPickDate={(dt) => { setDate(dt); go('lancar') }} />
      </div>
    </>
  )
  else if (tab === 'lancar') body = <Lancar data={d} today={today} date={date} setDate={setDate} reload={me.reload} toast={toast.show} />
  else if (tab === 'plano') body = <Plano data={d} today={today} month={month} setMonth={setMonth} reload={me.reload} toast={toast.show} />
  else if (tab === 'relatorio') body = <Relatorio data={d} today={today} month={month} setMonth={setMonth} reload={me.reload} toast={toast.show} name={name} />
  else if (tab === 'casal') body = partnerId && !partner.data ? <><Header kicker="" title="Nós dois" /><Loading error={partner.error} /></> : (
    <Casal me={d} partner={partnerId ? partner.data : null} sharedOut={sharedOut} today={today} toast={toast.show}
      onLinked={() => { void loadPartner(); void partner.reload() }} />
  )
  else body = <Config data={d} reload={me.reload} toast={toast.show} onBack={() => go('painel')} />

  return (
    <div className="app">
      {api.demo && <div className="banner">MODO DEMONSTRAÇÃO · dados de exemplo, salvos só neste aparelho</div>}
      {body}
      <TabBar tab={tab} onTab={go} />
      {toast.node}
    </div>
  )
}
