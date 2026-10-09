import { useState } from 'react'
import { api } from '../api'

/** Login. Contas novas são criadas pelo administrador (Configurações), não há cadastro público. */
export function Auth() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      await api.signIn(email.trim(), pw)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center">
      <form className="card form" style={{ width: '100%', maxWidth: 380 }} onSubmit={submit}>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <img src={`${import.meta.env.BASE_URL}icon.svg`} width={64} height={64} alt="" />
          <div className="title" style={{ justifyContent: 'center', marginTop: 8 }}>Pioneiro-REG</div>
          <div className="sub">Registro e acompanhamento das horas</div>
        </div>
        <label className="field">E-mail<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="field">Senha<input required type="password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></label>
        {err && <div className="error">{err}</div>}
        <button className="btn brand" disabled={busy}>{busy ? 'Aguarde…' : 'Entrar'}</button>
        <div className="sub" style={{ textAlign: 'center' }}>Não tem conta? Peça ao administrador para criar.</div>
      </form>
    </div>
  )
}
