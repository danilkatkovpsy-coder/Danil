# Supabase backend

The app has Supabase email sign-in and stores clients and invoices in the organization database. Purchases, expenses, company settings, and automatic invoice email are not connected yet.

## First setup

1. Open the Supabase dashboard at `https://supabase.com/dashboard`, create an account, then create a project named `Arvesemu`.
2. Choose a region in the EU. Generate a strong database password, save it in a password manager, and do not put it in this repository or send it in chat.
3. Wait until the project is ready. Open **SQL Editor**, create a query, paste the contents of `migrations/20261003000100_accounting_core.sql`, and run it. The migration creates the tables and enables Row Level Security.
4. Create a second query and run `migrations/20261003000200_cloud_invoice_writes.sql`. It adds invoice snapshots and an atomic, organization-scoped operation for saving invoice lines. Run each migration only once.
5. In **Authentication > Sign In / Providers**, verify that the Email provider is enabled. Hosted Supabase projects require email confirmation by default. In **URL Configuration**, set the production Site URL to `https://danilkatkovpsy-coder.github.io/Generar-Accounting/` and add that URL plus `http://127.0.0.1:8000/` to the allowed redirect URLs.
6. Open the project's **Connect** dialog or **Settings > API Keys** and copy the **Project URL** and public **publishable** key (or legacy `anon` key). These are intended for browser apps. Never share the database password, a `service_role` key, or a secret API key.
7. Do not upload real client or accounting data until authentication and database access have been connected and tested.

The `create_organization(name, registration_code)` RPC creates an organization for the signed-in user and makes that user its owner. Team invitations need a server-side endpoint; clients must not be allowed to write directly to `organization_members`.

## Google sign-in

The login screen includes a Google button. Configure its provider once before using it:

1. In Google Cloud, create or select a project and configure the Google Auth Platform consent screen. For initial testing, use the External audience and add your Google account as a test user if the app remains in Testing.
2. Create an OAuth client ID with application type **Web application**. Add these **Authorized JavaScript origins**:
	- `https://danilkatkovpsy-coder.github.io`
	- `http://127.0.0.1:8000`
3. Add this **Authorized redirect URI**: `https://jkdknlxgeuvxhyauhden.supabase.co/auth/v1/callback`.
4. Create the client and copy its Client ID and Client Secret. In Supabase, open **Authentication > Sign In / Providers > Google**, enable Google, and enter both values.
5. Save the Google provider settings. Keep the Client Secret in Supabase only; never put it in this repository or the browser app.

## Keys and email

The Supabase project URL and publishable/anon key may be used by the browser only after the app is connected and the RLS policies have been reviewed. Never put a `service_role` key, database password, or email-provider API key in `index.html`, another browser file, or the GitHub repository.

## Invoice email delivery

The send action uses the `send-invoice` Supabase Edge Function. It checks the signed-in user's organization role, reads the saved invoice, emails its PDF attachment through Resend, and writes `pending`, `sent`, or `failed` to `invoice_email_deliveries`. The visible sender is the verified domain address in `EMAIL_FROM`; replies are addressed to the organization's owner email from Supabase Auth.

1. Create a Resend account and verify a domain you control. Add the DNS records Resend gives you. A GitHub Pages address is not a sender domain. For initial testing, Resend's test sender can only send to the account's verified address.
2. Create a Resend API key. Do not paste it into chat, source files, GitHub, or the browser.
3. Install the Supabase CLI on macOS (`brew install supabase/tap/supabase`) and log in (`supabase login`).
4. From the project folder, enter the Resend key and verified sender address as Supabase secrets. Type the real key only in your terminal:

	```sh
	supabase secrets set --project-ref jkdknlxgeuvxhyauhden RESEND_API_KEY=re_your_key EMAIL_FROM="Arvesemu <arved@your-verified-domain>"
	```

5. Deploy the function:

	```sh
	supabase functions deploy send-invoice --project-ref jkdknlxgeuvxhyauhden
	```

The browser sends only the invoice ID and generated PDF. Supabase secrets, including `SUPABASE_SERVICE_ROLE_KEY`, stay on the server. Test with your own verified email before sending customer invoices.