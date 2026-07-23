import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DataError, type ConversationDetailed, type Message, type ShopStaffMember } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useAuth } from '../features/auth/AuthContext'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { Avatar } from '../components/Avatar'
import { DoodleIcon } from '../theme/DoodleDefs'
import { Loading } from '../components/Loading'
import { relativeTime, timeOfDay } from '../lib/format'
import { routeSegment } from '../lib/security'
import './ChatPage.css'

export function ChatPage() {
  const backend = useBackend()
  const { profile } = useAuth()
  const { conversationId } = useParams<{ conversationId: string }>()
  const navigate = useNavigate()
  const nowEpochMs = useCurrentTime()
  // Notebook styling per role: customer = warm cream/yellow, barber = cool
  // green "shop desk", owner = purple "owner desk" — iisang notebook look,
  // magkakaibang kulay para agad makilala ang side mo.
  const isPlainCustomer = profile?.role === 'customer'
    && profile.requested_role !== 'barber'
    && profile.requested_role !== 'shop_owner'
  const isOwner = profile?.role === 'shop_owner'
  const notebookRole = isPlainCustomer
    ? 'customer'
    : profile?.role === 'barber' ? 'barber' : isOwner ? 'owner' : undefined

  const [conversations, setConversations] = useState<ConversationDetailed[] | null>(null)
  const [staff, setStaff] = useState<ShopStaffMember[]>([])
  const [openingStaffChat, setOpeningStaffChat] = useState('')
  const [query, setQuery] = useState('')
  const [loadError, setLoadError] = useState('')

  const loadConversations = useCallback(() => {
    setLoadError('')
    backend.chat.listConversations().then(
      setConversations,
      () => setLoadError('Hindi ma-load ang conversations. Subukan i-refresh ang page.'),
    )
  }, [backend])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Owner lang ang may staff roster sa inbox — dito sila nag-i-start ng
  // internal threads sa mga barbers nila.
  useEffect(() => {
    if (!isOwner) return
    let active = true
    backend.employment.listMyShopStaff()
      .then((members) => { if (active) setStaff(members) })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [backend, isOwner])

  async function startStaffChat(barberId: string) {
    if (openingStaffChat) return
    setOpeningStaffChat(barberId)
    try {
      const convo = await backend.chat.openStaffConversation(barberId)
      loadConversations()
      navigate(`/chat/${routeSegment(convo.id)}`)
    } catch (error) {
      setLoadError(error instanceof DataError ? error.message : 'Hindi mabuksan ang staff chat.')
    } finally {
      setOpeningStaffChat('')
    }
  }

  const selectedConversation = conversationId
    ? conversations?.find((conversation) => conversation.id === conversationId)
    : undefined
  const filteredConversations = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!conversations || !needle) return conversations
    return conversations.filter((conversation) => {
      const { name } = conversationDisplay(conversation, profile?.id)
      return name.toLowerCase().includes(needle)
        || conversation.last_message?.body.toLowerCase().includes(needle)
    })
  }, [conversations, profile?.id, query])

  const handleThreadRead = useCallback((id: string) => {
    setConversations((current) => current?.map((conversation) => (
      conversation.id === id ? { ...conversation, unread_count: 0 } : conversation
    )) ?? null)
  }, [])

  const handleThreadMessage = useCallback((message: Message) => {
    setConversations((current) => {
      if (!current) return current
      return current
        .map((conversation) => conversation.id === message.conversation_id
          ? {
              ...conversation,
              last_message: message,
              last_message_at: message.created_at,
              unread_count: 0,
            }
          : conversation)
        .sort((left, right) => right.last_message_at.localeCompare(left.last_message_at))
    })
  }, [])

  const closeThread = useCallback(() => navigate('/chat'), [navigate])

  return (
    <div className="chat-layout" data-notebook={notebookRole}>
      <aside className={`chat-inbox ${conversationId ? 'has-open' : ''}`}>
        <div className="chat-inbox-head">
          <span className="chat-kicker">SHOP DESK</span>
          <h1><DoodleIcon name="chat" size={25} /> Messages</h1>
          <p>Diretso sa barbershop team ang usapan mo.</p>
        </div>
        <label className="chat-search">
          <DoodleIcon name="search" size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search shops or messages"
            aria-label="Search conversations"
          />
        </label>
        {isOwner && staff.length > 0 && (
          <div className="chat-staff-strip" aria-label="Message a staff member">
            <span className="chat-kicker">MESSAGE YOUR STAFF</span>
            <div>
              {staff.map((member) => (
                <button
                  type="button"
                  key={member.barber.id}
                  disabled={Boolean(openingStaffChat)}
                  onClick={() => void startStaffChat(member.barber.id)}
                >
                  <DoodleIcon name="scissors" size={14} />
                  {openingStaffChat === member.barber.id ? 'Opening…' : firstWord(member.barber.profile.full_name)}
                </button>
              ))}
            </div>
          </div>
        )}
        {loadError ? (
          <p className="form-error" role="alert">{loadError}</p>
        ) : conversations === null ? (
          <Loading label="Loading chats…" />
        ) : conversations.length === 0 ? (
          <p className="muted">
            {isOwner
              ? 'Wala pang conversation. Mag-message ng staff sa taas, o hintayin ang customer inquiries.'
              : 'Wala pang conversation. Pumili ng shop sa map at pindutin ang Chat shop.'}
          </p>
        ) : filteredConversations?.length === 0 ? (
          <p className="muted">Walang chat na tugma sa search mo.</p>
        ) : (
          <div className="convo-list">
            {filteredConversations?.map((conversation) => {
              const { name, staffThread } = conversationDisplay(conversation, profile?.id)
              return (
                <Link
                  key={conversation.id}
                  to={`/chat/${routeSegment(conversation.id)}`}
                  className={`convo-item ${conversation.id === conversationId ? 'active' : ''}`}
                >
                  <Avatar name={name} size={44} />
                  <div className="convo-meta">
                    <div className="spread">
                      <strong>{name}{staffThread && <em className="chat-staff-tag">staff</em>}</strong>
                      <time>{relativeTime(conversation.last_message_at, nowEpochMs)}</time>
                    </div>
                    <div className="spread convo-preview-row">
                      <span className="muted convo-preview">
                        {conversation.last_message ? conversation.last_message.body : 'Start the conversation 👋'}
                      </span>
                      {conversation.unread_count > 0 && <span className="pill pill-pink unread">{conversation.unread_count}</span>}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </aside>

      <section className={`chat-thread ${conversationId ? 'has-open' : ''}`}>
        {conversationId && conversations === null ? (
          <Loading label="Checking conversation…" />
        ) : selectedConversation ? (
          <Thread
            key={selectedConversation.id}
            conversation={selectedConversation}
            onMessage={handleThreadMessage}
            onRead={handleThreadRead}
            onBack={closeThread}
          />
        ) : conversationId ? (
          <div className="chat-empty">
            <DoodleIcon name="chat" size={64} />
            <p className="muted">Conversation not found or you do not have access.</p>
            <button className="btn btn-sm" type="button" onClick={closeThread}>Back to inbox</button>
          </div>
        ) : (
          <div className="chat-empty">
            <DoodleIcon name="scissors" size={64} />
            <strong>Pumili ng shop conversation</strong>
            <p className="muted">Dito mo makakausap ang barbershop tungkol sa schedule, presyo, at cut request.</p>
          </div>
        )}
      </section>
    </div>
  )
}

const Thread = memo(function Thread({
  conversation,
  onMessage,
  onRead,
  onBack,
}: {
  conversation: ConversationDetailed
  onMessage: (message: Message) => void
  onRead: (conversationId: string) => void
  onBack: () => void
}) {
  const backend = useBackend()
  const { profile } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const conversationId = conversation.id

  useEffect(() => {
    let active = true
    backend.chat.getMessages(conversationId).then(
      (loadedMessages) => {
        if (!active) return
        setMessages(loadedMessages)
        setReady(true)
        void backend.chat.markRead(conversationId)
          .then(() => onRead(conversationId))
          .catch(() => undefined)
      },
      () => {
        if (!active) return
        setLoadError('Hindi ma-load ang messages sa conversation na ito.')
        setReady(true)
      },
    )

    const unsubscribe = backend.chat.subscribe(conversationId, (message) => {
      setMessages((current) => current.some((candidate) => candidate.id === message.id)
        ? current
        : [...current, message])
      onMessage(message)
      if (message.sender_id !== profile?.id) {
        void backend.chat.markRead(conversationId)
          .then(() => onRead(conversationId))
          .catch(() => undefined)
      }
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [backend, conversationId, onMessage, onRead, profile?.id])

  useEffect(() => {
    const body = bodyRef.current
    if (body) body.scrollTop = body.scrollHeight
  }, [messages])

  const { name: displayName, context, staffThread } = conversationDisplay(conversation, profile?.id)
  const showShopLink = !staffThread && profile?.id === conversation.customer_id

  if (!ready) return <Loading label="Opening chat…" />

  return (
    <div className="thread">
      <header className="thread-head">
        <button className="btn btn-ghost btn-sm thread-back" type="button" onClick={onBack} aria-label="Back to inbox">←</button>
        <Avatar name={displayName} size={42} />
        <div className="thread-identity">
          <strong>{displayName}</strong>
          <span>{context}</span>
        </div>
        {showShopLink && (
          <Link className="btn btn-sm thread-shop-link" to={`/shops/${routeSegment(conversation.shop.id)}`}>Shop details</Link>
        )}
      </header>

      {loadError
        ? <div className="chat-empty"><p className="form-error" role="alert">{loadError}</p></div>
        : <MessageList bodyRef={bodyRef} messages={messages} profileId={profile?.id} displayName={displayName} />}

      <MessageComposer conversationId={conversationId} disabled={Boolean(loadError)} />
    </div>
  )
})

const MessageList = memo(function MessageList({
  bodyRef,
  messages,
  profileId,
  displayName,
}: {
  bodyRef: RefObject<HTMLDivElement | null>
  messages: Message[]
  profileId?: string
  displayName: string
}) {
  const rows = useMemo(() => messages.map((message, index) => ({
    message,
    mine: message.sender_id === profileId,
    showDay: index > 0
      && new Date(messages[index - 1].created_at).toDateString() !== new Date(message.created_at).toDateString(),
    day: new Date(message.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    time: timeOfDay(message.created_at),
  })), [messages, profileId])

  return (
    <div className="thread-body" ref={bodyRef}>
      <div className="chat-day-divider"><span>Shop conversation</span></div>
      {messages.length === 0 && (
        <div className="chat-welcome-note">
          <DoodleIcon name="chat" size={23} />
          <strong>Kamusta!</strong>
          <span>Magtanong tungkol sa slots, services, presyo, o sabihin ang peg mong gupit.</span>
        </div>
      )}
      {rows.map(({ message, mine, showDay, day, time }) => (
        <Fragment key={message.id}>
          {showDay && <div className="chat-day-divider"><span>{day}</span></div>}
          <div className={`bubble-row ${mine ? 'mine' : 'theirs'}`}>
            {!mine && <Avatar name={displayName} size={30} />}
            <div className="bubble">
              <span>{message.body}</span>
              <time className="bubble-time">{time}</time>
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  )
})

function MessageComposer({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const backend = useBackend()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  async function send(event: FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending || disabled) return
    setSending(true)
    setSendError('')
    setDraft('')
    try {
      await backend.chat.sendMessage({ conversation_id: conversationId, body })
      // The new message arrives through the active thread subscription.
    } catch (error) {
      setDraft((current) => current || body)
      setSendError(error instanceof DataError ? error.message : 'Hindi na-send ang message. Subukan ulit.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="thread-compose">
      <div className="chat-quick-replies" aria-label="Quick replies">
        {['May available slot?', 'Magkano ang haircut?', 'On the way na ako'].map((reply) => (
          <button type="button" key={reply} disabled={disabled} onClick={() => setDraft(reply)}>{reply}</button>
        ))}
      </div>
      <form className="thread-input" onSubmit={send}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message the shop…"
          aria-label="Message"
          maxLength={2_000}
          disabled={disabled}
        />
        <button className="btn btn-primary" type="submit" disabled={!draft.trim() || sending || disabled} aria-label="Send message">
          <DoodleIcon name="send" size={20} />
        </button>
      </form>
      {sendError && <p className="form-error thread-send-error" role="alert">{sendError}</p>}
    </div>
  )
}

/**
 * Sino ang kausap at anong konteksto — staff-thread aware. Ang staff thread
 * ay nakikilala kapag ang "customer" participant ay ang may-ari ng shop.
 */
function conversationDisplay(conversation: ConversationDetailed, viewerId: string | undefined) {
  const staffThread = conversation.is_staff_thread
  if (staffThread) {
    const viewerIsOwner = viewerId === conversation.customer_id
    return {
      name: viewerIsOwner ? conversation.barber.profile.full_name : conversation.customer.full_name,
      context: viewerIsOwner ? `Staff · ${conversation.shop.name}` : `Owner · ${conversation.shop.name}`,
      staffThread,
    }
  }
  const customerView = viewerId === conversation.customer_id
  return {
    name: customerView ? conversation.shop.name : conversation.customer.full_name,
    context: customerView
      ? `${conversation.shop.address}, ${conversation.shop.city}`
      : `Customer · ${conversation.shop.name}`,
    staffThread,
  }
}

function firstWord(name: string) {
  return name.trim().split(/\s+/)[0]
}
