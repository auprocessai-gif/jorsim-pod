# Jorsim Pod deployment plan

This project must be deployed as a separate Vercel project. The current Supabase instance is shared, so all Jorsim Pod tables use the `jorsim_` prefix to avoid mixing with existing projects.

## Supabase

1. Use the existing shared Supabase instance.
2. Run `supabase/schema.sql` in the SQL editor only if the `jorsim_` tables do not already exist.
3. Create two Storage buckets:
   - `episode-audio` for podcast and interview audio files.
   - `episode-covers` for cover images.
4. Keep both buckets private if we want stronger control over downloads.
5. Use Vercel server functions with `SUPABASE_SERVICE_ROLE_KEY` for admin uploads and private signed URLs.

## Vercel

1. Create a new Git repository for this folder.
2. Import that repository into Vercel as a new project named `jorsim-pod`.
3. Add environment variables from `.env.example`.
4. Deploy to a preview URL first.
5. Test:
   - public episode listing;
   - audio playback;
   - admin login;
   - upload audio;
   - upload optional cover;
   - scheduled publishing;
   - consultation submission;
   - admin dashboard analytics.

## Domain

1. Buy or connect a domain only after the Vercel preview works.
2. Suggested domain shape:
   - `jorsimpod.com`
   - `jorsimpod.es`
   - `podcast.jorsim.com` if there is already a Jorsim domain.
3. Point DNS to Vercel from the chosen registrar.

## Email

The local version stores consultations but does not send email automatically. In production, use one of:

- Supabase Edge Function plus an email provider.
- Vercel Function plus Resend, SendGrid, Mailgun, or SMTP.

The default recipient remains `mariola@auladeformadores.com` and can be changed through `CONSULTATION_EMAIL`.
