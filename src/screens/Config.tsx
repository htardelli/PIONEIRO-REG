import { useEffect, useState } from 'react'
import { api } from '../api'
import type { YearData } from '../data'
import { Header } from '../ui'

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

        {p?.is_admin && <AdminCreateUser toast={toast} />}

        <button className="btn danger" onClick={() => api.signOut()}>Sair da conta</button>
        {api.demo && <div className="sub" style={{ textAlign: 'center' }}>Modo demonstração: "Sair" restaura os dados de exemplo.</div>}
      </div>
    </>
  )
}

function genPassword(): string {
  // Sem caracteres ambíguos (0/O, 1/l/I) para facilitar a digitação no primeiro acesso
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const a = new Uint32Array(10)
  crypto.getRandomValues(a)
  return Array.from(a, (n) => chars[n % chars.length]).join('')
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
