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
