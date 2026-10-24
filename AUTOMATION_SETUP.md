# Melatoni commerce automation setup

## What this adds

This change extends the existing Cloudflare Pages and Supabase site. It does not create a new store or migrate live data. The SQL migration is prepared locally and must be reviewed and applied to the existing Supabase project before the server-side features become active.

- Orders are created through `create_store_order`, which verifies the signed-in customer, their saved delivery address, current product prices and stock. The database stores an order number and customer/address snapshots.
- Order creation/status changes and stock warnings enter a private retryable queue. A Supabase Edge Function delivers admin notices to the configured inbox and customer email.
- Inventory is decremented only when an order is confirmed, restored if an eligible confirmed order is cancelled, and every stock change is audited. Out-of-stock items cannot be added from the product detail page; server-side stock checks remain authoritative. Products whose stock is `NULL` remain untracked until the admin enters a real stock count; enter counts for every SKU before relying on full inventory enforcement.
- Cart reminders are queued at one and 24 hours. Email requires the account holder’s explicit opt-in in **Hesabım → Sayt bildirişləri**. Browser push requires an active push subscription, which the visitor explicitly enabled. Both are rechecked immediately before delivery.
- The account support widget answers from active Supabase product data, can check an order using its number and phone, and asks for explicit contact consent before creating a human support request. PII is scrubbed before chat text is sent to OpenAI.
- Admin analytics include today/week/month sales, new orders, abandoned cart estimate, open support requests, order status counts, low stock and recent stock audit entries. Every Monday at 13:00 Baku time, the configured admin inboxes receive a privacy-safe weekly journey report: sessions, product impressions, product clicks, cart additions, checkout starts, orders, confirmed sales, week-over-week change, recommendation placement performance and products that were shown often but received little interest.
- GTM is loaded only after analytics or marketing consent; Consent Mode v2 defaults to denied. PII fields are filtered from website analytics events.

No n8n workflow is included: this implementation uses Supabase Vault, pg_cron, pg_net, Edge Functions and a private database queue. That keeps the current stack and avoids adding an external automation host.

## 1. Apply Supabase changes

1. Back up the existing project and review `supabase/migrations/20261022090000_order_automation_and_stock.sql` against the live schema. The migration expects the existing `products`, `profiles`, `addresses`, `customer_preferences`, `abandoned_carts`, `push_subscriptions`, `orders` tables, `is_melatoni_admin()` helper and Supabase Vault/pg_cron/pg_net extensions.
2. Apply `20261022090000_order_automation_and_stock.sql` to the existing project from Supabase SQL Editor or the configured Supabase CLI workflow. It does not rewrite, delete, or backfill historical order values; new order snapshot columns stay `NULL` on old orders, and new checkout orders receive values. Legacy `processing` statuses remain unchanged and display as preparing. This migration intentionally leaves direct customer inserts enabled so the currently deployed checkout keeps working during rollout.
3. Confirm the project API URL/key and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase Edge Functions. Never place the service role key in frontend files.
4. Deploy `store-automation` and `customer-assistant`; redeploy the existing `send-cart-reminders` function after this update.
5. Confirm the migration schedules existing cron invocations in UTC: queue worker every minute, cart-reminder scan every 15 minutes, weekly report Monday 09:00 UTC (13:00 Baku during UTC+4).

## 2. Configure provider secrets

Set these in **Supabase → Project Settings → Edge Functions → Secrets** (or the equivalent Supabase secrets command). Values are intentionally absent from this repository.

- `ADMIN_NOTIFICATION_EMAIL`: private inbox or comma-separated inboxes that should receive new order, order status, support, low stock, and weekly report notices.
- `RESEND_API_KEY`: Resend API key. Verify the sending domain and use `EMAIL_FROM` on that verified domain. Admin notices are sent through Resend to the configured Gmail inbox; Gmail is the recipient, not the sending provider.
- `EMAIL_FROM`: sender such as `Melatoni <orders@melatoni.com>` after domain verification.
- `OPENAI_API_KEY`: OpenAI API key. `OPENAI_MODEL` is optional and defaults to `gpt-4o-mini`.
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: retain the existing pair used by web push; do not regenerate unless the frontend public key and all subscriptions are migrated together.

Edge Function secret values should never be pasted into source files, SQL output, browser console screenshots or this document.

## 3. GTM and GA4

