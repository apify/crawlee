# Remote Browser Service Examples

Examples for connecting Crawlee crawlers to remote browser services using `RemoteBrowserProvider`.

## How to run

```bash
# from repo root
npm run clean
npm run build

cd temp-examples
npm install
npm run example:steel-puppeteer
```

## Steel

**Website:** https://steel.dev
**Docs:** https://docs.steel.dev
**Protocol:** CDP only (no Playwright WebSocket protocol)

### Connection modes

Steel supports two ways to connect:

1. **Auto-managed sessions** — connect directly to `wss://connect.steel.dev?apiKey=...`. Steel creates and cleans up the session automatically. Simplest approach.

2. **API-managed sessions** — create a session via `POST /v1/sessions`, connect with the returned `sessionId`, release via `POST /v1/sessions/{id}/release`. Gives control over session options (proxy, geolocation, etc.) and explicit cleanup.

### Concurrent session limits (Hobby/free tier)

- Docs say 5 concurrent sessions
- In practice, only 4 connections succeed simultaneously
- Excess connections **hang silently** — no 429 error, no timeout, `puppeteer.connect()` / `connectOverCDP()` just never resolves
- Set `maxOpenBrowsers = 4` to stay safe

### Playwright

Steel exposes a CDP endpoint. Use `connectOverCDP()`, not `connect()`:

```typescript
// Works — CDP
const browser = await chromium.connectOverCDP('wss://connect.steel.dev?apiKey=...');

// Hangs forever — Steel doesn't speak Playwright's WebSocket protocol
const browser = await chromium.connect('wss://connect.steel.dev?apiKey=...');
```

### Examples

| Example | Connection | Session management |
|---------|-----------|-------------------|
| `steel-puppeteer.ts` | Puppeteer CDP | Auto-managed |
| `steel-playwright.ts` | Playwright CDP | API-managed (create/release) |

---

## Browserbase

TODO

## Browserless

**Website:** https://browserless.io
**Docker:** `ghcr.io/browserless/chromium`
**Protocol:** CDP and Playwright WebSocket

### Local setup (Docker)

```bash
docker run -p 3000:3000 -e CONCURRENT=4 ghcr.io/browserless/chromium
```

Or use the npm script:

```bash
npm run docker:browserless
```

This starts a Browserless instance on `ws://localhost:3000` with a 4 concurrent session limit.

### Connection modes

Browserless supports both CDP and Playwright's native WebSocket protocol:

- **CDP** — `ws://localhost:3000` (default endpoint)
- **Playwright WebSocket** — `ws://localhost:3000/chromium/playwright` (use `type: 'websocket'` on the provider)

Unlike Steel, Browserless actually speaks the Playwright WebSocket protocol, so `browserType.connect()` works.

### Session management

The cloud version has a `/session` API for explicit session lifecycle:

- **Create:** `POST /session?token=...` with `{ ttl: 60000 }` — returns `{ id, connect, stop }`
- **Connect:** Use the `connect` URL from the response
- **Release:** `DELETE {stop}&force=true`

The local Docker image (open-source) does not have the `/session` API — sessions are auto-managed on connect/disconnect.

### Examples

| Example | Connection | Session management | Target |
|---------|-----------|-------------------|--------|
| `browserless-local-puppeteer.ts` | Puppeteer CDP | Auto-managed | Docker |
| `browserless-local-playwright.ts` | Playwright CDP | Auto-managed | Docker |
| `browserless-local-playwright-ws.ts` | Playwright WebSocket | Auto-managed | Docker |
| `browserless-puppeteer.ts` | Puppeteer CDP | Auto-managed | Remote |
| `browserless-playwright.ts` | Playwright CDP | API-managed (create/release) | Remote |
| `browserless-playwright-ws.ts` | Playwright WebSocket | Auto-managed | Remote |

## Rebrowser

TODO
