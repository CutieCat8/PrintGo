# A3 — Supabase dev integration (13 November 2026, Asia/Bangkok)

Configured a separate user-owned Supabase dev project with the initial schema and atomic-finance migration. The local `.env.local` now targets that dev project and sets `NEXT_PUBLIC_USE_MOCK=false`. The previous local environment is preserved in an ignored private backup. No credentials, real account numbers, slips or production project identifiers are recorded here.

## Verified against actual services

The server key successfully reads the dev database through PostgREST. An invalid-input RPC probe reaches `transition_order_finance` and receives PT422 before writing anything. A direct anonymous GET of orders receives HTTP 401 / PostgreSQL 42501. Dashboard SQL checks confirm RLS on all 17 application tables, three private Storage buckets, and RPC execution denied to anon/authenticated but granted to service_role.

A temporary fictional customer, shop and quoted order were inserted only into the explicitly guarded dev project. The running Next.js development server on port 3001 exercised:

- Two concurrent POST charge requests returned 200 and the same payment ID. A forged request amount of 1 did not change the stored total of 12,600 satang.
- Another development customer received 404 for that order.
- The slip-sign endpoint returned a real signed upload token. A fictional one-pixel PNG was uploaded to the private payment-slips bucket through Supabase Storage.
- POST slip returned pending_review, preserving O9/manual review.
- Two concurrent calls to the actual financial RPC, simulating an admin decision for that fictional payment, produced exactly one changed result and one settlement of 12,000 satang.
- GET customer order returned paid. Submitting the same slip path again returned verified.
- The uploaded test object and all customer/shop/order/payment/settlement test rows from this run were removed successfully. Existing records were not used or modified.

## Simulated or still outstanding

Authentication in these HTTP checks used the existing development-only x-dev-user header, not real LIFF or Supabase Auth sessions. The image was a fictional fixture, not a bank slip. The admin decision called the internal RPC directly: it did not exercise an A6 endpoint or screen. No real money moved, no live SlipOK call was made, and notifications remain the existing stub.

This proves the payment routes, PostgREST and Storage work with the new dev connection. It does not close A3's remaining customer-page PaymentSection/PaymentPanel integration, actual LIFF/mobile sign-in, real receiver confirmation or live-slip checks. The nine PostgreSQL/Docker rollback and concurrency tests remain separate evidence described in ATOMIC-FINANCE.md.

Migrations were installed through the dev Dashboard SQL Editor in a transaction. CLI migration-history reconciliation has not been performed; do not blindly run `db push` expecting an empty schema.
