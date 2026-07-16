import { useState, type FormEvent } from 'react'
import { DataError, type BugCategory } from '@barbershop/shared'
import { useBackend } from '../../services/backend'
import { DoodleIcon } from '../../theme/DoodleDefs'
import { SettingsActionRow, SettingsHeading } from './AccountSettingsPanel'

export function BugReportSettingsPanel() {
  const backend = useBackend()
  const [category, setCategory] = useState<BugCategory>('visual')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (sending) return
    setSending(true)
    setMessage(null)
    try {
      const report = await backend.support.reportBug({ category, summary, description, page_url: pageUrl })
      setSummary('')
      setDescription('')
      setPageUrl('')
      setMessage({ kind: 'ok', text: `Report sent. Reference: ${report.id}` })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof DataError ? error.message : 'Hindi maipadala ang bug report.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <SettingsHeading eyebrow="SUPPORT" title="Report a bug" description="Tell us what happened so the issue can be reproduced and fixed." />
      <form className="settings-panel-card settings-bug-form" onSubmit={submit}>
        <div className="settings-report-note"><DoodleIcon name="scissors" size={25} /><span><strong>Good reports are specific</strong><small>Include what you clicked, what you expected, and what happened instead.</small></span></div>
        <div className="settings-form-grid">
          <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value as BugCategory)}><option value="visual">Visual or layout</option><option value="booking">Booking</option><option value="map">Map or location</option><option value="chat">Chat</option><option value="account">Account or settings</option><option value="other">Other</option></select></label>
          <label><span>Affected page</span><input value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} maxLength={500} placeholder="Example: /dashboard or /appointments" /></label>
          <label className="is-wide"><span>Short summary</span><input value={summary} onChange={(event) => setSummary(event.target.value)} minLength={5} maxLength={120} placeholder="The booking card overlaps the menu" required /><small>{summary.length}/120</small></label>
          <label className="is-wide"><span>What happened?</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={10} maxLength={2000} rows={7} placeholder="Steps to reproduce and what you expected to see…" required /><small>{description.length}/2000</small></label>
        </div>
        <SettingsActionRow message={message}><button type="submit" className="settings-primary-button" disabled={sending || summary.trim().length < 5 || description.trim().length < 10}>{sending ? 'Sending…' : 'Send report'}</button></SettingsActionRow>
      </form>
    </>
  )
}
