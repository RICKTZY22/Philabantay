import type { ReactNode } from 'react'
import { DoodleIcon } from '../theme/DoodleDefs'
import './DoodleBoard.css'

interface DoodleBoardSearch {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  /** Optional results dropdown na naka-anchor sa ilalim ng search box. */
  panel?: ReactNode
}

interface DoodleBoardProps {
  /** Shown in the top-bar profile chip (with derived initials). */
  userName: string
  /** Center label beside the live dot, e.g. the shop name. */
  centerLabel: string
  liveTone?: 'green' | 'yellow' | 'red'
  /** Optional controlled search box in the top bar. Omit to hide it. */
  search?: DoodleBoardSearch
  /** Itago ang name chip (customer board: nasa avatar section na ang identity). */
  showUserChip?: boolean
  children: ReactNode
}

/**
 * Shared hand-drawn "board" shell: a decorative teal rail plus a top bar
 * (search / live label / profile chip). Used by every role dashboard so the
 * customer, barber, and owner homes share one visual language. The rail is
 * purely decorative now — real navigation lives in the global hamburger menu.
 */
export function DoodleBoard({ userName, centerLabel, liveTone = 'green', search, showUserChip = true, children }: DoodleBoardProps) {
  return (
    <div className="doodle-board-wrap">
      <div className="doodle-board">
        <aside className="doodle-rail" aria-hidden="true">
          <div className="doodle-rail-mark">
            <span className="brand-pole" />
            <strong>PB</strong>
          </div>
          <DoodleIcon name="scissors" size={28} className="doodle-rail-scissors" />
        </aside>

        <div className="doodle-workspace">
          <header className="doodle-topbar">
            {search ? (
              <div className="doodle-search-slot">
                <label className="doodle-search">
                  <DoodleIcon name="search" size={17} />
                  <input
                    aria-label={search.ariaLabel ?? 'Search'}
                    placeholder={search.placeholder ?? 'Search...'}
                    value={search.value}
                    onChange={(event) => search.onChange(event.target.value)}
                  />
                </label>
                {search.panel}
              </div>
            ) : (
              <span className="doodle-topbar-spacer" aria-hidden="true" />
            )}
            <div className="doodle-live">
              <span className={`doodle-live-dot is-${liveTone}`} />
              <span>{centerLabel}</span>
            </div>
            {showUserChip ? (
              <div className="doodle-chip">
                <span>{initials(userName)}</span>
                <strong>{userName}</strong>
              </div>
            ) : (
              <span className="doodle-topbar-spacer" aria-hidden="true" />
            )}
          </header>

          {children}
        </div>
      </div>
    </div>
  )
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'PB'
}
