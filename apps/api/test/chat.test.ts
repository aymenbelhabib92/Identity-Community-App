import type { ServerResponse } from 'node:http';
import type { ChatMessage, ChatMessageList, ChatUnread } from '@identity/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PushMessage, PushTransport } from '../src/services/push';
import { activeMember, adminToken, bearer, createTestApp, register, type TestContext } from './helpers';

let t: TestContext;
let admin: string;
let karim: { token: string; id: string };
let yasmine: { token: string; id: string };
let nour: { token: string; id: string };

/** Push messages handed to the push services, by device endpoint. */
const pushed: { endpoint: string; message: PushMessage }[] = [];
const transport: PushTransport = async (target, payload) => {
  pushed.push({ endpoint: target.endpoint, message: JSON.parse(payload) as PushMessage });
};
const device = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;
const pushesTo = (name: string) => pushed.filter((p) => p.endpoint === device(name)).map((p) => p.message);

const call = (token: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  t.app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload });
const say = async (token: string, body: string, extra: object = {}) => {
  const res = await call(token, 'POST', '/chat/messages', { body, ...extra });
  expect(res.statusCode).toBe(201);
  await t.app.push.flush();
  return res.json<ChatMessage>();
};
const minutes = (n: number) => {
  t.clock.current = new Date(t.clock.current.getTime() + n * 60_000);
};

beforeAll(async () => {
  t = await createTestApp(undefined, { pushTransport: transport });
  admin = await adminToken(t.app);
  karim = await activeMember(t.app, admin, 'Karim Ben Salah');
  yasmine = await activeMember(t.app, admin, 'Yasmine Mansour');
  nour = await activeMember(t.app, admin, 'Nour Riahi');
  for (const [member, name] of [
    [karim, 'karim'],
    [yasmine, 'yasmine'],
    [nour, 'nour'],
  ] as const) {
    await call(member.token, 'PUT', '/push/subscription', {
      endpoint: device(name),
      keys: { p256dh: 'BOr8gQp3UyB2eXmDk7xY0N4bJ1aFVd6Lq9sZtR3wHc0', auth: 'c2VjcmV0LWF1dGg' },
    });
  }
});
afterAll(() => t.close());
beforeEach(() => {
  pushed.length = 0;
  minutes(10); // past any grouping delay of the previous test
});

