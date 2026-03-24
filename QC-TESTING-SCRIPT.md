# Turnkey -- QC Testing Script

**Version:** 1.0
**Date:** 2026-03-24
**App URL:** https://turnkey-rosy.vercel.app
**Purpose:** Walk through every feature of Turnkey as a real user would, document every issue found.

---

## Section 1: Test Environment Setup

### 1.1 Access the App

| Item | Value |
|------|-------|
| Production URL | https://turnkey-rosy.vercel.app |
| Auth method | Magic link (email-based, no password) |
| Backend | Supabase (Postgres + Auth + Edge Functions) |
| Hosting | Vercel |

### 1.2 Getting Logged In

1. Navigate to https://turnkey-rosy.vercel.app
2. You should see the login card with "Turnkey" heading and "Sign in with your email"
3. Enter your email address in the input field
4. Click "Send Magic Link"
5. You should see: "Check your email for a magic link to sign in."
6. Open your email inbox (check spam/junk if not in inbox)
7. Click the magic link in the email from Supabase Auth
8. You should be redirected to the Dashboard automatically

### 1.3 Browsers to Test

| Browser | Version | Priority |
|---------|---------|----------|
| Chrome | Latest | P0 -- primary |
| Safari | Latest | P0 -- many Mac/iOS users |
| Firefox | Latest | P1 |
| Edge | Latest | P2 |
| Chrome Mobile (Android) | Latest | P1 |
| Safari Mobile (iOS) | Latest | P1 |

### 1.4 Viewports to Test

| Label | Width | Device Class |
|-------|-------|-------------|
| Mobile S | 375px | iPhone SE / small Android |
| Tablet | 768px | iPad portrait |
| Laptop | 1024px | Small laptop |
| Desktop | 1440px | Standard desktop |

---

## Section 2: User Journey Tests

---

### Flow A: Authentication

#### A-1: Magic Link Request

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to https://turnkey-rosy.vercel.app/login | Login card appears centered on screen with "Turnkey" heading |
| 2 | Leave email blank, click "Send Magic Link" | Browser native validation prevents submission (field is `required`) |
| 3 | Enter an invalid email (e.g., "notanemail"), click submit | Browser validation rejects it (input type is `email`) |
| 4 | Enter a valid email, click "Send Magic Link" | Confirmation message: "Check your email for a magic link to sign in." |
| 5 | Check if error handling works: enter a valid email but simulate network failure (disconnect wifi, click submit) | Error message appears in red below the input field |

**Things to note:**
- Is the button disabled while the request is in flight? (Currently no loading state on button -- potential issue)
- Does the confirmation message persist if you refresh the page? (It should reset to the form)
- Is there a rate limit on magic link requests? Try requesting 3 in quick succession

#### A-2: Email Delivery and Link Click

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check inbox for magic link email | Email arrives within 60 seconds |
| 2 | Check spam/junk folder if not in inbox | Note if email lands in spam -- this is an issue to report |
| 3 | Click the magic link | Browser opens, you are redirected to the Dashboard (`/`) |
| 4 | Verify the nav bar shows your email address | Email appears in top-right next to "Sign out" |

**Things to note:**
- Record how long the email takes to arrive
- Does the magic link work if clicked more than 5 minutes after it was sent?
- Does the magic link work if clicked twice?

#### A-3: Session Persistence

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | After logging in, refresh the page (F5) | You remain logged in, Dashboard reloads |
| 2 | Close the browser tab entirely, reopen the URL | You remain logged in (Supabase session stored in localStorage) |
| 3 | Open a new incognito/private window, navigate to the URL | You should NOT be logged in (redirected to `/login`) |
| 4 | Open a second regular tab to the same URL | You should be logged in (same session) |

#### A-4: Logout Flow

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Sign out" in the top-right nav bar | Redirected to `/login` page |
| 2 | Press the browser back button | Should NOT return to Dashboard; should stay on `/login` or redirect back to it |
| 3 | Manually navigate to `https://turnkey-rosy.vercel.app/` | Should redirect to `/login` (ProtectedRoute blocks access) |

