import { useState } from 'react'
import { api } from '../api'

/** Primeiro acesso com senha provisória: obriga a definir uma senha própria antes de usar o app. */
export function ChangePassword({ name, onDone }: { name: string; onDone: () => Promise<void> }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (pw.length < 8) return setErr('Use pelo menos 8 caracteres.')
    if (pw !== pw2) return setErr('As senhas não conferem.')
    setBusy(true)
    try {
      await api.updatePassword(pw)
      const user = await api.getUser()
      if (user) await api.update('profiles', { id: user.id }, { must_change_password: false })
      await onDone()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center">
      <form className="card form" style={{ width: '100%', maxWidth: 380 }} onSubmit={submit}>
        <div className="title" style={{ fontSize: 22 }}>Bem-vindo(a), {name.split(' ')[0]}!</div>
        <div className="info">Sua conta foi criada com uma senha provisória. Defina agora a sua senha pessoal para continuar.</div>
        <label className="field">Nova senha<input type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
        <label className="field">Repita a nova senha<input type="password" required minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></label>
        {err && <div className="error">{err}</div>}
        <button className="btn brand" disabled={busy}>{busy ? 'Salvando…' : 'Definir minha senha'}</button>
        <button type="button" className="btn ghost small" onClick={() => api.signOut()}>Sair</button>
      </form>
    </div>
  )
}
