import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ConversationDetailed, Message } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useAuth } from '../features/auth/AuthContext'
import { Avatar } from '../components/Avatar'
import { DoodleIcon } from '../theme/DoodleDefs'
import { Loading } from '../components/Loading'
import { relativeTime, timeOfDay } from '../lib/format'
import './ChatPage.css'

export function ChatPage() {
  const backend = useBackend()
  const { profile } = useAuth()
  const { conversationId } = useParams<{ conversationId: string }>()
  const navigate = useNavigate()

  const [conversations, setConversations] = useState<ConversationDetailed[] | null>(null)

  const loadConversations = useCallback(() => {
    backend.chat.listConversations().then(setConversations)
  }, [backend])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  return (
    <div className="chat-layout">
      <aside className={`chat-inbox ${conversationId ? 'has-open' : ''}`}>
        <h2><DoodleIcon name="chat" size={24} /> Messages</h2>
        {conversations === null ? (
          <Loading label="Loading chats…" />
        ) : conversations.length === 0 ? (
          <p className="muted">
            No conversations yet. Open a barber and hit <strong>Message</strong> to start one.
          </p>
        ) : (
          <div className="convo-list">
            {conversations.map((c) => {
              const other = profile?.id === c.customer_id ? c.barber.profile : c.customer
              return (
                <Link
                  key={c.id}
                  to={`/chat/${c.id}`}
                  className={`convo-item ${c.id === conversationId ? 'active' : ''}`}
                >
                  <Avatar name={other.full_name} size={44} />
                  <div className="convo-meta">
                    <div className="spread">
                      <strong>{other.full_name}</strong>
                      {c.unread_count > 0 && <span className="pill pill-pink unread">{c.unread_count}</span>}
                    </div>
                    <span className="muted convo-preview">
                      {c.last_message ? c.last_message.body : 'Say hello 👋'}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </aside>

      <section className={`chat-thread ${conversationId ? 'has-open' : ''}`}>
        {conversationId ? (
          <Thread
            key={conversationId}
            conversationId={conversationId}
            onActivity={loadConversations}
            onBack={() => navigate('/chat')}
          />
        ) : (
          <div className="chat-empty">
            <DoodleIcon name="scissors" size={64} />
            <p className="muted">Pick a conversation to start chatting.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function Thread({
  conversationId,
  onActivity,
  onBack,
}: {
  conversationId: string
  onActivity: () => void
  onBack: () => void
}) {
  const backend = useBackend()
  const { profile } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [convo, setConvo] = useState<ConversationDetailed | null>(null)
  const [draft, setDraft] = useState('')
  const [ready, setReady] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true

    // Resolve the conversation header from the inbox list.
    backend.chat.listConversations().then((list) => {
      if (active) setConvo(list.find((c) => c.id === conversationId) ?? null)
    })

    backend.chat.getMessages(conversationId).then((msgs) => {
      if (!active) return
      setMessages(msgs)
      setReady(true)
      backend.chat.markRead(conversationId).then(onActivity)
    })

    const unsub = backend.chat.subscribe(conversationId, (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      // Mark read if the incoming message is from the other party.
      if (msg.sender_id !== profile?.id) backend.chat.markRead(conversationId).then(onActivity)
      else onActivity()
    })

    return () => {
      active = false
      unsub()
    }
  }, [backend, conversationId, profile?.id, onActivity])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(e: FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setDraft('')
    await backend.chat.sendMessage({ conversation_id: conversationId, body })
    // The new message arrives via the subscription callback.
  }

  const other =
    convo && profile?.id === convo.customer_id ? convo.barber.profile : convo?.customer

  if (!ready) return <Loading label="Opening chat…" />

  return (
    <div className="thread">
      <header className="thread-head">
        <button className="btn btn-ghost btn-sm thread-back" onClick={onBack}>←</button>
        {other && <Avatar name={other.full_name} size={40} />}
        <strong>{other?.full_name ?? 'Conversation'}</strong>
      </header>

      <div className="thread-body">
        {messages.length === 0 && (
          <p className="faint center">No messages yet. Break the ice!</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === profile?.id
          return (
            <div key={m.id} className={`bubble-row ${mine ? 'mine' : 'theirs'}`}>
              <div className="bubble">
                <span>{m.body}</span>
                <time className="bubble-time">{timeOfDay(m.created_at)}</time>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <form className="thread-input" onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          aria-label="Message"
        />
        <button className="btn btn-primary" type="submit" disabled={!draft.trim()}>
          <DoodleIcon name="send" size={20} />
        </button>
      </form>

      <p className="faint chat-foot">
        Last active {convo ? relativeTime(convo.last_message_at) : 'now'} · open this in a second tab
        as the other person to see live delivery.
      </p>
    </div>
  )
}
