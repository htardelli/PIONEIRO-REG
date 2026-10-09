import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { DEFAULT_EVENT_TYPES, DEFAULT_MODALITIES, isoDate, monthKey, MONTH_NAME, parseIso, serviceYearOf } from './domain'
import { useYear, yearRange, type JointPartner } from './data'
import type { AuthUser, Share } from './types'
import { Avatar, Header, Loading, TabBar, useToast, type Tab } from './ui'
import { Auth } from './screens/Auth'
import { PainelBody } from './screens/Painel'
import { Lancar } from './screens/Lancar'
import { Mes } from './screens/Mes'
import { Plano } from './screens/Plano'
import { Relatorio } from './screens/Relatorio'
import { Casal } from './screens/Casal'
import { Config } from './screens/Config'
import { ChangePassword } from './screens/ChangePassword'

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
  const [today, setToday] = useState(getToday)
  const curSy = serviceYearOf(today)
  // Ano de serviço exibido: o atual ou o anterior (para lançar/relatar agosto no início de setembro)
  const [sy, setSy] = useState(curSy)
  const me = useYear(user.id, sy)
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [sharedOut, setSharedOut] = useState(false)
  const partner = useYear(partnerId, sy)
  const [tab, setTab] = useState<Tab>('painel')
  const [date, setDateRaw] = useState(isoDate(today))
  const [month, setMonthRaw] = useState(monthKey(today))
  const setDate = (dt: string) => { setDateRaw(dt); setSy(serviceYearOf(parseIso(dt))) }
  const setMonth = (m: string) => { setMonthRaw(m); setSy(serviceYearOf(parseIso(`${m}-01`))) }
  // Vira o dia com o app aberto (ex.: meia-noite) ou ao voltar para o app: atualiza "hoje"
  useEffect(() => {
    const check = () => {
      const t = getToday()
      if (isoDate(t) === isoDate(today)) return
      setToday(t)
      setDateRaw((d) => (d === isoDate(today) ? isoDate(t) : d))
      setMonthRaw((m) => (m === monthKey(today) ? monthKey(t) : m))
      setSy(serviceYearOf(t))
    }
    const timer = setInterval(check, 60000)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check) }
  }, [today])
  const toast = useToast()

  const loadPartner = useCallback(async () => {
    const [incoming, outgoing] = await Promise.all([
      api.select<Share>('shares', { eq: { viewer: user.id } }),
      api.select<Share>('shares', { eq: { owner: user.id } }),
    ])
    // Cônjuge: de preferência quem tem compartilhamento MÚTUO comigo; escolha estável (ordenada)
    const owners = incoming.map((s) => s.owner).filter((o) => o !== user.id).sort()
    const mutual = owners.find((o) => outgoing.some((s) => s.viewer === o))
    const pid = mutual ?? owners[0] ?? null
    setPartnerId(pid)
    setSharedOut(!!pid && outgoing.some((s) => s.viewer === pid))
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
  // Primeiro acesso: tipos de evento padrão (editáveis em Configurações)
  const seededEv = useRef(false)
  useEffect(() => {
    if (me.data && me.data.eventTypes.length === 0 && !seededEv.current) {
      seededEv.current = true
      void api.insert('event_types', DEFAULT_EVENT_TYPES.map((name, i) => ({ user_id: user.id, name, sort: i })))
        .then(me.reload).catch(() => {})
    }
  }, [me.data, me.reload, user.id])

  const name = me.data?.profile?.name || user.email.split('@')[0]
  const color = me.data?.profile?.color
  const go = (t: Tab) => {
    setTab(t)
    // cada aba mostra o ano de serviço do que ela exibe: Lançar → data; Plano/Relatório → mês; demais → ano atual
    setSy(t === 'lancar' ? serviceYearOf(parseIso(date)) : t === 'plano' || t === 'relatorio' ? serviceYearOf(parseIso(`${month}-01`)) : curSy)
    window.scrollTo(0, 0)
  }
  const d = me.data
  // Participante para atividades conjuntas: só com compartilhamento mútuo e dados dele(a) carregados
  const joint: JointPartner | null = partnerId && sharedOut && partner.data
    ? { id: partnerId, name: partner.data.profile?.name || 'Cônjuge', data: partner.data } : null
  const reloadBoth = async () => { await Promise.all([me.reload(), joint ? partner.reload() : Promise.resolve()]) }

  let body
  if (d?.profile?.must_change_password) {
    return <ChangePassword name={name} onDone={me.reload} />
  }
  if (!d) body = <><Header kicker="" title="" /><Loading error={me.error} /></>
  else if (tab === 'painel') body = (
    <>
      <Header kicker={`Ano de serviço ${sy} · mês ${((today.getMonth() + 4) % 12) + 1} de 12`} title={`Olá, ${name.split(' ')[0]}!`}
        side={<Avatar name={name} color={color} photo={d.profile?.avatar} size={60} onClick={() => go('config')} />} />
      <div className="main">
        <PainelBody data={d} today={today} color={color}
          onLaunch={() => { go('lancar'); setDate(isoDate(today)) }}
          onPickMonth={(m) => { go('relatorio'); setMonth(m) }}
          onPickDate={(dt) => { go('lancar'); setDate(dt) }}
          onPlanMonth={(m) => { go('plano'); setMonth(m) }} />
      </div>
    </>
  )
  else if (tab === 'lancar') body = <Lancar data={d} today={today} minDate={yearRange(curSy - 1)[0]} date={date} setDate={setDate} reload={reloadBoth} toast={toast.show} partner={joint} />
  else if (tab === 'mes') body = <Mes data={d} today={today} onEdit={(dt) => { go('lancar'); setDate(dt) }} />
  else if (tab === 'plano') body = <Plano data={d} today={today} month={month} setMonth={setMonth} reload={reloadBoth} toast={toast.show} partner={joint} />
  else if (tab === 'relatorio') body = <Relatorio data={d} today={today} curSy={curSy} month={month} setMonth={setMonth} reload={me.reload} toast={toast.show} name={name} />
  else if (tab === 'casal') body = partnerId && !partner.data ? <><Header kicker="" title="Nós dois" /><Loading error={partner.error} /></> : (
    <Casal me={d} partner={partnerId ? partner.data : null} sharedOut={sharedOut} today={today} toast={toast.show}
      onLinked={() => { void loadPartner(); void partner.reload() }} />
  )
  else body = <Config data={d} reload={me.reload} toast={toast.show} onBack={() => go('painel')} />

  return (
    <div className="app">
      {api.demo && <div className="banner">MODO DEMONSTRAÇÃO · dados de exemplo, salvos só neste aparelho</div>}
      {body}
      <TabBar tab={tab} onTab={go} monthName={MONTH_NAME[today.getMonth()]} />
      {toast.node}
    </div>
  )
}
