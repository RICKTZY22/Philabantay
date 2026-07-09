import { Link } from 'react-router-dom'
import { DoodleIcon } from '../theme/DoodleDefs'

export function NotFoundPage() {
  return (
    <div className="center stack" style={{ paddingBlock: 48 }}>
      <DoodleIcon name="scissors" size={72} className="center" />
      <h1>Snip. This page got cut.</h1>
      <p className="muted">We couldn't find what you were after.</p>
      <Link to="/" className="btn btn-primary">Back home</Link>
    </div>
  )
}