Create or select the Melatoni GTM container and GA4 web stream, then set the public container ID in `analytics-config.js` as `GTM-...`. There were no existing GTM/GA4 tags or IDs in the reviewed public files, so no duplicate tracker was found. The admin panel is intentionally excluded from visitor analytics.

In GTM, add:

| Tag | Trigger | Notes |
| --- | --- | --- |
| GA4 Configuration / Google tag | Custom Event `melatoni_analytics_consent_ready` | Use the GA4 Measurement ID and disable automatic page_view; the site sends a path-only `page_view` event after analytics consent. |
| GA4 Event | Custom Events matching the ecommerce event names | Map standard `ecommerce.*` data layer variables. For the `page_view` event map `page_location` and `page_title`. |
| GA4 Event | Custom Event `view_item` | Map `ecommerce.currency`, `ecommerce.value`, `ecommerce.items`. |
| GA4 Event | `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase` | Map standard GA4 ecommerce fields; transaction ID is the Melatoni order number. |
| GA4 Event | `search`, `sign_up`, `login`, `generate_lead`, `contact_form_submit`, `whatsapp_click`, `telegram_click`, `phone_click` | Map method/type only. Do not add form, contact or text variables. |

The current checkout has no customer-selectable payment method or payment step, so `add_payment_info` is deliberately not emitted with invented information. Add it only after the actual payment choice is part of checkout. Checkout currently has no delivery charge, coupon or discount input; purchase sends AZN, order number, item IDs/names/categories/prices/quantities, and zero shipping/discount.

Do not send email, phone, address, customer name, account ID, free-text search or support message to GA4 or GTM. The site only sends analytics events and loads the GA4 configuration after analytics consent is granted. If adding ad/marketing tags, use the `melatoni_marketing_consent_ready` custom event and marketing Consent Mode checks. Marketing consent separately maps to advertising storage/user-data/ad-personalization.

## 4. Events implemented

- Ecommerce: `view_item_list` (only when a product card is actually visible), `select_item`, `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`, `purchase`.
- Engagement/conversions: `search`, `sign_up`, `login`, `generate_lead`, `contact_form_submit`, `whatsapp_click`, `telegram_click`, `phone_click`.
- `add_payment_info` awaits an actual payment selection in checkout.

## 5. Verify after deployment

1. Use a staging/test order and verify the database order snapshot, unique order number, RLS owner visibility and new-order queue item. After the new storefront is live and checkout is verified, apply `20261022100000_revoke_legacy_order_insert.sql` to close the old direct-insert path.
2. Confirm the configured inbox receives the order number, customer name and phone, items, quantity, total, payment state, delivery address and Baku-local time. Confirm customer email content and status changes in AZ/RU/EN.
3. Confirm pending→confirmed decrements stock exactly once, confirmed/preparing/shipping cancellation returns stock, and repeated/invalid status transitions are rejected. Verify audit entries and low-stock threshold crossing.
4. With a test customer, save an abandoned cart and verify no email arrives until explicit consent. Verify 1-hour and 24-hour queue stages; revoke consent before delivery and confirm the worker skips email. Push requires a subscribed device. Confirm an order prevents reminders.
5. Verify AI answers only from current catalog data, status lookup requires both order reference and matching phone, rate limits reject excess attempts, and support escalation requires checkbox consent. Test that medical questions are redirected without diagnosis/treatment advice.
6. With cookie consent reset in a staging browser, verify Google Consent Mode defaults are denied and no GTM network request occurs before consent. Accept analytics, then verify one GTM container and events in Tag Assistant and GA4 DebugView. Choose “Only necessary” and reload to verify the preference persists and GTM stays unloaded.
7. Run phone and desktop smoke checks for product grid, product detail, account orders, cart, admin orders, product editing and order status changes.

Tag Assistant and DebugView require the real GTM/GA4 IDs and a browser session against the deployed/test environment. This workspace has no connected GTM or GA4 account, provider secrets, or deployed Supabase migration, so those external delivery tests cannot be truthfully reported as complete here.

## 6. WhatsApp extension

No WhatsApp Business API credentials or provider were supplied. No automated WhatsApp messages are enabled. The current store uses WhatsApp links for customer-initiated contact; any later outbound reminder integration must use an approved WhatsApp Business provider, templates and a separately recorded customer opt-in.
