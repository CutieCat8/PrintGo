-- Pickup hand-over: the shop marks the print as handed over (no pickup code to type), the customer
-- confirms receipt within 10 minutes, otherwise the system confirms for them.
-- This column only records WHEN the shop handed over; orders.status still changes only in transition().
alter table public.orders add column if not exists handed_over_at timestamptz;