#### A-5: Auth Edge Cases

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | While logged out, navigate directly to `/scout` | Redirected to `/login` |
| 2 | While logged out, navigate to `/property/some-fake-id` | Redirected to `/login` |
| 3 | While logged out, navigate to `/pipeline` | Redirected to `/login` |

---

### Flow B: Dashboard

**Route:** `/` (root, protected)

#### B-1: KPI Cards

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Dashboard | Four KPI cards render in a 4-column grid |
| 2 | Check "New Deals Today" card | Shows a number (may be 0 for a new account). Subtitle: "from overnight scout" |
| 3 | Check "Active Pipeline" card | Shows number of non-closed pipeline entries. Subtitle shows stage breakdown (e.g., "2 watching . 1 analyzing") |
| 4 | Check "Prediction Accuracy" card | Shows percentage or dash ("--") if no predictions exist yet |
| 5 | Check "AI Spend (MTD)" card | Shows dollar amount and agent run count for current month |

**Things to note:**
- Are all numbers $0.00 / 0 on a fresh account? Is that clear to the user or confusing?
- Does the pipeline breakdown string make sense? (e.g., "No active deals" when empty)
- Is the KPI grid responsive? At 768px, do cards stack or overflow?

#### B-2: Top Deals List

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Look at the left 2/3 column below KPI cards | "Top Deals" list showing up to 5 properties from scout results |
| 2 | If no properties exist | Should show an empty state or an empty list (check for blank space) |
| 3 | Click on a property in the list | Should navigate to `/property/:id` |

#### B-3: Pipeline Feed

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Look at the right 1/3 column | Pipeline feed showing recent pipeline entries |
| 2 | If no pipeline entries | Should show empty state or empty list |
| 3 | Check if entries show stage, address, and timestamp | All fields populated |

#### B-4: Empty State (Fresh Account)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in with a brand new email that has never used the app | Dashboard loads without errors |
| 2 | All KPI cards show zeroes / dashes | No NaN, undefined, or blank values |
| 3 | Top deals list is empty but not broken | No error messages, just empty or helpful prompt |
| 4 | Pipeline feed is empty but not broken | Same as above |

---

### Flow C: Market Scouting

**Route:** `/scout`

#### C-1: Enter a Market

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Scout page | Page heading "Scout", search input with placeholder "Zip code or market (e.g., 78704, Austin TX)...", "Scout Now" button |
| 2 | Without entering anything, click "Scout Now" | Nothing happens (empty string guard) |
| 3 | Type "78704" into the input | Text appears in input field |
| 4 | Press Enter | Scout agent fires (same as clicking button) |

#### C-2: Scout Agent Execution

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter "Austin TX", click "Scout Now" | Button text changes to "Scouting..." and becomes disabled |
| 2 | Wait for results | Agent returns results within 15-45 seconds |
| 3 | If agent fails | Red error message appears below the search bar |
| 4 | Results render | Property cards appear in a 3-column grid |

**Things to note:**
- TIME the agent response: _____ seconds
- Is there a loading spinner or just the button text change?
- Does the button re-enable after results return?
- If you scout again with a different market, do old results clear?

#### C-3: Result Cards (DealCardMini)

For each result card, verify:

| Element | Expected |
|---------|----------|
| Score badge | Green badge with star icon and number (e.g., "* 85") |
| "New" badge | Green "New" badge if scouted within last 24 hours |
| Strategy label | "flip", "rental", or "either" in top right |
| Street View placeholder | Gray box labeled "Street View" (not yet implemented -- known issue) |
| Address link | Clickable, navigates to `/property/:id` |
| Bed/bath/sqft | Format: "3bd/2ba . 1500 sqft" |
| Price | Yellow text, formatted as currency (e.g., "$250,000") |
| Analysis badges (if analyzed) | "Flip: X% ROI" and "Rent: X% cap" |
| Rationale text | 1-2 lines of AI explanation, truncated with ellipsis |
| "+ Pipeline" button | Adds property to pipeline |
| "Deep Analyze" button | Triggers analyst agent |

