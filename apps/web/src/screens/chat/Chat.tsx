import {
  addDays,
  CHAT_MESSAGE_MAX_LENGTH,
  formatDayDate,
  formatTime,
  t,
  toIsoDate,
  zonedParts,
  type ChatMessage,
  type ChatMessageList,
  type MemberRef,
  type User,
} from '@identity/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, Ban, Copy, Lock, MessagesSquare, Reply, Trash2, X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Avatar,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  IconTile,
  LargeTitle,
  List,
  ListRow,
  Loading,
  Screen,
  Sheet,
  Spinner,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useCan, useUser } from '../../lib/auth';
import {
  addMessage,
  loadOlderMessages,
  markChatRead,
  matchMembers,
  mentionQuery,
  removeMessage,
  useChatMembers,
  useChatMessages,
  useLiveChat,
} from '../../lib/chat';
import { cx } from '../../lib/cx';
import { errorMessage } from '../../lib/errors';
import s from './chat.module.css';

/** The club chat: one public room for the members with access. */
export default function Chat() {
  const user = useUser();
  return user.hasAccess ? <ChatRoom user={user} /> : <LockedChat />;
}

function LockedChat() {
  return (
    <Screen>
      <LargeTitle>{t('Chat')}</LargeTitle>
      <Card padded>
        <div className={s.lockedHead}>
          <IconTile color="gray" large>
            <Lock />
          </IconTile>
          <div>
            <p className={s.lockedTitle}>{t('Club chat')}</p>
            <p className={s.lockedSub}>{t('Opens once your membership is active')}</p>
          </div>
        </div>
        <p className={s.lockedText}>{t('Active members talk here: meetups, help with a car, photos and club news.')}</p>
        <ButtonLink to="/pass" size="small">
          {t('View my membership')}
        </ButtonLink>
      </Card>
    </Screen>
  );
}

// ─── The room ────────────────────────────────────────────────────────────────

/** A message on its way to the server, shown faded until it is saved. */
interface PendingMessage {
  key: number;
  body: string;
  replyTo: ChatMessage['replyTo'];
}

export interface Draft {
  text: string;
  /** Members picked from the @ suggestions, by id. */
  mentions: Record<string, string>;
}

const EMPTY_DRAFT: Draft = { text: '', mentions: {} };
let nextPendingKey = 0;

const scroller = () => document.scrollingElement ?? document.documentElement;
const isNearBottom = () => window.innerHeight + window.scrollY >= scroller().scrollHeight - 160;
const scrollToBottom = () => window.scrollTo({ top: scroller().scrollHeight });

