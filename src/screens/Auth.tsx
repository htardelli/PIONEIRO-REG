import { useState } from 'react'
import { api } from '../api'

export function Auth() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setInfo(null); setBusy(true)
    try {
      if (mode === 'in') await api.signIn(email.trim(), pw)
      else if ((await api.signUp(email.trim(), pw, name.trim())) === 'confirm')
        setInfo('Cadastro feito! Abra o e-mail de confirmação que enviamos e depois volte para entrar.')
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
        <div className="seg">
          <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Entrar</button>
          <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Criar conta</button>
        </div>
        {mode === 'up' && <label className="field">Nome<input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
        <label className="field">E-mail<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="field">Senha<input required type="password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>
        {err && <div className="error">{err}</div>}
        {info && <div className="info">{info}</div>}
        <button className="btn brand" disabled={busy}>{busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : 'Criar conta'}</button>
      </form>
    </div>
  )
}