#### C-4: Add to Pipeline from Scout

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "+ Pipeline" on a scout result card | Property is added to pipeline (watching stage) |
| 2 | Navigate to `/pipeline` | Property appears in the "Watching" column |
| 3 | Go back to `/scout`, click "+ Pipeline" on the same property again | Should not create a duplicate (verify) |

#### C-5: Deep Analyze from Scout

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Deep Analyze" on a scout result card | Agent starts running |
| 2 | Wait for completion | Page reloads (current behavior: `window.location.reload()`) |
| 3 | After reload, card should show analysis badges | "Flip: X% ROI" and "Rent: X% cap" badges appear |

**Things to note:**
- The full page reload is jarring UX. Note this.
- TIME the analyst agent: _____ seconds
- Does the correct card update, or do all cards refresh?

---

### Flow D: Property Analysis (Deal Card)

**Route:** `/property/:id`

#### D-1: Navigate to Property Detail

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click a property address link from Scout or Dashboard | Navigate to `/property/:id` |
| 2 | Page loads | Full address as heading, property specs below (bed/bath/sqft/year built/type) |
| 3 | Score badge | Green badge with star and score number (top right) |
| 4 | "+ Add to Pipeline" button | Visible in top right |
| 5 | List price | Large yellow text (e.g., "$325,000") |

#### D-2: Analyst Agent Results (if analyzed)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check Flip Scenario card (green border) | Shows: Purchase, Renovation, Carrying, Total Investment, ARV, Profit, ROI, Timeline |
| 2 | Check if "Recommended" badge appears | Green "Recommended" badge if strategy is flip |
| 3 | Check Rental Scenario card (purple border) | Shows: Monthly Rent, Monthly Expenses, Cash Flow, Annual NOI, Cap Rate, Cash-on-Cash |
| 4 | Check if "Recommended" badge appears | Purple "Recommended" badge if strategy is rental |
| 5 | Check analysis metadata | "Analyzed [date] . Model: [model name] . Confidence: [X]%" at the bottom |

**Things to note:**
- Are all currency values formatted properly (no raw decimals like 325000.5)?
- Are percentage values formatted properly?
- Is the confidence score between 0-100?
- Do any values show as NaN, undefined, or $0 when they shouldn't?

#### D-3: Enricher Data -- Neighborhood Panel

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scroll to Neighborhood Intelligence panel | Card with heading "Neighborhood Intelligence (XXXXX)" with the ZIP code |
| 2 | Check Median Income | Dollar value from Census ACS data, or dash if unavailable |
| 3 | Check Population | Number from Census ACS, or dash |
| 4 | Check 30yr Mortgage | Percentage from FRED, or dash |
| 5 | Check FMR (3br) | Dollar value from HUD Fair Market Rent, or dash |

**Things to note:**
- Some data sources may return partial results if API keys are not configured (known issue)
- Note which fields show data and which show dashes
- Are missing data points clearly shown as "--" or do they show "$0" or "0"?

#### D-4: Unanalyzed Property

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to a property that has NOT been deep-analyzed | Message: "No analysis yet. Click 'Deep Analyze' from the Scout page." |
| 2 | No flip/rental cards shown | Only the property header and price are visible |

---

### Flow E: Pipeline Management

**Route:** `/pipeline`

#### E-1: Kanban Board Rendering

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Pipeline page | Heading "Pipeline" with horizontal kanban board below |
| 2 | Verify all 7 columns | Watching, Analyzing, Offer, Negotiating, Acquired, Tracking, Closed |
| 3 | Each column header | Shows emoji + label + count in parentheses (e.g., "Watching (2)") |
| 4 | Empty pipeline | Message: "No deals in pipeline yet. Add properties from the Scout page." |