function ChatRoom({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canModerate = useCan('chat:moderate');
  const room = useChatMessages(true);
  const members = useChatMembers(true);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [composerHeight, setComposerHeight] = useState(64);
  const keyboard = useKeyboardInset();

  // ── Read state: the Chat tab badge clears while the member is here.
  const readTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const readSoon = useCallback(() => {
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => markChatRead(queryClient), 1_500);
  }, [queryClient]);
  useEffect(() => {
    markChatRead(queryClient);
    const onVisible = () => {
      if (!document.hidden) markChatRead(queryClient);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(readTimer.current);
      markChatRead(queryClient);
    };
  }, [queryClient]);

  const connected = useLiveChat(true, (message) => {
    if (message.author.id === user.id) {
      // Our own message, back through the stream before the reply to the request.
      setPending((list) => {
        const index = list.findIndex((item) => item.body === message.body);
        return index < 0 ? list : list.filter((_, i) => i !== index);
      });
    } else if (!document.hidden) {
      readSoon();
    }
  });
  const offline = useDelayed(!connected, 5_000);

  // ── Scrolling: start at the latest message, follow new ones while at the bottom.
  const atBottom = useRef(true);
  const startedAtBottom = useRef(false);
  const olderAnchor = useRef<number | null>(null);
  useEffect(() => {
    const onScroll = () => {
      atBottom.current = isNearBottom();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const items = room.data?.items;
  const firstId = items?.[0]?.id;
  const lastId = items?.at(-1)?.id;
  useLayoutEffect(() => {
    if (!items) return;
    if (olderAnchor.current !== null) {
      // Older messages were added above: keep the ones on screen in place.
      window.scrollTo({ top: window.scrollY + scroller().scrollHeight - olderAnchor.current });
      olderAnchor.current = null;
      return;
    }
    if (!startedAtBottom.current || atBottom.current) {
      startedAtBottom.current = true;
      scrollToBottom();
      atBottom.current = true;
    }
  }, [items, firstId, lastId, pending.length, composerHeight, keyboard]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !startedAtBottom.current) return;
    setLoadingOlder(true);
    olderAnchor.current = scroller().scrollHeight;
    try {
      await loadOlderMessages(queryClient);
    } catch (error) {
      olderAnchor.current = null;
      toast(errorMessage(error), 'error');
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, queryClient, toast]);

  // ── Sending, with the message shown at once.
  const send = () => {
    const body = draft.text.trim();
    if (!body) return;
    const mentions = Object.entries(draft.mentions)
      .filter(([, name]) => body.includes(`@${name}`))
      .map(([id]) => id);
    const item: PendingMessage = { key: nextPendingKey++, body, replyTo: replyTo && replyRef(replyTo) };
    const previous = { draft, replyTo };
    setPending((list) => [...list, item]);
    setDraft(EMPTY_DRAFT);
    setReplyTo(null);
    atBottom.current = true;
    api.chat
      .send({ body, replyToId: replyTo?.id, mentions: mentions.length > 0 ? mentions : undefined })
      .then(
        (message) => addMessage(queryClient, message),
        (error: unknown) => {
          // Back in the composer, to try again.
          setDraft((current) => (current.text ? current : previous.draft));
          setReplyTo((current) => current ?? previous.replyTo);
          toast(errorMessage(error), 'error');
        },
      )
      .finally(() => setPending((list) => list.filter((other) => other.key !== item.key)));
  };

  const remove = (message: ChatMessage) => {
    api.chat.remove(message.id).then(
      () => {
        removeMessage(queryClient, message.id);
        toast(t('Message deleted'), 'success');
      },
      (error: unknown) => toast(errorMessage(error), 'error'),
    );
  };

  const copy = (message: ChatMessage) => {
    navigator.clipboard?.writeText(message.body).then(
      () => toast(t('Copied'), 'success'),
      () => toast(t('Could not copy the message.'), 'error'),
    );
  };

  const showOriginal = (id: string) => {
    const element = document.getElementById(`message-${id}`);
    if (!element) return;
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    element.classList.remove(s.flash!);
    void element.offsetWidth;
    element.classList.add(s.flash!);
  };

  const names = useMemo(() => {
    const map = new Map<string, string>([[user.id, user.fullName]]);
    for (const member of members.data?.items ?? []) map.set(member.id, member.fullName);
    return map;
  }, [members.data, user.id, user.fullName]);

  const canDelete = (message: ChatMessage) => message.author.id === user.id || canModerate;

  return (
    <Screen className={s.screen}>
      <LargeTitle accessory={offline ? <span className={s.offline}>{t('Connecting…')}</span> : undefined}>{t('Chat')}</LargeTitle>

      {room.isPending ? (
        <Loading />
      ) : room.error && !room.data ? (
        <ErrorState error={room.error} onRetry={() => void room.refetch()} />
      ) : (
        <Messages
          room={room.data!}
          pending={pending}
          me={user}
          names={names}
          loadingOlder={loadingOlder}
          onLoadOlder={() => void loadOlder()}
          onSelect={setSelected}
          onShowOriginal={showOriginal}
        />
      )}
      <div style={{ height: composerHeight + Math.max(0, keyboard - 58) }} aria-hidden />

      <Composer
        draft={draft}
        onDraft={setDraft}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={send}
        members={(members.data?.items ?? []).filter((member) => member.id !== user.id)}
        keyboard={keyboard}
        onHeight={setComposerHeight}
      />

      <Sheet open={selected !== null} onClose={() => setSelected(null)}>
        {selected && (
          <List>
            <ListRow
              icon={<Reply />}
              title={t('Reply')}
              onClick={() => {
                setReplyTo(selected);
                setSelected(null);
              }}
            />
            <ListRow
              icon={<Copy />}
              title={t('Copy')}
              onClick={() => {
                copy(selected);
                setSelected(null);
              }}
            />
            {canDelete(selected) && (
              <ListRow
                icon={<Trash2 />}
                title={t('Delete')}
                destructive
                onClick={() => {
                  remove(selected);
                  setSelected(null);
                }}
              />
            )}
          </List>
        )}
      </Sheet>
    </Screen>
  );
}

const replyRef = (message: ChatMessage): NonNullable<ChatMessage['replyTo']> => ({
  id: message.id,
  authorName: message.author.fullName,
  excerpt: message.body.replace(/\s+/g, ' ').slice(0, 90),
});

// ─── Messages ────────────────────────────────────────────────────────────────

/** Consecutive messages of one author within this delay form a group (one name, one avatar). */
const GROUP_MS = 5 * 60_000;

const dayOf = (timestamp: string) => {
  const p = zonedParts(new Date(timestamp));
  return toIsoDate(p.y, p.m, p.d);
};

function dayLabel(timestamp: string): string {
  const day = dayOf(timestamp);
  const today = dayOf(new Date().toISOString());
  if (day === today) return t('Today');
  if (day === addDays(today, -1)) return t('Yesterday');
  return formatDayDate(timestamp);
}

function Messages({
  room,
  pending,
  me,
  names,
  loadingOlder,
  onLoadOlder,
  onSelect,
  onShowOriginal,
}: {
  room: ChatMessageList;
  pending: PendingMessage[];
  me: User;
  names: Map<string, string>;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onSelect: (message: ChatMessage) => void;
  onShowOriginal: (id: string) => void;
}) {
  // Scrolling up to the top loads older messages.
  const top = useRef<HTMLDivElement>(null);
  const loadRef = useRef(onLoadOlder);
  loadRef.current = onLoadOlder;
  useEffect(() => {
    const element = top.current;
    if (!element || !room.hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadRef.current();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [room.hasMore]);

  if (room.items.length === 0 && pending.length === 0) {
    return (
      <Card>
        <EmptyState icon={<MessagesSquare />} title={t('No messages yet')}>
          {t('Say hello to the club! Every active member can read and write here.')}
        </EmptyState>
      </Card>
    );
  }

  const now = new Date().toISOString();
  return (
    <div className={s.list}>
      {room.hasMore && (
        <div ref={top} className={s.older}>
          {loadingOlder ? (
            <Spinner />
          ) : (
            <button type="button" className={s.olderButton} onClick={onLoadOlder}>
              {t('Load earlier messages')}
            </button>
          )}
        </div>
      )}

      {room.items.map((message, index) => {
        const previous = room.items[index - 1];
        const next = room.items[index + 1];
        const newDay = !previous || dayOf(previous.createdAt) !== dayOf(message.createdAt);
        const groupedWithPrevious =
          !newDay && previous?.author.id === message.author.id && Date.parse(message.createdAt) - Date.parse(previous.createdAt) < GROUP_MS;
        const groupedWithNext =
          next !== undefined &&
          next.author.id === message.author.id &&
          dayOf(next.createdAt) === dayOf(message.createdAt) &&
          Date.parse(next.createdAt) - Date.parse(message.createdAt) < GROUP_MS;
        return (
          <Fragment key={message.id}>
            {newDay && <p className={s.day}>{dayLabel(message.createdAt)}</p>}
            <MessageRow
              message={message}
              mine={message.author.id === me.id}
              first={!groupedWithPrevious}
              last={!groupedWithNext}
              me={me}
              names={names}
              onSelect={onSelect}
              onShowOriginal={onShowOriginal}
            />
          </Fragment>
        );
      })}

      {pending.map((item, index) => (
        <div key={item.key} className={cx(s.row, s.mine, index === 0 && s.groupStart, s.pending)}>
          <div className={s.bubble}>
            {item.replyTo && <Quote replyTo={item.replyTo} />}
            <MessageText body={item.body} mentioned={[]} me={me} />
            <span className={s.time}>{formatTime(now)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageRow({
  message,
  mine,
  first,
  last,
  me,
  names,
  onSelect,
  onShowOriginal,
}: {
  message: ChatMessage;
  mine: boolean;
  first: boolean;
  last: boolean;
  me: User;
  names: Map<string, string>;
  onSelect: (message: ChatMessage) => void;
  onShowOriginal: (id: string) => void;
}) {
  const { author } = message;
  const mentioned = message.mentions.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
  const mentionsMe = message.mentions.includes(me.id);

  return (
    <div id={`message-${message.id}`} className={cx(s.row, mine && s.mine, first && s.groupStart)}>
      {!mine && (
        <div className={s.avatarSlot}>
          {last && <Avatar name={author.fullName} photo={author.avatar} size={30} online={author.online} />}
        </div>
      )}
      <div className={s.column}>
        {!mine && first && <p className={s.author}>{author.fullName}</p>}
        {message.deleted ? (
          <div className={cx(s.bubble, s.deleted)}>
            <Ban aria-hidden />
            {t('This message was deleted')}
          </div>
        ) : (
          <div
            className={cx(s.bubble, mentionsMe && !mine && s.mentionsMe)}
            role="button"
            tabIndex={0}
            aria-haspopup="dialog"
            onClick={() => onSelect(message)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSelect(message);
            }}
          >
            {message.replyTo && <Quote replyTo={message.replyTo} onShow={() => onShowOriginal(message.replyTo!.id)} />}
            <MessageText body={message.body} mentioned={mentioned} me={me} />
            <span className={s.time}>{formatTime(message.createdAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Quote({ replyTo, onShow }: { replyTo: NonNullable<ChatMessage['replyTo']>; onShow?: () => void }) {
  const content = (
    <>
      <span className={s.quoteAuthor}>{replyTo.authorName}</span>
      <span className={s.quoteText}>{replyTo.excerpt || t('Deleted message')}</span>
    </>
  );
  return onShow ? (
    <button
      type="button"
      className={s.quote}
      onClick={(event) => {
        event.stopPropagation();
        onShow();
      }}
    >
      {content}
    </button>
  ) : (
    <span className={s.quote}>{content}</span>
  );
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const URL_PATTERN = String.raw`https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]`;

/** The text of a message, with @mentions highlighted and web addresses as links. */
function MessageText({ body, mentioned, me }: { body: string; mentioned: string[]; me: User }) {
  const names = mentioned.length > 0 ? `|@(?:${mentioned.map(escapeRegExp).join('|')})` : '';
  const pattern = new RegExp(`(${URL_PATTERN})${names ? `|(${names.slice(1)})` : ''}`, 'gu');
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    const index = match.index;
    if (index > last) parts.push(body.slice(last, index));
    const [text, url] = match;
    parts.push(
      url ? (
        <a key={index} href={url} target="_blank" rel="noopener noreferrer" className={s.link} onClick={(event) => event.stopPropagation()}>
          {url}
        </a>
      ) : (
        <span key={index} className={cx(s.mention, text === `@${me.fullName}` && s.mentionMe)}>
          {text}
        </span>
      ),
    );
    last = index + text.length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return <span className={s.text}>{parts}</span>;
}

// ─── Composer ────────────────────────────────────────────────────────────────

const coarsePointer = () => window.matchMedia('(pointer: coarse)').matches;

function Composer({
  draft,
  onDraft,
  replyTo,
  onCancelReply,
  onSend,
  members,
  keyboard,
  onHeight,
}: {
  draft: Draft;
  onDraft: (draft: Draft) => void;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  onSend: () => void;
  members: MemberRef[];
  keyboard: number;
  onHeight: (height: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);

  // The space the composer takes, for the messages to scroll above it.
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const observer = new ResizeObserver(() => onHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeight]);

  // Grows with the text, up to a few lines.
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  }, [draft.text]);

  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  const mention = mentionQuery(draft.text, caret);
  const suggestions = mention ? matchMembers(members, mention.query) : [];

  const pick = (member: MemberRef) => {
    if (!mention) return;
    const inserted = `@${member.fullName} `;
    const text = draft.text.slice(0, mention.start) + inserted + draft.text.slice(caret);
    const position = mention.start + inserted.length;
    onDraft({ text, mentions: { ...draft.mentions, [member.id]: member.fullName } });
    setCaret(position);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(position, position);
    });
  };

  const trackCaret = () => setCaret(input.current?.selectionStart ?? 0);
  const canSend = draft.text.trim().length > 0;

  return (
    <div
      ref={bar}
      className={s.composer}
      style={keyboard > 0 ? { bottom: keyboard, paddingBottom: 8 } : undefined}
    >
      {suggestions.length > 0 && (
        <div className={s.suggestions} role="listbox" aria-label={t('Mention a member')}>
          {suggestions.map((member) => (
            <button
              key={member.id}
              type="button"
              role="option"
              aria-selected={false}
              className={s.suggestion}
              // Keeps the keyboard open.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(member)}
            >
              <Avatar name={member.fullName} photo={member.avatar} size={28} online={member.online} />
              <span>{member.fullName}</span>
            </button>
          ))}
        </div>
      )}

      {replyTo && (
        <div className={s.replyBar}>
          <Reply aria-hidden className={s.replyIcon} />
          <div className={s.replyBody}>
            <p className={s.replyTitle}>{t('Replying to {name}', { name: replyTo.author.fullName })}</p>
            <p className={s.replyText}>{replyTo.body}</p>
          </div>
          <button type="button" className={s.replyClose} onClick={onCancelReply} aria-label={t('Cancel the reply')}>
            <X aria-hidden strokeWidth={2.6} />
          </button>
        </div>
      )}

      <form
        className={s.composerRow}
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <textarea
          ref={input}
          className={s.input}
          rows={1}
          value={draft.text}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          placeholder={t('Write a message')}
          aria-label={t('Write a message')}
          enterKeyHint="send"
          onChange={(event) => {
            onDraft({ ...draft, text: event.target.value });
            setCaret(event.target.selectionStart);
          }}
          onSelect={trackCaret}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && replyTo) onCancelReply();
            if (event.key === 'Enter' && suggestions.length > 0 && !event.shiftKey) {
              event.preventDefault();
              pick(suggestions[0]!);
              return;
            }
            // Enter sends on a computer; on a phone it starts a new line.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !coarsePointer()) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <button
          type="submit"
          className={s.send}
          disabled={!canSend}
          aria-label={t('Send')}
          // Keeps the keyboard open after sending.
          onMouseDown={(event) => event.preventDefault()}
        >
          <ArrowUp aria-hidden strokeWidth={2.6} />
        </button>
      </form>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Height of the on-screen keyboard (or anything else covering the bottom of the
 * layout viewport), from the Visual Viewport API. 0 when there is none.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(covered > 80 ? Math.round(covered) : 0);
    };
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

/** `value`, but `true` only once it has stayed true for `delay` ms. */
function useDelayed(value: boolean, delay: number): boolean {
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    if (!value) {
      setDelayed(false);
      return;
    }
    const timer = setTimeout(() => setDelayed(true), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return delayed;
}