describe('club chat', () => {
  it('is for members with access only', async () => {
    const { token } = await register(t.app, 'Pending Person');
    expect((await call(token, 'GET', '/chat/messages')).statusCode).toBe(403);
    expect((await call(token, 'POST', '/chat/messages', { body: 'hello' })).statusCode).toBe(403);
  });

  it('keeps messages, oldest first, and pages back through the history', async () => {
    for (let i = 1; i <= 5; i++) {
      await say(karim.token, `message ${i}`);
      minutes(1);
    }
    const latest = (await call(yasmine.token, 'GET', '/chat/messages?limit=3')).json<ChatMessageList>();
    expect(latest.items.map((m) => m.body)).toEqual(['message 3', 'message 4', 'message 5']);
    expect(latest.hasMore).toBe(true);
    expect(latest.items[0]!.author).toMatchObject({ fullName: 'Karim Ben Salah' });

    const older = (
      await call(yasmine.token, 'GET', `/chat/messages?limit=3&before=${encodeURIComponent(latest.items[0]!.createdAt)}`)
    ).json<ChatMessageList>();
    expect(older.items.map((m) => m.body)).toEqual(['message 1', 'message 2']);
    expect(older.hasMore).toBe(false);

    const after = (
      await call(yasmine.token, 'GET', `/chat/messages?after=${encodeURIComponent(latest.items[1]!.createdAt)}`)
    ).json<ChatMessageList>();
    expect(after.items.map((m) => m.body)).toEqual(['message 5']);
  });

  it('rejects empty messages', async () => {
    const res = await call(karim.token, 'POST', '/chat/messages', { body: '   ' });
    expect(res.statusCode).toBe(400);
  });

  it('counts unread messages until the chat is read', async () => {
    await call(nour.token, 'POST', '/chat/read');
    minutes(1);
    await say(karim.token, 'anyone at the lake tonight?');
    await say(yasmine.token, 'yes, from 21:00');
    expect((await call(nour.token, 'GET', '/chat/unread')).json<ChatUnread>().unread).toBe(2);
    // Own messages are never unread.
    expect((await call(yasmine.token, 'GET', '/chat/unread')).json<ChatUnread>().unread).toBe(0);
    await call(nour.token, 'POST', '/chat/read');
    expect((await call(nour.token, 'GET', '/chat/unread')).json<ChatUnread>().unread).toBe(0);
  });

  it('lets authors and admins delete messages, and keeps their place', async () => {
    const message = await say(karim.token, 'wrong channel, sorry');
    expect((await call(yasmine.token, 'DELETE', `/chat/messages/${message.id}`)).statusCode).toBe(403);

    const reply = await say(yasmine.token, 'no problem', { replyToId: message.id });
    expect(reply.replyTo).toMatchObject({ id: message.id, authorName: 'Karim Ben Salah', excerpt: 'wrong channel, sorry' });

    const deleted = (await call(karim.token, 'DELETE', `/chat/messages/${message.id}`)).json<ChatMessage>();
    expect(deleted).toMatchObject({ deleted: true, body: '' });
    const list = (await call(nour.token, 'GET', '/chat/messages?limit=2')).json<ChatMessageList>();
    expect(list.items[1]!.replyTo).toMatchObject({ excerpt: '' });

    const other = await say(nour.token, 'spam');
    expect((await call(admin, 'DELETE', `/chat/messages/${other.id}`)).json<ChatMessage>().deleted).toBe(true);
  });

  it('streams new messages over HTTP until the member leaves', async () => {
    const address = await t.app.listen({ port: 0, host: '127.0.0.1' });
    const leave = new AbortController();
    const response = await fetch(`${address}/api/v1/chat/stream`, { headers: bearer(nour.token), signal: leave.signal });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    expect((await reader.read()).value).toContain('retry:');
    expect(t.app.chat.isWatching(nour.id)).toBe(true);

    await say(karim.token, 'live over the wire');
    let received = '';
    while (!received.includes('live over the wire')) received += (await reader.read()).value ?? '';
    expect(received).toContain('event: message');

    leave.abort();
    await vi.waitFor(() => expect(t.app.chat.isWatching(nour.id)).toBe(false));
  });

  it('refuses replies to messages that do not exist', async () => {
    const res = await call(karim.token, 'POST', '/chat/messages', {
      body: 'hm',
      replyToId: '00000000-0000-4000-8000-000000000000',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('chat notifications', () => {
  it('reach mentioned members only by default, never in the bell', async () => {
    const before = (await call(karim.token, 'GET', '/notifications')).json<{ items: unknown[] }>().items.length;
    await say(yasmine.token, '@Karim Ben Salah are you coming?', { mentions: [karim.id] });
    expect(pushesTo('karim')).toEqual([
      expect.objectContaining({ kind: 'chat', title: 'Yasmine M. mentioned you', body: '@Karim Ben Salah are you coming?', link: '/chat' }),
    ]);
    expect(pushesTo('nour')).toEqual([]);
    expect(pushesTo('yasmine')).toEqual([]);
    expect((await call(karim.token, 'GET', '/notifications')).json<{ items: unknown[] }>().items).toHaveLength(before);
  });

  it('tell members someone replied to them, in their language', async () => {
    await call(karim.token, 'PATCH', '/me', { language: 'fr' });
    const question = await say(karim.token, 'who has a spare OBD cable?');
    await say(nour.token, 'I do', { replyToId: question.id });
    expect(pushesTo('karim')).toEqual([expect.objectContaining({ title: 'Nour R. vous a répondu', body: 'I do' })]);
    await call(karim.token, 'PATCH', '/me', { language: 'en' });
  });

  it('group all messages for those who want them all', async () => {
    await call(nour.token, 'PATCH', '/me', { chatNotifications: 'all' });
    await call(nour.token, 'POST', '/chat/read');
    minutes(1);
    await say(karim.token, 'first');
    await say(yasmine.token, 'second'); // within the grouping delay: nothing more
    expect(pushesTo('nour')).toEqual([
      expect.objectContaining({ title: 'Club chat', body: '1 new message · Karim B.: first', tag: 'chat' }),
    ]);

    minutes(4);
    await say(karim.token, 'third');
    expect(pushesTo('nour')).toHaveLength(2);
    expect(pushesTo('nour')[1]).toMatchObject({ body: '3 new messages · Karim B.: third', tag: 'chat' });
  });

  it('respect members who turned them off, even when mentioned', async () => {
    await call(nour.token, 'PATCH', '/me', { chatNotifications: 'off' });
    await say(karim.token, '@Nour Riahi ping', { mentions: [nour.id] });
    expect(pushesTo('nour')).toEqual([]);
    await call(nour.token, 'PATCH', '/me', { chatNotifications: 'mentions' });
  });

  it('skip members who are reading the chat, who get the message live instead', async () => {
    const written: string[] = [];
    const stream = { write: (chunk: string) => written.push(chunk), end: () => {} } as unknown as ServerResponse;
    t.app.chat.open(karim.id, stream);

    const message = await say(yasmine.token, '@Karim Ben Salah look at this', { mentions: [karim.id] });
    expect(pushesTo('karim')).toEqual([]);
    expect(written.join('')).toContain(`event: message\ndata: ${JSON.stringify(message)}\n\n`);

    await call(yasmine.token, 'DELETE', `/chat/messages/${message.id}`);
    expect(written.at(-1)).toBe(`event: deleted\ndata: ${JSON.stringify({ id: message.id })}\n\n`);
    t.app.chat.close(stream);
  });
});