#### E-2: Drag and Drop Between Stages

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Drag a card from "Watching" column | Card is draggable (cursor changes, card lifts) |
| 2 | Drop onto "Analyzing" column | Card moves to Analyzing, counts update |
| 3 | Try dragging a card backward (e.g., from Analyzing to Watching) | Move should be REJECTED (only forward transitions allowed by `isValidTransition`) |
| 4 | If move is rejected | Alert popup: "Cannot move: [error message]" |
| 5 | Drag a card from Watching directly to Offer (skipping a stage) | Should SUCCEED (any forward movement is valid) |

**Things to note:**
- Is the drag feedback clear? Can you tell where you are dropping?
- Does the board scroll horizontally if there are many columns?
- Do counts in column headers update immediately after a drop?
- Does the pipeline feed on the Dashboard update after stage changes?

#### E-3: Kanban Card Content

For each card in the pipeline, verify:

| Element | Expected |
|---------|----------|
| Property address | Visible on the card |
| Price | Visible if available |
| Stage indicator | Card is in the correct column |

#### E-4: Pipeline Stage Persistence

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Move a card to a new stage | Move succeeds |
| 2 | Refresh the page | Card remains in the new stage (saved to Supabase) |
| 3 | Log out and back in | Card still in the new stage |

---

### Flow F: Map View

**Route:** `/map`

#### F-1: Map Rendering

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Map page | Heading "Map" with a full-height Leaflet map below |
| 2 | Map loads | OpenStreetMap tiles render, centered on US (lat 39.8, lng -98.5, zoom 4) |
| 3 | Map is interactive | Can pan, zoom in/out with mouse wheel and +/- controls |
| 4 | Map fills the viewport | Height is `calc(100vh - 200px)` with rounded border |

#### F-2: Property Markers

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | If properties have lat/lng coordinates | Colored circle markers appear on the map |
| 2 | Marker color | Green if score >= 80, Yellow if score >= 60, Red if score < 60 |
| 3 | Click a marker | Popup appears with: address, city/state/zip, price, score, "View Deal Card" link |
| 4 | Click "View Deal Card" link in popup | Navigates to `/property/:id` |

**Things to note:**
- Do all scouted properties appear on the map, or are some missing lat/lng?
- If no properties have coordinates, is the map just empty (no markers)? Is that clear to the user?
- Are there any JavaScript console errors related to Leaflet?
- NOTE: There is no marker clustering implemented. At zoom level 4 (full US view), markers may overlap

#### F-3: Map Edge Cases

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Map with no properties in the database | Empty map with no markers, no errors |
| 2 | Zoom all the way in on a marker | Marker remains visible and clickable |
| 3 | Zoom all the way out | Map tiles render correctly at low zoom levels |

---

### Flow G: Contacts CRM

**Route:** `/contacts`

#### G-1: Add a Contact

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Contacts page | Heading "Contacts", "+ Add Contact" button, search input |
| 2 | Click "+ Add Contact" | Dialog opens with fields: Name, Role (dropdown), Email, Phone, Company |
| 3 | Leave Name blank, try to save | Save button is disabled (`disabled={!newContact.name}`) |
| 4 | Fill in: Name="Jane Smith", Role="Agent", Email="jane@example.com", Phone="555-1234", Company="Keller Williams" | All fields accept input |
| 5 | Click "Save" | Dialog closes, contact appears in the grid |
| 6 | Verify contact card | Shows name, company, email, phone, and blue "agent" role badge |

#### G-2: Role Types

| Role | Badge Color |
|------|-------------|
| Agent | Blue (`bg-blue-600`) |
| Contractor | Orange (`bg-orange-600`) |
| Lender | Green (`bg-green-600`) |
| Attorney | Purple (`bg-purple-600`) |
| Partner | Yellow (`bg-yellow-600`) |

Add one contact for each role and verify badge colors.

#### G-3: Search/Filter Contacts

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type a name in the search box | Contacts list filters in real time |
| 2 | Search by company name | Matching contacts shown |
| 3 | Search by role (e.g., "agent") | Matching contacts shown |
| 4 | Search for something that matches nothing | Empty state: "No contacts yet." |
| 5 | Clear the search | All contacts reappear |

**Things to note:**
- Search is case-insensitive (verify)
- The empty state message says "No contacts yet." even when contacts exist but search returns nothing. This is potentially misleading -- note it.

