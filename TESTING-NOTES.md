# Turnkey - Testing Notes for Ted

**Live URL:** https://turnkey-rosy.vercel.app

## How to Log In

1. Go to the URL above
2. Enter your email address on the login screen
3. Click "Sign In" -- a magic link will be sent to your email
4. Check your inbox (and spam folder) for the email from Supabase Auth
5. Click the link in the email to be logged in automatically

## Core Features to Test

### Scout
- Enter a ZIP code or market name (e.g., "78704" or "Austin TX") and click "Scout Now"
- The AI scout agent searches for real investment properties using web search
- Results show deal cards with scores, strategy recommendations, and key metrics
- Click "Deep Analyze" on any property to run the full analyst agent
- Click "+ Pipeline" to add a property to your deal pipeline

### Pipeline
- View all properties you have added to your pipeline
- Properties move through stages: Watching > Contacted > Under Contract > Closed > Sold
- Track purchase price, sale price, and outcome for each deal

### Map
- Interactive Leaflet map showing property locations
- Click markers to see property details

### Contacts
- Add contacts (agents, contractors, lenders, etc.)
- Track name, role, email, phone, company, and notes
- Link contacts to properties or pipeline entries

### Predictions
- After running "Deep Analyze" on a property, the system creates predictions for ARV, rental income, and renovation cost
- Enter actual values later to track prediction accuracy over time
- System-wide accuracy score shown at the top

### Watchlists
- Set up automated market monitoring by adding watchlist entries with ZIP codes
- Configure global investment criteria (max price, min cap rate, min flip ROI, min score, property types, strategies)
- Override global criteria per-market for fine-tuned filtering
- "Scout Now" button on each watchlist triggers immediate scouting
- Toggle watchlists active/inactive

## Known Issues

1. **Watchlists migration may need manual apply** -- The migration file `supabase/migrations/00002_watchlists_criteria.sql` creates the `watchlists` and `investment_criteria` tables. If these tables do not exist yet in the Supabase project, the migration needs to be applied via `supabase db push` or manually run in the SQL editor.

2. **pg_cron not set up yet** -- The autoscout agent (`agent-autoscout`) is designed to run on a schedule via pg_cron to automatically scout all active watchlists. This cron job has not been configured yet. For now, use the "Scout Now" button on each watchlist to trigger manual scouting.

3. **Bundle size warning** -- The production build generates a single JS chunk over 500KB. This works fine but could be optimized with code-splitting in a future iteration.

4. **API keys required for full data** -- The enricher agent uses Census, FRED, HUD, BLS, FEMA, and Walk Score APIs. Some data sources may return partial results if API keys are not configured in Supabase Edge Function secrets.

5. **Street View placeholder** -- Property cards show a "Street View" placeholder box. Google Street View integration is planned but not yet implemented.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4
- **UI:** Base UI (React) + shadcn-style components + CVA variants
- **Backend:** Supabase (Postgres + Auth + Edge Functions)
- **AI:** Vercel AI Gateway with Claude for scout/analyst agents
- **Data:** Census ACS, FRED, HUD FMR, BLS, FEMA NFHL, Walk Score
- **Hosting:** Vercel
