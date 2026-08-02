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
  /** Optional controlled search box above the board content. Omit to hide it. */
  search?: DoodleBoardSearch
  /** Role-specific visual skin; navigation remains in the global hamburger. */
  variant?: 'default' | 'owner'
  children: ReactNode
}

/**
 * Shared hand-drawn "board" shell with a decorative teal rail. Used by every
 * role dashboard so the customer, barber, and owner homes share one visual
 * language. The rail is purely decorative; real navigation and profile access
 * live in the global header.
 */
export function DoodleBoard({
  search,
  variant = 'default',
  children,
}: DoodleBoardProps) {
  return (
    <div className={`doodle-board-wrap is-${variant}`}>
      <div className="doodle-board">
        <aside className="doodle-rail" aria-hidden="true">
          <div className="doodle-rail-mark">
            <span className="brand-pole" />
            <strong>PB</strong>
          </div>
          {variant === 'owner' && (
            <div className="doodle-owner-rail-stack">
              <span><DoodleIcon name="home" size={21} /></span>
              <span><DoodleIcon name="calendar" size={21} /></span>
              <span><DoodleIcon name="user" size={21} /></span>
              <span><DoodleIcon name="star" size={21} /></span>
              <span><DoodleIcon name="gear" size={21} /></span>
            </div>
          )}
          <DoodleIcon name="scissors" size={28} className="doodle-rail-scissors" />
        </aside>

        <div className="doodle-workspace">
          {search && (
            <div className="doodle-search-row">
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
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  )
}
