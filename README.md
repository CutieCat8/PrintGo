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
