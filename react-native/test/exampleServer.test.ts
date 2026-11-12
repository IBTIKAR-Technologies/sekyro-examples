import { createExampleServer, isTerminal, parseCreatedSession, parseSessionView } from '../src/exampleServer';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('exampleServer', () => {
  it('parses a created session', () => {
    expect(parseCreatedSession({ sessionId: 's1', clientToken: 't1', expiresAt: '2030-01-01T00:00:00Z' })).toEqual({
      sessionId: 's1',
      clientToken: 't1',
      expiresAt: '2030-01-01T00:00:00Z',
    });
  });

  it('refuses a created session without a client token', () => {
    expect(() => parseCreatedSession({ sessionId: 's1', expiresAt: 'x' })).toThrow('clientToken');
  });

  it('keeps the verdict fields and drops the rest', () => {
    const view = parseSessionView({ sessionId: 's1', status: 'not_verified', reason: 'rejected', closedBy: 'system', extra: 1 });
    expect(view).toEqual({ sessionId: 's1', status: 'not_verified', reason: 'rejected', closedBy: 'system', personId: undefined });
    expect(isTerminal(view)).toBe(true);
    expect(isTerminal(parseSessionView({ sessionId: 's1', status: 'in_progress' }))).toBe(false);
  });

  it('posts the locale to /sessions', async () => {
    const { impl, calls } = fakeFetch(200, { sessionId: 's1', clientToken: 't1', expiresAt: 'x' });
    await createExampleServer('http://server.test/', impl).createSession('fr');
    expect(calls[0].url).toBe('http://server.test/sessions');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ userId: 'demo-user-1', locale: 'fr', attemptId: expect.any(String) });
  });

  it('fails on an error status', async () => {
    const { impl } = fakeFetch(403, { error: 'forbidden' });
    await expect(createExampleServer('http://server.test', impl).getSession('s1')).rejects.toThrow('403');
  });
});
