import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './theme/doodle.css'
import { App } from './App'
import { BackendProvider } from './services/backend'
import { AuthProvider } from './features/auth/AuthContext'

// IMPORTANT - PROVIDER ORDER ITO, HUWAG BASTA BALIGTARIN:
// AuthProvider gumagamit ng backend, kaya BackendProvider dapat nasa labas.
// Routed UI at curtain gumagamit ng router hooks, kaya BrowserRouter ang
// direktang balot sa App. StrictMode ang pang-check ng unsafe effects sa dev.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BackendProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </BackendProvider>
  </StrictMode>,
)