#### G-4: Contact Persistence

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add a contact, refresh the page | Contact persists |
| 2 | Log out and back in | Contact still there |

#### G-5: Missing Features to Note

- No edit contact functionality (cannot modify after creation)
- No delete contact functionality
- No "link contact to property/deal" feature visible in the UI
- Contacts display in a 2-column grid -- check mobile responsiveness

---

### Flow H: Predictions Tracker

**Route:** `/predictions`

#### H-1: View Predictions

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Predictions page | Heading "Predictions" with system accuracy card (top right) |
| 2 | If no predictions exist | Empty state: "No predictions yet. Analyze properties to generate predictions." |
| 3 | If predictions exist | Table with columns: Property, Metric, Predicted, Actual, Accuracy |

#### H-2: System Accuracy Score

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check accuracy card | Shows "System Accuracy: X%" in green, or not shown if null |
| 2 | Verify accuracy is between 0-100% | No values above 100 or below 0 |

#### H-3: Enter Actual Values

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find a prediction with no actual value | "Enter actual" button appears in the Actual column |
| 2 | Click "Enter actual" | Inline number input and "Save" button appear |
| 3 | Enter a value (e.g., 275000), click "Save" | Value saves, accuracy percentage calculates and displays |
| 4 | Accuracy is color-coded | Green (>= 90%), Yellow (>= 70%), Red (< 70%) |
| 5 | After saving, the tracker agent is invoked | No visible confirmation, but agent runs in background |

**Things to note:**
- Prediction metrics include: ARV, rental income, renovation cost
- Predictions are auto-generated by the analyst agent during "Deep Analyze"
- Can you enter a non-numeric value? (Input type is "number", so browser should prevent it)
- What happens if you enter 0? Or a negative number?
- Does the system accuracy update after entering an actual value?

#### H-4: Predictions Empty State

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | With a fresh account (no analysis run) | Empty state message, no table |
| 2 | Run a Deep Analyze on a property, then check Predictions | New prediction rows appear for that property |

---

### Flow I: Watchlists

**Route:** `/watchlists`

#### I-1: Create a Watchlist

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Watchlists page | Heading "Watchlists", "+ Add Market" button, Global Criteria card, Watchlist table |
| 2 | Click "+ Add Market" | Dialog with fields: Name, ZIP Code, City (optional), State (optional) |
| 3 | Leave Name and ZIP blank, try to save | Save button is disabled |
| 4 | Fill in: Name="NJ Suburbs", ZIP="07042", City="Montclair", State="NJ" | All fields accept input |
| 5 | Click "Save" | Dialog closes, watchlist row appears in the table |

#### I-2: Global Investment Criteria

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on the "Global Investment Criteria" card header | Card expands to show criteria form |
| 2 | Set Max Price = 400000 | Input accepts number |
| 3 | Set Min Cap Rate = 6 | Input accepts decimal |
| 4 | Set Min Flip ROI = 15 | Input accepts decimal |
| 5 | Set Min Score = 70 | Input accepts 0-100 |
| 6 | Check/uncheck property type checkboxes | Single Family, Multi Family, Condo, Townhouse |
| 7 | Check/uncheck strategy checkboxes | Flip, Rental, Either |
| 8 | Click "Save Defaults" | Button shows "Saving...", then reverts to "Save Defaults" |
| 9 | Refresh the page, expand criteria | Saved values persist |

#### I-3: Per-Market Criteria Overrides

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In the watchlist table, click "Edit Criteria" for a watchlist | Dialog opens with title "Criteria Overrides: [Name]" |
| 2 | Help text is shown | "Leave fields empty to use global defaults..." |
| 3 | Placeholders show global defaults | If global max price is 400000, placeholder shows "400000" |
| 4 | Enter an override: Max Price = 300000 | Input accepts number |
| 5 | Click "Save Overrides" | Dialog closes |
| 6 | Re-open Edit Criteria | Override values are populated |

