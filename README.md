# PrintGo

> Your file goes in. Your print comes home.

A LINE OA that sits between customers and print shops: send a file, pick a shop, the shop confirms the price, pay, and pick up or get it delivered.

Working on this repo (people and AI agents): start with `CLAUDE.md`, then `docs/CONTRACTS.md`, `DECISIONS.md` and your task file in `docs/tasks/`.

## Run it

Needs Node 22.12 or newer.

```bash
npm install
cp .env.example .env.local   # fill in the values you need
npm run dev                  # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | start the dev server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run format` | Prettier |
| `npm run build` | production build |

Before opening a PR: `npm run lint && npm run typecheck && npm test`.

## Database

Schema and sample data live in `supabase/` (`migrations/` and `seed.sql`). The sample data is made up.

| Command | What it does |
|---|---|
| `npm run db:reset` | empty the **local** Supabase database (needs Docker), run the migrations, then the seed |
| `npm run db:reset:remote` | the same on the Supabase project linked with `npx supabase link`. **Erases that database**; the CLI asks you to confirm. Use a dev project only |

Change the schema by adding a new file with `npx supabase migration new <name>`. Never edit a migration that others have already run.

### Signing in

- **Customers** sign in with LINE (LIFF); the browser sends the LIFF ID token as `Authorization: Bearer ...`.
- **Shops and admins** sign in at `/login` with an e-mail link (Supabase Auth). A new shop fills in its details after the first sign-in and waits for an admin to approve it.
- **Make someone an admin:** they sign in once at `/login`, then run `npm run make-admin -- their@email`.

### Dev shortcut

Outside production, send the header `x-dev-user` with an API request instead of signing in (it is ignored in production):

| Header value | Acts as |
|---|---|
| `customer:00000000-0000-4000-8000-0000000000c1` | the sample customer |
| `shop:00000000-0000-4000-8000-0000000000a1` | sample shop A (`...a2` = B, `...a3` = C) |
| `admin` | an admin |
