# Cwork — Admin console

React 19 + Vite + TypeScript. The HR and administration interface.

## Running

```bash
npm install
npm run dev     # → http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:3000` (override with
`VITE_API_PROXY_TARGET`), so the browser sees a same-origin API and there is no
CORS preflight in development.

Sign in with a seeded account — see the backend's `npm run db:seed` output.

## Scripts

| Command | |
|---|---|
| `npm run dev` · `build` · `preview` | |
| `npm test` | Vitest |
| `npm run lint` · `typecheck` · `format` | |

## Layout

```
src/
├── app/           Router, layout, query client, route guards
├── components/ui/ Primitives (Button, Card, Badge, EmptyState, …)
├── features/      One directory per screen area
├── lib/           API client, formatters, labels, permissions
├── stores/        Zustand: session and UI preferences
├── styles/        Design tokens and component CSS
└── types/         API response shapes
```

## State management

| Concern | Tool |
|---|---|
| Server state | TanStack Query |
| Session, UI preferences | Zustand (persisted) |
| Form state | react-hook-form + zod |

The split is deliberate. Server state can go stale because someone else changed
it; client state cannot. Keeping them in separate systems means "is this stale?"
is a question only the query layer has to answer. Putting API responses in
Zustand would mean hand-writing invalidation in every component.

Query keys are centralised in `app/query-client.ts`, so invalidation never
guesses at a string.

## Two things worth knowing

**One HTTP client owns auth.** When the access token expires, concurrent 401s
collapse into a single refresh and every waiting request retries after it. Without
that, a screen firing three requests at once would rotate the refresh token three
times and trip the server's reuse detection, logging the user out.

**Route guards mirror the server's permissions.** `lib/permissions.ts` is a copy
of the server's constants; guards use it so a role never lands on a screen the
API would refuse. The server remains the enforcement point — this only avoids
showing a dead end.

## Styling

Hand-written CSS with design tokens, no framework. The palette is defined once
on `:root`, redefined under `prefers-color-scheme: dark` **and** under an
explicit `[data-theme]`, so a manual toggle wins in both directions and no colour
is ever defined only inside a dark block.

Verified in Chromium at 1440px and 390px: no horizontal body scroll, tables
scroll inside their own container.
