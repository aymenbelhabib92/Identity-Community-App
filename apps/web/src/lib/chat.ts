import type { ChatMessage, ChatMessageList, ChatUnread } from '@identity/shared';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { keys } from './queries';

/**
 * The club chat on the web: the messages are kept in the query cache
 * (keys.chatMessages, oldest first) and kept up to date by a live stream
 * (Server-Sent Events, GET /chat/stream) while the Chat screen is visible.
 * While the stream is open the server sends this member no push notification
 * for the chat, so it is closed as soon as the app goes to the background.
 */

export const CHAT_PAGE_SIZE = 50;

const byDate = (a: ChatMessage, b: ChatMessage) => a.createdAt.localeCompare(b.createdAt);

/** `current` with `incoming` added or replaced, oldest first. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(byDate);
}

/**
 * The latest page from the server, joined to the older messages already
 * loaded. When more messages were missed than one page holds, the conversation
 * starts again from the latest page.
 */
export function withLatestPage(current: ChatMessageList | undefined, latest: ChatMessageList): ChatMessageList {
  const first = latest.items[0];
  const newestKnown = current?.items.at(-1);
  if (!current || !first || !newestKnown) return latest;
  if (latest.hasMore && first.createdAt > newestKnown.createdAt) return latest;
  const older = current.items.filter((message) => message.createdAt < first.createdAt);
  return { items: [...older, ...latest.items], hasMore: older.length > 0 ? current.hasMore : latest.hasMore };
}

function markDeleted(room: ChatMessageList, id: string): ChatMessageList {
  return {
    ...room,
    items: room.items.map((message) => {
      if (message.id === id) return { ...message, body: '', mentions: [], deleted: true };
      if (message.replyTo?.id === id) return { ...message, replyTo: { ...message.replyTo, excerpt: '' } };
      return message;
    }),
  };
}

export const addMessage = (queryClient: QueryClient, message: ChatMessage) =>
  queryClient.setQueryData<ChatMessageList>(keys.chatMessages, (room) => room && { ...room, items: mergeMessages(room.items, [message]) });

export const removeMessage = (queryClient: QueryClient, id: string) =>
  queryClient.setQueryData<ChatMessageList>(keys.chatMessages, (room) => room && markDeleted(room, id));

/** The conversation: the latest page, then older pages as the member scrolls back. */
export function useChatMessages(enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: keys.chatMessages,
    queryFn: async () =>
      withLatestPage(
        queryClient.getQueryData<ChatMessageList>(keys.chatMessages),
        await api.chat.messages({ limit: CHAT_PAGE_SIZE }),
      ),
    enabled,
    // The live stream keeps it up to date (and reloads it when it reconnects).
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
}

export async function loadOlderMessages(queryClient: QueryClient): Promise<void> {
  const room = queryClient.getQueryData<ChatMessageList>(keys.chatMessages);
  const oldest = room?.items[0];
  if (!room || !oldest || !room.hasMore) return;
  const page = await api.chat.messages({ before: oldest.createdAt, limit: CHAT_PAGE_SIZE });
  queryClient.setQueryData<ChatMessageList>(
    keys.chatMessages,
    (current) => current && { items: mergeMessages(current.items, page.items), hasMore: page.hasMore },
  );
}

/** Number of unread messages, for the Chat tab badge. */
export function useChatUnread(enabled: boolean): number {
  const { data } = useQuery({
    queryKey: keys.chatUnread,
    queryFn: api.chat.unread,
    enabled,
    refetchInterval: 60_000,
  });
  return enabled ? (data?.unread ?? 0) : 0;
}

export function markChatRead(queryClient: QueryClient): void {
  queryClient.setQueryData<ChatUnread>(keys.chatUnread, { unread: 0 });
  void api.chat.read().catch(() => {});
}

/** Splits a Server-Sent Events stream into its events. */
async function readEvents(
  response: Response,
  onEvent: (event: string, data: string) => void,
  onActivity: () => void,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    onActivity();
    buffer += value.replace(/\r\n/g, '\n');
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length > 0) onEvent(event, data.join('\n'));
    }
  }
}

/** The server writes a heartbeat every 25 s: a silent connection is a dead one. */
const SILENCE_LIMIT_MS = 70_000;

/**
 * Receives new and deleted messages live while `enabled` and the app is in the
 * foreground; reconnects (and reloads what was missed) after a lost connection.
 * Returns whether the stream is connected.
 */
export function useLiveChat(enabled: boolean, onMessage?: (message: ChatMessage) => void): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let attempt = 0;
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let delay = 2_000;

    const connect = async () => {
      clearTimeout(retryTimer);
      if (stopped || document.hidden) return;
      const current = ++attempt;
      const abort = new AbortController();
      controller = abort;
      let silence: ReturnType<typeof setTimeout> | undefined;
      const alive = () => {
        clearTimeout(silence);
        silence = setTimeout(() => abort.abort(), SILENCE_LIMIT_MS);
      };
      try {
        const response = await api.chat.stream(abort.signal);
        setConnected(true);
        delay = 2_000;
        alive();
        // Messages sent while the stream was closed.
        void queryClient.refetchQueries({ queryKey: keys.chatMessages });
        await readEvents(
          response,
          (event, data) => {
            if (event === 'message') {
              const message = JSON.parse(data) as ChatMessage;
              addMessage(queryClient, message);
              onMessageRef.current?.(message);
            } else if (event === 'deleted') {
              removeMessage(queryClient, (JSON.parse(data) as { id: string }).id);
            }
          },
          alive,
        );
      } catch {
        // Lost connection, server restart, or closed on purpose: see below.
      } finally {
        clearTimeout(silence);
      }
      if (current !== attempt) return;
      setConnected(false);
      if (!stopped && !document.hidden) {
        retryTimer = setTimeout(() => void connect(), delay);
        delay = Math.min(delay * 2, 30_000);
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        attempt++;
        clearTimeout(retryTimer);
        controller?.abort();
        setConnected(false);
      } else {
        delay = 2_000;
        void connect();
      }
    };

    void connect();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      attempt++;
      clearTimeout(retryTimer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      setConnected(false);
    };
  }, [enabled, queryClient]);

  return connected;
}

/** Mention suggestions while typing "@…": the members who can read the chat. */
export const useChatMembers = (enabled: boolean) =>
  useQuery({ queryKey: keys.chatMembers, queryFn: api.chat.members, enabled, staleTime: 5 * 60_000 });

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** "@kar" just before the caret: the text being typed after "@", or null. */
export function mentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const match = /(^|\s)@([^\s@]{0,30})$/u.exec(text.slice(0, caret));
  if (!match) return null;
  return { query: match[2]!, start: caret - match[2]!.length - 1 };
}

export function matchMembers<T extends { fullName: string }>(members: T[], query: string, limit = 5): T[] {
  const wanted = fold(query);
  return members
    .filter((member) => {
      const name = fold(member.fullName);
      return name.startsWith(wanted) || name.includes(` ${wanted}`);
    })
    .slice(0, limit);
}
