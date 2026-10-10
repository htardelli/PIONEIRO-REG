import { useState, type ReactNode } from 'react'
import { api } from '../api'
import { Icon, type IconName } from '../icons'
import { Avatar, Header, type Tab } from '../ui'
import type { YearData } from '../data'

function Row({ icon, title, sub, onClick, badge }: { icon: IconName; title: string; sub?: string; onClick: () => void; badge?: number }) {
  return (
    <button className="lrow" onClick={onClick}>
      <span className="lic"><Icon name={icon} size={20} /></span>
      <span className="grow"><b>{title}</b>{sub && <span className="sub">{sub}</span>}</span>
      {!!badge && <i className="badge static">{badge}</i>}
      <span className="chev" aria-hidden="true">›</span>
    </button>
  )
}

/** "Mais": perfil, casal, configurações, ajuda e sair. */
export function Mais({ data, name, color, partnerName, pendingCount, go }: {
  data: YearData; name: string; color?: string; partnerName?: string; pendingCount: number; go: (t: Tab) => void
}) {
  const p = data.profile
  return (
    <>
      <Header kicker={`Ano de serviço ${data.sy}`} title="Mais" />
      <div className="main">
        <button className="card prof" onClick={() => go('config')}>
          <Avatar name={name} color={color} photo={p?.avatar} size={56} />
          <span className="grow">
            <b style={{ fontSize: 18 }}>{name}</b>
            <span className="sub">Meta {Math.round((p?.annual_goal_min ?? 36000) / 60)} h · mínimo {Math.round((p?.min_goal_min ?? 33600) / 60)} h</span>
          </span>
          <span className="chev" aria-hidden="true">›</span>
        </button>
        <div className="card list">
          <Row icon="users" title="Casal" sub={partnerName ? `Compartilhando com ${partnerName.split(' ')[0]}` : 'Compartilhar dados e lançar juntos'} onClick={() => go('casal')} />
          <Row icon="gear" title="Configurações" sub="Foto, metas, modalidades, tipos de evento" onClick={() => go('config')}
            badge={pendingCount} />
          <Row icon="help" title="Ajuda" sub="Como o app conta as horas" onClick={() => go('ajuda')} />
        </div>
        <button className="btn danger" onClick={() => api.signOut()}>Sair da conta</button>
        <div className="sub" style={{ textAlign: 'center' }}>Pioneiro-REG · versão {__APP_VERSION__}</div>
      </div>
    </>
  )
}

const FAQ: [string, ReactNode][] = [
  ['Qual é a meta?', <>600 h no ano de serviço (setembro a agosto); o mínimo tolerável é 560 h, com justificativa. Crédito de horas conta até o teto de 55 h por mês somado ao ministério.</>],
  ['O que é o "ritmo ideal"?', <>Quanto você já deveria ter feito até hoje para chegar a 600 h em ritmo constante. Na barra do ano ele é o marcador contornado ◯.</>],
  ['De onde vem o alvo do mês?', <>Do seu plano. Sem plano, vale a meta do mês (definida no Plano); sem as duas, o app divide o que falta pelos meses livres (rateio).</>],
  ['Por que não consigo lançar uma atividade de hoje?', <>Atividade planejada só pode ser confirmada depois do horário de término. As que já terminaram liberam primeiro.</>],
  ['O que acontece quando eu falto?', <>A atividade fica como falta, com o motivo, e o planejado dela passa a contar 00:00 (a justificativa fica no histórico). Salvar o dia sem horas pergunta se foi falta.</>],
  ['Atividade conjunta (com o cônjuge)', <>Com os dois compartilhando na aba Casal, ao planejar ou lançar você pode incluir o cônjuge. O app só grava para ele(a) o que ele(a) ainda não lançou; depois, cada um ajusta o seu.</>],
  ['Fiquei sem internet ao salvar', <>Nada é gravado pela metade. O que você digitou fica como rascunho neste aparelho: ao abrir o dia, toque em "Recuperar".</>],
  ['Cores do calendário', <>Verde = cumprido · âmbar = parcial · vermelho = falta · tracejado = planejado · turquesa = hoje · roxo = evento · azul-marinho sublinhado = feriado.</>],
]

export function Ajuda({ onBack }: { onBack: () => void }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <>
      <Header kicker={<button className="link" onClick={onBack} style={{ fontSize: 12 }}>‹ MAIS</button>} title="Ajuda" />
      <div className="main">
        <div className="card list">
          {FAQ.map(([q, a], i) => (
            <div key={i} className="faq">
              <button className="lrow" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                <span className="grow"><b>{q}</b></span><span className="chev" aria-hidden="true">{open === i ? '−' : '+'}</span>
              </button>
              {open === i && <div className="faq-a">{a}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