#### I-4: Watchlist Table Features

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check table columns | Name, ZIP, City/State, Last Scouted, Active, Actions |
| 2 | Toggle Active checkbox off | Watchlist deactivates |
| 3 | Toggle Active checkbox on | Watchlist reactivates |
| 4 | Check "Last Scouted" column | Shows formatted date or "Never" |

#### I-5: Scout Now (Manual)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Scout Now" on a watchlist row | Button text changes to "Scouting..." and disables |
| 2 | Wait for agent completion | Button re-enables |
| 3 | "Last Scouted" updates | Date/time updates to now |
| 4 | Navigate to Scout page | New properties from that market appear |

**Things to note:**
- TIME the scout from watchlist: _____ seconds
- Does "Scout Now" use the watchlist criteria to filter results, or is it just a raw scout?
- The "Scouting..." state disables ALL Scout Now buttons (shared `agentLoading` state) -- is this confusing?

#### I-6: Delete Watchlist

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Delete" (red text) on a watchlist row | Watchlist is removed from the table |
| 2 | No confirmation dialog | Note: there is no "are you sure?" prompt -- potential issue |
| 3 | Refresh the page | Deleted watchlist is gone |

#### I-7: Known Limitations

- **Nightly autoscout is NOT running.** pg_cron is not configured. All scouting must be manual via "Scout Now".
- "New" badges on scout results show for properties scouted within the last 24 hours (based on `scouted_at` in `raw_data`).

---

### Flow J: Advisor Chat

**Available from any page via nav bar**

#### J-1: Open Advisor Panel

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Ask Advisor" button in the nav bar | Slide-out sheet panel opens from the right side |
| 2 | Panel heading | "Advisor" with a chat bubble emoji |
| 3 | Empty state | "Ask me anything about your deals, markets, or portfolio." |
| 4 | Input field | Placeholder: "Ask the advisor..." |

#### J-2: Ask a Question

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type "What is a good cap rate for rental properties?" | Text appears in input |
| 2 | Press Enter or click "Send" | Message appears on the right side (user bubble, primary color) |
| 3 | "Thinking..." indicator | Appears on the left side with pulse animation |
| 4 | Response arrives | AI response appears on the left side (muted background) |
| 5 | Response quality | Should be a relevant, real estate-focused answer |

**Things to note:**
- TIME the advisor response: _____ seconds
- Is the response substantive or generic?
- Does the input disable while waiting for a response?
- Does the "Send" button disable while waiting?

#### J-3: Conversation Flow

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ask a follow-up question | New user message added, new AI response follows |
| 2 | Scroll the conversation | Messages scroll within the panel; input stays fixed at bottom |
| 3 | Close the panel (click outside or X) | Panel slides closed |
| 4 | Re-open the panel | Conversation history is PRESERVED (state is in memory) |
| 5 | Navigate to a different page, re-open panel | Conversation MAY be lost (component re-mounts per page -- verify) |

#### J-4: Error Handling

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | If the advisor agent fails | Fallback message: "I'm having trouble connecting -- try again in a moment." |
| 2 | Try sending while already waiting | Send button should be disabled, input should be disabled |

#### J-5: Known Limitation

- Conversation is NOT persisted to the database. Closing the browser loses all messages.
- The advisor panel re-initializes each time the PageLayout mounts, so navigating between pages clears the conversation.

---

## Section 3: Cross-Cutting Concerns

### 3.1 Mobile Responsiveness

Test every page at each viewport:

| Page | 375px | 768px | 1024px | 1440px |
|------|-------|-------|--------|--------|
| Login | Card should be max-width with padding | | | |
| Dashboard | KPI cards (4-col grid) -- do they stack? | | | |
| Scout | Result cards (3-col grid) -- do they stack? | | | |
| Property Detail | Flip/Rental cards (2-col grid) -- do they stack? | | | |
| Pipeline | Kanban (horizontal scroll) -- scrollable on mobile? | | | |
| Map | Map fills viewport correctly? | | | |
| Contacts | Cards (2-col grid) -- do they stack? | | | |
| Predictions | Table -- horizontal scroll on mobile? | | | |
| Watchlists | Table -- horizontal scroll on mobile? | | | |

