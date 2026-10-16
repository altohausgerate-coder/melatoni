# Melatoni store management

This branch adds the optional Supabase-backed catalog, inventory, order status, image storage, realtime order notices, and anonymous storefront analytics.

## Deploying the database setup

1. In the Supabase SQL Editor for the Melatoni project, run `supabase/migrations/20261016120000_storefront_admin.sql` after the existing account migration.
2. To grant store-manager access, run the commented profile update at the end of that migration after replacing `YOUR_LOGIN_EMAIL` with the manager's Supabase login email. Only trusted store operators should be made administrators.
3. Sign in at `/admin.html`. The product editor supports AZ/RU/EN names, descriptions and materials, price, sale price, stock, active status, and image uploads to the public `melatoni-products` bucket. Orders can be reviewed and their statuses updated; new orders appear in the live counter. Analytics covers the most recent 30 days.

The browser app uses only the Supabase public/publishable key and database row-level security. Never put a service-role key in the static site. Existing catalog and WhatsApp guest checkout remain available when Supabase is unavailable. Until the migration is applied, the admin area will explain that the database setup is missing.

The seeded 21 items use the repository's existing image assets. Newly uploaded images are stored in Supabase Storage and are publicly viewable because the product image bucket is public.
