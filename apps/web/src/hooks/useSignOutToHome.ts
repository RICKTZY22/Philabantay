import { useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { useCurtain } from '../components/CurtainTransition'

/**
 * Keep Home as the final sign-out destination. The closed curtain establishes
 * an explicit public-route intent before the session is cleared so protected
 * route guards cannot win the sign-out race.
 */
export function useSignOutToHome() {
  const { signOut } = useAuth()
  const { transition } = useCurtain()
  const navigate = useNavigate()

  return () => transition(async () => {
    // Put the intended public destination behind the closed curtain first.
    // Layout recognizes this one route intent so a verification-locked profile
    // cannot bounce Home back to /verification while sign-out is in flight.
    navigate('/', {
      replace: true,
      state: { signingOutToHome: true },
    })

    // ApiBackend clears its local session in `finally`, even when the remote
    // sign-out request fails. Home must still be the final route in that case.
    try {
      await signOut()
    } catch {
      // The browser session is already cleared; do not let a network failure
      // strand the signed-out user on a protected route or its login redirect.
    }
    return null
  })
}