**Key concerns:**
- Nav bar at 375px: do all 7 nav links fit, or do they overflow? (There is no hamburger menu)
- Advisor panel width is set to `w-[400px] sm:w-[540px]` -- at 375px this will overflow the screen

### 3.2 Loading States

| Feature | Loading Indicator |
|---------|------------------|
| Auth check (ProtectedRoute) | "Loading..." centered on screen |
| Scout agent | Button changes to "Scouting..." and disables |
| Deep Analyze agent | No in-page indicator (page reloads after) |
| Pipeline load | "Loading..." text |
| Contacts load | "Loading..." text |
| Predictions load | "Loading..." text |
| Watchlists load | "Loading..." text |
| Advisor agent | "Thinking..." pulse animation |
| Criteria save | "Saving..." on button |

**Check:** Are any loading states missing? Do they last too long without feedback?

### 3.3 Error Handling

| Scenario | Expected Behavior |
|----------|------------------|
| Scout agent fails | Red error text below search bar |
| Analyst agent fails | Page reloads but no analysis appears |
| Enricher data partially missing | Dashes ("--") shown for missing neighborhood data |
| Advisor agent fails | "I'm having trouble connecting..." message in chat |
| Network disconnected | Various -- test each page for graceful handling |
| Supabase down | Pages may show empty state or hang on loading |

### 3.4 Empty States

Test each page with a brand new account that has no data:

| Page | Empty State Message |
|------|-------------------|
| Dashboard | KPIs show 0/dashes, Top Deals and Pipeline Feed empty |
| Scout | "No properties found. Enter a market and click Scout Now to find deals." |
| Property (bad ID) | "Property not found." |
| Pipeline | "No deals in pipeline yet. Add properties from the Scout page." |
| Map | Empty map, no markers |
| Contacts | "No contacts yet." |
| Predictions | "No predictions yet. Analyze properties to generate predictions." |
| Watchlists | "No watchlists yet. Add a market to get started." |

### 3.5 Navigation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click each nav link | Navigates to correct page, active link is highlighted |
| 2 | Click the "Turnkey" logo | Navigates to Dashboard (`/`) |
| 3 | Browser back button | Returns to previous page correctly |
| 4 | Browser forward button | Goes forward correctly |
| 5 | Direct URL entry (e.g., paste `/scout` into address bar) | Loads correct page when authenticated |
| 6 | Navigate to a non-existent route (e.g., `/foobar`) | Verify behavior -- may show blank page (no 404 route defined) |

---

## Section 4: Issue Reporting Template

Use this template for every issue found during testing. Copy-paste and fill in for each issue.

```
---

**Issue ID:** QC-001
**Page/Flow:** [which page or flow, e.g., "Scout / Flow C"]
**Severity:** P0 (broken) / P1 (major UX) / P2 (minor UX) / P3 (polish)
**Steps to Reproduce:**
1. [step one]
2. [step two]
3. [step three]
**Expected:** [what should happen]
**Actual:** [what actually happens]
**Screenshot:** [attach screenshot or paste image link]
**Device/Browser:** [e.g., Chrome 124 / macOS / 1440px viewport]
**Notes:** [any additional context]

---
```

### Severity Guide

| Severity | Definition | Examples |
|----------|-----------|---------|
| **P0 -- Broken** | Feature does not work at all, data loss, or security issue | Login fails, data not saving, blank page crash |
| **P1 -- Major UX** | Feature works but is very confusing or painful to use | Drag-drop doesn't give feedback, agent fails silently, page reload loses context |
| **P2 -- Minor UX** | Cosmetic or minor usability issues | Text truncation, color contrast, inconsistent spacing |
| **P3 -- Polish** | Nice-to-have improvements | Animations, micro-interactions, placeholder text improvements |

---

## Section 5: Performance and AI Agent Testing

### 5.1 Page Load Times

Measure using browser DevTools (Network tab) or Lighthouse:

