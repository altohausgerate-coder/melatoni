# Melatoni customer comfort features

## Included

- Account recommendations based on selected product categories. Product views and add-to-cart signals are stored only after the customer opts in. Turning consent off clears the stored interaction history.
- Per-product price-drop and restock preferences. The account email is used only after the customer checks the email-consent box.
- Account support requests with optional order reference and a reply/status history. Customers can read their own requests; only admins can write replies or change status.
- Admin analytics for viewed and sold products, confirmed sales, cart activity, estimated sessions without checkout, order volume and recent sales dynamics.

## Apply the database migration

Run the full contents of `supabase/migrations/20261016160000_customer_comfort.sql` in the Supabase SQL Editor for the Melatoni production project. It uses row-level security and does not require a service-role key. Keep the existing `is_admin` function and admin profile flag from the store-management migration.

## Enable email delivery for product alerts

The static storefront records opt-in alert preferences immediately. To deliver email when an admin lowers a product price or changes stock from zero to available, deploy the Edge Function and configure a sender address with an email provider:

```sh
supabase functions deploy product-alerts --project-ref zjmfvtcclecmbjcimddc
supabase secrets set RESEND_API_KEY=... EMAIL_FROM="Melatoni <bildiris@your-verified-domain>" --project-ref zjmfvtcclecmbjcimddc
```

`RESEND_API_KEY` and `EMAIL_FROM` are stored as Supabase Function secrets; do not add them to this repository or any browser JavaScript. The sender domain must be verified with the provider. `SITE_URL` is optional; the default alert link uses the published Melatoni site. This implementation uses the authenticated admin JWT and public anon key in the function; it does not use `service_role` or the database password.

Until those secrets and the function are deployed, customers can save/manage alert preferences and the admin can review them, but no email is sent. Support replies appear in the customer's account; reply-email delivery is not included.

## Privacy and access

Recommendation interaction rows are tied to a signed-in user only when they enabled recommendation consent. Customers can withdraw consent, which clears those rows. Product alerts store the account email because it is the selected delivery channel; removing an alert deletes that subscription. Support requests are visible to their owner and Melatoni admins. Analytics continues to use the existing low-PII event/session model, and abandoned-cart numbers are estimates based on sessions that added a product but did not log a checkout/order event.

## Campaign push and signed-in cart reminders

The storefront now supports browser push with a separate, deliberate opt-in under **Account → Site notifications**. “Accept all” cookies does not enable push. A customer can turn push off from that account section or browser settings. Campaign push is sent from **Admin → Campaign notices** only to opted-in devices. Price/restock alerts use push when configured, while retaining the existing email route.

On iPhone, the customer needs a recent iOS version and must add the site to the Home Screen, then open that shortcut before enabling web push. Other unsupported browsers receive a friendly setup message.

The one-time abandoned-cart reminder is limited to signed-in customers who have enabled push on at least one device. The site saves a small cart snapshot only while a push subscription exists. After 60 minutes of cart inactivity, a scheduled Supabase job sends one reminder; successful database orders suppress it. Guest carts stay in the browser and do not generate remote reminders.

To activate delivery in the published site:

1. Apply `supabase/migrations/20261017120000_push_and_cart_recovery.sql` in the Melatoni Supabase SQL Editor. It creates the RLS-protected tables, a private random recovery secret in Vault, and a 15-minute scheduler. It uses the publishable key and does not need a service-role key or database password.
2. Deploy `send-campaign-push`, `send-cart-reminders`, and the updated `product-alerts` Edge Functions from this repository.
3. In Supabase **Edge Functions → Secrets**, set `VAPID_PUBLIC_KEY` to the public value in `supabase-config.js`, and `VAPID_PRIVATE_KEY` to the matching private key created for this site. The private key is not stored in Git. The generated local copy is at `%TEMP%\melatoni-vapid-private.txt`; move it into the Supabase secret field and then remove that temporary copy.
4. Publish the site branch containing the account opt-in and admin campaign form. Campaign sending is available to the Melatoni admin account only.

The 7 requested conversion paths are covered across the existing and added site features: consent-based recommendations, price/restock alerts, account support, admin analytics, complementary product suggestions, the existing WhatsApp checkout, and opt-in campaign/cart push. Product email delivery still additionally needs the verified email provider secrets described above.
