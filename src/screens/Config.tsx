import { useEffect, useState } from 'react'
import { api } from '../api'
import type { YearData } from '../data'
import { Avatar, Header } from '../ui'

export function Config({ data, reload, toast, onBack }: {
  data: YearData; reload: () => Promise<void>; toast: (m: string) => void; onBack: () => void
}) {
  const p = data.profile
  const [name, setName] = useState(p?.name ?? '')
  const [color, setColor] = useState(p?.color ?? '#2E75B6')
  const [goal, setGoal] = useState(String((p?.annual_goal_min ?? 36000) / 60))
  const [minGoal, setMinGoal] = useState(String((p?.min_goal_min ?? 33600) / 60))
  const [newMod, setNewMod] = useState('')
  useEffect(() => { setName(p?.name ?? ''); setColor(p?.color ?? '#2E75B6') }, [p])

  async function saveProfile() {
    const g = Number(goal), mg = Number(minGoal)
    if (!(g > 0) || !(mg > 0) || mg > g) return toast('Verifique as metas (mínimo ≤ meta)')
    await api.update('profiles', { id: data.userId }, { name, color, annual_goal_min: Math.round(g * 60), min_goal_min: Math.round(mg * 60) })
    await reload()
    toast('Perfil salvo')
  }

  /** Recorta no centro (quadrado), reduz para 256×256 e salva como JPEG no perfil. */
  async function savePhoto(file: File) {
    try {
      const img = await createImageBitmap(file)
      const side = Math.min(img.width, img.height)
      const c = document.createElement('canvas'); c.width = c.height = 256
      c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256)
      await savePhotoUrl(c.toDataURL('image/jpeg', 0.85))
    } catch { toast('Não foi possível ler essa imagem') }
  }
  async function savePhotoUrl(url: string | null) {
    await api.update('profiles', { id: data.userId }, { avatar: url })
    await reload()
    toast(url ? 'Foto salva' : 'Foto removida')
  }

  async function addMod() {
    if (!newMod.trim()) return
    await api.insert('modalities', [{ user_id: data.userId, name: newMod.trim(), color: '#97A3B6', active: true, sort: data.modalities.length }])
    setNewMod('')
    await reload()
  }

  return (
    <>
      <Header kicker={<button className="link" onClick={onBack} style={{ fontSize: 12 }}>‹ VOLTAR</button>} title="Configurações" />
      <div className="main">
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={p?.name ?? ''} color={p?.color} photo={p?.avatar} size={72} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={{ margin: 0 }}>Foto do perfil</h3>
            <label className="btn brand small" style={{ cursor: 'pointer' }}>
              {p?.avatar ? 'Trocar foto' : 'Escolher foto'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && savePhoto(e.target.files[0])} />
            </label>
            {p?.avatar && <button className="link" style={{ color: 'var(--bad)', alignSelf: 'flex-start' }} onClick={() => savePhotoUrl(null)}>Remover foto</button>}
          </div>
        </div>

        <div className="card form">
          <h3>Perfil e metas</h3>
          <label className="field">Nome<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="row">
            <label className="field">Meta anual (h)<input inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
            <label className="field">Mínimo tolerável (h)<input inputMode="numeric" value={minGoal} onChange={(e) => setMinGoal(e.target.value)} /></label>
          </div>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            Cor nos gráficos<input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <button className="btn brand small" onClick={saveProfile}>Salvar perfil</button>
        </div>

        <div className="card">
          <h3>Modalidades</h3>
          {data.modalities.map((m) => (
            <div className="mod" key={m.id}>
              <input type="color" value={m.color} onChange={async (e) => { await api.update('modalities', { id: m.id }, { color: e.target.value }); await reload() }} />
              <input className="n input" style={{ padding: 8, border: 0, opacity: m.active ? 1 : .45 }} defaultValue={m.name}
                onBlur={async (e) => { if (e.target.value.trim() && e.target.value !== m.name) { await api.update('modalities', { id: m.id }, { name: e.target.value.trim() }); await reload() } }} />
              <button className={`switch ${m.active ? 'on' : ''}`} aria-label="Ativa"
                onClick={async () => { await api.update('modalities', { id: m.id }, { active: !m.active }); await reload() }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input className="input" placeholder="Nova modalidade" value={newMod} onChange={(e) => setNewMod(e.target.value)} />
            <button className="btn brand small" style={{ width: 'auto', padding: '0 16px' }} onClick={addMod}>+</button>
          </div>
          <div className="sub" style={{ marginTop: 8 }}>Modalidades desativadas somem do lançamento, mas o histórico é mantido.</div>
        </div>

        <EventTypes data={data} reload={reload} toast={toast} />

        {p?.is_admin && <PendingUsers toast={toast} />}
        {p?.is_admin && <AdminCreateUser toast={toast} />}

        <button className="btn danger" onClick={() => api.signOut()}>Sair da conta</button>
        {api.demo && <div className="sub" style={{ textAlign: 'center' }}>Modo demonstração: "Sair" restaura os dados de exemplo.</div>}
        <div className="sub" style={{ textAlign: 'center' }}>Versão {__APP_VERSION__}</div>
      </div>
    </>
  )
}

/** Cadastro dos tipos de evento (Congresso, Assembleia…) usados em "Marcar evento". */
function EventTypes({ data, reload, toast }: { data: YearData; reload: () => Promise<void>; toast: (m: string) => void }) {
  const [novo, setNovo] = useState('')
  const types = data.eventTypes
  async function add() {
    const name = novo.trim()
    if (!name) return
    if (types.some((t) => t.name.toLowerCase() === name.toLowerCase())) return toast('Esse tipo já existe')
    await api.insert('event_types', [{ user_id: data.userId, name, sort: types.length }])
    setNovo('')
    await reload()
  }
  async function remove(id: string, name: string) {
    if (types.length <= 1) return toast('Mantenha pelo menos um tipo')
    if (!confirm(`Excluir o tipo "${name}"? Os eventos já marcados continuam no calendário.`)) return
    await api.remove('event_types', { eq: { id } })
    await reload()
  }
  return (
    <div className="card">
      <h3>Tipos de evento</h3>
      {types.map((t) => (
        <div className="mod" key={t.id}>
          <i className="dot" style={{ background: 'var(--credit)' }} />
          <input className="n input" style={{ padding: 8, border: 0 }} defaultValue={t.name}
            onBlur={async (e) => { const v = e.target.value.trim(); if (v && v !== t.name) { await api.update('event_types', { id: t.id }, { name: v }); await reload(); toast('Tipo renomeado') } }} />
          <button className="link" style={{ color: 'var(--bad)' }} onClick={() => remove(t.id, t.name)} aria-label={`Excluir ${t.name}`}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input className="input" placeholder="Novo tipo (ex.: Escola de pioneiros)" value={novo} onChange={(e) => setNovo(e.target.value)} />
        <button className="btn brand small" style={{ width: 'auto', padding: '0 16px' }} onClick={add}>+</button>
      </div>
      <div className="sub" style={{ marginTop: 8 }}>Aparecem em "Marcar evento" no Plano. "Outro" fica sempre disponível para casos avulsos.</div>
    </div>
  )
}

function genPassword(): string {
  // Sem caracteres ambíguos (0/O, 1/l/I) para facilitar a digitação no primeiro acesso
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const a = new Uint32Array(10)
  crypto.getRandomValues(a)
  return Array.from(a, (n) => chars[n % chars.length]).join('')
}

/** Administrador: cadastros feitos pelo app aguardando aprovação (Aprovar libera; Recusar exclui a conta). */
function PendingUsers({ toast }: { toast: (m: string) => void }) {
  const [list, setList] = useState<{ id: string; name: string; email: string; created_at: string }[] | null>(null)
  const load = () => api.rpc<{ id: string; name: string; email: string; created_at: string }[]>('admin_pending_users', {})
    .then((r) => setList(r ?? [])).catch(() => setList([]))
  useEffect(() => { void load() }, [])
  async function decide(u: { id: string; name: string; email: string }, approve: boolean) {
    if (!approve && !confirm(`Recusar o cadastro de ${u.name || u.email}? A conta será excluída.`)) return
    try {
      await api.rpc('admin_set_approval', { p_user: u.id, p_approve: approve })
      toast(approve ? `${u.name || u.email} aprovado(a)` : 'Cadastro recusado e excluído')
      await load()
    } catch (e) { toast((e as Error).message) }
  }
  return (
    <div className="card">
      <div className="card-head"><h3>Cadastros pendentes</h3>{list && list.length > 0 && <span className="pill warn">{list.length}</span>}</div>
      {list === null ? <div className="sub">Carregando…</div> : list.length === 0 ? <div className="empty">Nenhum cadastro aguardando aprovação.</div> : list.map((u) => (
        <div key={u.id} className="mod" style={{ alignItems: 'center' }}>
          <span className="n"><b>{u.name || '—'}</b><span className="sub"><br />{u.email} · {new Date(u.created_at).toLocaleDateString('pt-BR')}</span></span>
          <button className="btn small" style={{ width: 'auto', padding: '6px 12px', background: 'var(--ok)', color: '#fff' }} onClick={() => decide(u, true)}>Aprovar</button>
          <button className="link" style={{ color: 'var(--bad)', marginLeft: 8 }} onClick={() => decide(u, false)}>Recusar</button>
        </div>
      ))}
      <div className="sub" style={{ marginTop: 8 }}>Quem se cadastra pelo app só acessa depois da sua aprovação. Contas criadas por você já entram aprovadas.</div>
    </div>
  )
}

function AdminCreateUser({ toast }: { toast: (m: string) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState(genPassword)
  const [share, setShare] = useState(true)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ name: string; email: string; pw: string } | null>(null)

  async function create() {
    setBusy(true)
    try {
      await api.rpc('admin_create_user', { p_email: email.trim(), p_name: name.trim(), p_password: pw, share_mine: share })
      setCreated({ name: name.trim(), email: email.trim().toLowerCase(), pw })
      setName(''); setEmail(''); setPw(genPassword())
      toast('Conta criada ✓')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const message = created
    ? `Olá, ${created.name.split(' ')[0]}! Sua conta no Pioneiro-REG foi criada.\n` +
      `Acesse: ${location.origin}${import.meta.env.BASE_URL}\n` +
      `E-mail: ${created.email}\nSenha provisória: ${created.pw}\n` +
      `No primeiro acesso você vai definir sua própria senha.`
    : ''

  return (
    <div className="card form">
      <h3 style={{ margin: 0 }}>Administração · criar conta</h3>
      <label className="field">Nome<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Jessika" /></label>
      <label className="field">E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" /></label>
      <label className="field">Senha provisória
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={pw} onChange={(e) => setPw(e.target.value)} style={{ fontFamily: 'ui-monospace, monospace' }} />
          <button className="btn ghost small" style={{ width: 'auto', padding: '0 12px' }} onClick={() => setPw(genPassword())}>Gerar</button>
        </div>
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
        Compartilhar meus dados com esta pessoa
      </label>
      <div className="sub">A pessoa troca a senha no primeiro acesso. Para você ver os dados dela, ela compartilha na aba Casal.</div>
      <button className="btn brand small" disabled={busy || !email.includes('@') || pw.length < 8} onClick={create}>
        {busy ? 'Criando…' : 'Criar conta'}
      </button>
      {created && (
        <div className="info" style={{ whiteSpace: 'pre-line', fontWeight: 500 }}>
          {message}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn brand small" onClick={async () => { try { await navigator.clipboard.writeText(message); toast('Mensagem copiada') } catch { toast('Não foi possível copiar') } }}>Copiar mensagem</button>
            <a className="btn ghost small" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </div>
      )}
    </div>
  )
}