| Page | Target | Actual |
|------|--------|--------|
| Login | < 2s | _____ |
| Dashboard | < 3s | _____ |
| Scout | < 2s | _____ |
| Property Detail | < 3s | _____ |
| Pipeline | < 2s | _____ |
| Map | < 3s (tiles) | _____ |
| Contacts | < 2s | _____ |
| Predictions | < 2s | _____ |
| Watchlists | < 2s | _____ |

**Known issue:** Bundle size is over 500KB (single chunk). This affects initial load time.

### 5.2 AI Agent Response Times

| Agent | Trigger | Target | Actual |
|-------|---------|--------|--------|
| Scout (`agent-scout`) | "Scout Now" button | < 30s | _____ |
| Analyst (`agent-analyst`) | "Deep Analyze" button | < 30s | _____ |
| Enricher (`agent-enricher`) | Runs during analysis | < 15s | _____ |
| Advisor (`agent-advisor`) | Advisor chat "Send" | < 10s | _____ |
| Tracker (`agent-tracker`) | After entering actual prediction value | < 10s | _____ |
| Autoscout (`agent-autoscout`) | Not yet active (pg_cron) | N/A | N/A |

### 5.3 Agent Failure Handling

| Scenario | Test Method | Expected Behavior |
|----------|------------|-------------------|
| Scout returns no properties | Search for an obscure/invalid market | Error message or empty results displayed |
| Scout timeout | If agent takes > 60s, does the UI hang? | Should show error eventually |
| Analyst fails mid-analysis | Hard to force -- check if property page handles missing analysis | "No analysis yet" message shown |
| Advisor returns empty | Send a nonsensical string | Fallback message displayed |

### 5.4 Rate Limiting

| Test | Action | Expected |
|------|--------|----------|
| Rapid scout requests | Click "Scout Now" 5 times quickly | Button disables during request, only one fires |
| Rapid advisor messages | Send 5 messages quickly | Input disables during request, only one fires |
| Multiple Deep Analyze | Click "Deep Analyze" on 3 different cards rapidly | Each should queue or be handled (currently relies on `loading` flag) |

### 5.5 Lighthouse Scores

Run Lighthouse (Chrome DevTools > Lighthouse) on the Dashboard page and record:

| Metric | Target | Actual |
|--------|--------|--------|
| Performance | > 70 | _____ |
| Accessibility | > 80 | _____ |
| Best Practices | > 80 | _____ |
| SEO | > 70 | _____ |

**Note:** Performance may be impacted by the 500KB+ bundle size. Record the exact bundle size from the Network tab.

---

## Appendix: Quick Reference

### All Routes

| Route | Page | Auth Required |
|-------|------|--------------|
| `/login` | Login | No |
| `/` | Dashboard | Yes |
| `/scout` | Market Scouting | Yes |
| `/property/:id` | Property Deal Card | Yes |
| `/pipeline` | Pipeline Kanban | Yes |
| `/map` | Map View | Yes |
| `/contacts` | Contacts CRM | Yes |
| `/predictions` | Predictions Tracker | Yes |
| `/watchlists` | Watchlists | Yes |

### AI Agents

| Agent | Function | Trigger |
|-------|----------|---------|
| `agent-scout` | Searches for investment properties in a market | Scout Now button |
| `agent-analyst` | Full flip/rental ROI analysis on a property | Deep Analyze button |
| `agent-enricher` | Census, FRED, HUD, BLS, FEMA, Walk Score data | Called during analysis |
| `agent-advisor` | Chat-based real estate advisor | Advisor panel |
| `agent-tracker` | Tracks prediction accuracy | After entering actual value |
| `agent-autoscout` | Nightly auto-scout for watchlists | pg_cron (NOT YET ACTIVE) |

### Known Issues (Pre-Existing)

1. Watchlists migration may need manual apply
2. pg_cron not configured -- autoscout does not run automatically
3. Bundle size > 500KB (no code-splitting)
4. Some enricher data sources return partial results if API keys not configured
5. Street View is a placeholder (Google integration not implemented)
