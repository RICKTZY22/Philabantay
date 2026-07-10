import { Component, type ErrorInfo, type ReactNode } from 'react'

interface RouteErrorBoundaryProps {
  children: ReactNode
}

interface RouteErrorBoundaryState {
  error: Error | null
}

/**
 * Safety net ito para sa lazy pages. Kapag pumalya ang chunk download (madalas
 * dahil may bagong deploy habang bukas pa ang lumang tab), imbes na blank page
 * ay bibigyan natin ang user ng malinaw na reload button.
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Sa production, dito rin puwedeng ikabit ang Sentry o ibang error logger.
    console.error('[route] Hindi na-load ang page chunk.', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="screen-loading" role="alert">
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>Hindi nag-load ang page.</h2>
          <p className="faint">Baka may bagong version ng app. Isang reload lang, okay na ulit.</p>
          <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    )
  }
}
