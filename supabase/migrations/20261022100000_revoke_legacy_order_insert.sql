-- Apply only after the secure create_store_order checkout is live in production.
-- This closes the legacy direct-insert path once all active clients use the RPC.
revoke insert on public.orders from authenticated;
