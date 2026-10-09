import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@fontsource-variable/ruda' // fonte Ruda empacotada no app (sem depender do Google Fonts)
import './styles.css'
import { registerSW } from 'virtual:pwa-register'

// Atualização automática: quando houver versão nova publicada, o app recarrega sozinho.
// Também verifica ao voltar para o app (útil no iPhone, onde o app fica "congelado" em segundo plano).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() { void updateSW(true) },
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => { void reg.update().catch(() => {}) }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    setInterval(check, 30 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
