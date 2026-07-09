import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './theme/doodle.css'
import { App } from './App'
import { BackendProvider } from './services/backend'
import { AuthProvider } from './features/auth/AuthContext'

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
