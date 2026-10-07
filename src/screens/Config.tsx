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

        <button className="btn danger" onClick={() => api.signOut()}>Sair da conta</button>
        {api.demo && <div className="sub" style={{ textAlign: 'center' }}>Modo demonstração: "Sair" restaura os dados de exemplo.</div>}
      </div>
    </>
  )
}
