# Human Tester report — http://localhost:4321/
**Score: 25/100 (Poor)** · 20 pages · 4 critical · 19 major · 12 minor · 72 checks passed · 293s

## User journeys
| Persona | Journey | Result | Detail |
|---|---|---|---|
| explorer | explore | ✅ passed | Visited 10 page(s) |
| explorer | clickAll | ✅ passed | Clicked 4 element(s), 1 did nothing |
| explorer | search | ✅ passed | Searched "Ceramic", nonsense, and odd characters |
| explorer | filters | ✅ passed | Tried 6 filter/sort/pagination control(s) |
| signup | signup | ✅ passed | Created account testhuman+mvomxshy9863@example.com |
| signup | login | ✅ passed | Logged in as testhuman+mvomxshy9863@example.com |
| signup | exploreLoggedIn | ✅ passed | Visited 15 page(s), 8 only visible after login |
| signup | clickAllLoggedIn | ✅ passed | Clicked 0 element(s), 0 did nothing |
| signup | crud | ✅ passed | Created "Item HTXSROXK" via "+ New note" and tried editing it |
| signup | upload | ✅ passed | Uploaded a normal file, a 12 MB file and a .exe on /profile |
| signup | editProfile | ❌ failed | Edit did not persist after reload |
| signup | forgotPassword | ✅ passed | Requested a reset for a real and a fake email |
| privacy | signup | ✅ passed | Created account testhuman+mvomzfs77299@example.com |
| privacy | crud | ✅ passed | Created "Item HTCU16GU" via "+ New note" and tried editing it |
| privacy | signup | ✅ passed | Created account testhuman+mvomzsfr4143@example.com |
| privacy | privacy | ❌ failed | 2 leak(s) of one user's data |
| crowd | crowd | ✅ passed | 5 users browsed and signed up simultaneously — 30 page loads, 0 server errors |
| mobile | explore | ✅ passed | Visited 10 page(s) |
| mobile | clickAll | ✅ passed | Clicked 4 element(s), 1 did nothing |
| mobile | mobileChecks | ✅ passed | Phone layout checks run |
| keyboard | keyboard | ✅ passed | Tabbed through 10 element(s) |
| keyboard | a11y | ✅ passed | Accessibility checks run |
| messy | forms | ✅ passed | Submitted 16 messy form attempt(s) |
| impatient | performance | ✅ passed | Measured 4 page(s) on throttled network |
| impatient | doubleClick | ✅ passed | Back/refresh behaviour checked |
| safari | crossBrowser | ⏭️ skipped | Safari engine not installed here (run: npx playwright install webkit) |
| firefox | crossBrowser | ⏭️ skipped | Firefox engine not installed here (run: npx playwright install firefox) |
| ai | aiAgent | ⏭️ skipped | Set ANTHROPIC_API_KEY to let an AI end-user explore with its own goals |

## Top improvements
1. **[critical] Private data visible to another logged-in user** — Every database query must filter by the logged-in user (e.g. WHERE user_id = current user / Supabase Row Level Security), and private pages must require login. _(1 page)_
2. **[critical] Private data visible to a logged-out visitor** — Every database query must filter by the logged-in user (e.g. WHERE user_id = current user / Supabase Row Level Security), and private pages must require login. _(1 page)_
3. **[critical] Form crashes the server with very long text input** — Validate and sanitise input on the server; return a friendly 400 error instead of crashing. _(1 page)_
4. **[critical] Form is vulnerable to script injection (XSS)** — Escape user input before showing it on the page. Never use innerHTML with user data. _(1 page)_
5. **[major] Page scrolls sideways on phones** — Find the element wider than the screen (often a table, image or fixed-width div) and add max-width:100% / overflow-x:auto. _(9 pages)_
6. **[major] Broken image(s)** — Fix or remove the image URLs — users see empty boxes. _(2 pages)_
7. **[major] Placeholder / unfinished text found** — Replace dummy text before launch — it looks unfinished to real users. (Common in AI-generated sites.) _(1 page)_
8. **[major] Form field(s) without a label** — Add a visible <label for> to each field — placeholders disappear when typing and screen readers may skip them. _(1 page)_
9. **[major] Page not found (404)** — Fix or remove the link pointing here, or add the page. _(1 page)_
10. **[major] Uncaught JavaScript exception** — An uncaught exception stops the rest of the script — fix the root cause or add error handling. _(1 page)_

## All issues
- **critical** · security · Private data visible to another logged-in user — http://localhost:4321/notes
  - User A's data ("HTCU16GU") was shown to another logged-in user at this URL.
- **critical** · security · Private data visible to a logged-out visitor — http://localhost:4321/notes/5
  - User A's data ("HTCU16GU") was shown to a logged-out visitor at this URL.
- **critical** · validation · Form crashes the server with very long text input — http://localhost:4321/contact
  - 500 POST http://localhost:4321/contact
- **critical** · security · Form is vulnerable to script injection (XSS) — http://localhost:4321/contact
  - Typing <script>alert("ht-xss")</script> executed JavaScript.
- **major** · broken · 1 broken image(s) — http://localhost:4321/
  - http://localhost:4321/hero.png
- **major** · broken · 1 broken image(s) — http://localhost:4321/about
  - http://localhost:4321/team.jpg
- **major** · content · Placeholder / unfinished text found — http://localhost:4321/about
  - Found "Lorem ipsum".
- **major** · accessibility · 2 form field(s) without a label — http://localhost:4321/contact
  - 2 rely only on placeholder text.
- **major** · broken · Page not found (404) — http://localhost:4321/team
  - Linked from http://localhost:4321/about
- **major** · javascript · Uncaught JavaScript exception — http://localhost:4321/
  - openCart is not defined
- **major** · javascript · Clicking "Open cart" causes a JavaScript error — http://localhost:4321/
  - openCart is not defined
- **major** · upload · A 12 MB file crashes the upload — http://localhost:4321/profile
- **major** · journey · Profile changes are not saved — http://localhost:4321/profile
  - Changed a field to "Editedmz5g1", saved, reloaded — the old value came back.
- **major** · mobile · Page scrolls sideways on phones — http://localhost:4321/
  - Content is 531px wide on a 390px screen.
- **major** · mobile · Page scrolls sideways on phones — http://localhost:4321/about
  - Content is 531px wide on a 390px screen.
- **major** · mobile · Page scrolls sideways on phones — http://localhost:4321/products
  - Content is 916px wide on a 390px screen.
- **major** · mobile · Page scrolls sideways on phones — http://localhost:4321/contact
  - Content is 531px wide on a 390px screen.
- **major** · mobile · Page scrolls sideways on phones — http://localhost:4321/login
  - Content is 531px wide on a 390px screen.
- **major** · mobile · Page scrolls sideways on phones — http://localhost:4321/signup
  - Content is 531px wide on a 390px screen.
- **major** · mobile · Page scrolls sideways on phones — http://localhost:4321/products?page=2
  - Content is 916px wide on a 390px screen.
- **major** · mobile · Page scrolls sideways on phones — http://localhost:4321/forgot
  - Content is 531px wide on a 390px screen.
- **major** · mobile · Page scrolls sideways on phones — http://localhost:4321/products?page=1
  - Content is 916px wide on a 390px screen.
- **major** · validation · Form #2 accepts empty submission — http://localhost:4321/contact
- **minor** · accessibility · 1 image(s) without alt text — http://localhost:4321/about
- **minor** · ux · 1 link(s) that go nowhere — http://localhost:4321/about
  - href is missing or "#".
- **minor** · ux · "Subscribe to newsletter" does nothing when clicked — http://localhost:4321/
  - No page change, no network request, no new content.
- **minor** · ux · Filter/sort "Sort products" changes nothing — http://localhost:4321/products
- **minor** · ux · Filter/sort "Sort products" changes nothing — http://localhost:4321/products?page=2
- **minor** · ux · Filter/sort "Sort products" changes nothing — http://localhost:4321/products?page=1
- **minor** · mobile · 5 tap targets are too small — http://localhost:4321/
- **minor** · mobile · 4 tap targets are too small — http://localhost:4321/contact
- **minor** · mobile · 5 tap targets are too small — http://localhost:4321/login
- **minor** · mobile · 6 tap targets are too small — http://localhost:4321/signup
- **minor** · mobile · 4 tap targets are too small — http://localhost:4321/forgot
- **minor** · accessibility · 3 elements have no visible focus outline — http://localhost:4321/
- **info** · polish · No favicon — http://localhost:4321/
- **info** · accessibility · Heading levels skip — http://localhost:4321/products
  - 1 jump(s), e.g. H1 → H3.
- **info** · accessibility · Heading levels skip — http://localhost:4321/products?page=2
  - 1 jump(s), e.g. H1 → H3.
- **info** · accessibility · Heading levels skip — http://localhost:4321/products?page=1
  - 1 jump(s), e.g. H1 → H3.

## What works
- ✅ Has a page title — http://localhost:4321/
- ✅ Has one clear H1 heading — http://localhost:4321/
- ✅ Has a page title — http://localhost:4321/about
- ✅ Has one clear H1 heading — http://localhost:4321/about
- ✅ Has a page title — http://localhost:4321/products
- ✅ Has one clear H1 heading — http://localhost:4321/products
- ✅ All images load — http://localhost:4321/products
- ✅ Has a page title — http://localhost:4321/contact
- ✅ Has one clear H1 heading — http://localhost:4321/contact
- ✅ All images load — http://localhost:4321/contact
- ✅ Has a page title — http://localhost:4321/login
- ✅ Has one clear H1 heading — http://localhost:4321/login
- ✅ All images load — http://localhost:4321/login
- ✅ Has a page title — http://localhost:4321/signup
- ✅ Has one clear H1 heading — http://localhost:4321/signup
- ✅ All images load — http://localhost:4321/signup
- ✅ Has a page title — http://localhost:4321/products?page=2
- ✅ Has one clear H1 heading — http://localhost:4321/products?page=2
- ✅ All images load — http://localhost:4321/products?page=2
- ✅ Has a page title — http://localhost:4321/forgot
- ✅ Has one clear H1 heading — http://localhost:4321/forgot
- ✅ All images load — http://localhost:4321/forgot
- ✅ Has a page title — http://localhost:4321/products?page=1
- ✅ Has one clear H1 heading — http://localhost:4321/products?page=1
- ✅ All images load — http://localhost:4321/products?page=1
- ✅ "Show more" responds to clicks — http://localhost:4321/
- ✅ "Careers" responds to clicks — http://localhost:4321/about
- ✅ Search finds "Ceramic" — http://localhost:4321/
- ✅ Pagination works — http://localhost:4321/
- ✅ Pagination works — http://localhost:4321/products
- ✅ Pagination works — http://localhost:4321/products?page=1
- ✅ Empty sign-up is rejected — http://localhost:4321/signup
- ✅ New user can sign up — http://localhost:4321/signup
- ✅ Wrong password is rejected with a message — http://localhost:4321/login
- ✅ Existing user can log in — http://localhost:4321/login
- ✅ Has a page title — http://localhost:4321/notes
- ✅ Has one clear H1 heading — http://localhost:4321/notes
- ✅ All images load — http://localhost:4321/notes
- ✅ Has a page title — http://localhost:4321/profile
- ✅ Has one clear H1 heading — http://localhost:4321/profile
- ✅ All images load — http://localhost:4321/profile
- ✅ Has a page title — http://localhost:4321/notes/new
- ✅ Has one clear H1 heading — http://localhost:4321/notes/new
- ✅ All images load — http://localhost:4321/notes/new
- ✅ Has a page title — http://localhost:4321/notes/1
- ✅ Has one clear H1 heading — http://localhost:4321/notes/1
- ✅ All images load — http://localhost:4321/notes/1
- ✅ Has a page title — http://localhost:4321/notes/2
- ✅ Has one clear H1 heading — http://localhost:4321/notes/2
- ✅ All images load — http://localhost:4321/notes/2
- ✅ Has a page title — http://localhost:4321/notes/3
- ✅ Has one clear H1 heading — http://localhost:4321/notes/3
- ✅ All images load — http://localhost:4321/notes/3
- ✅ Has a page title — http://localhost:4321/notes/1/edit
- ✅ Has one clear H1 heading — http://localhost:4321/notes/1/edit
- ✅ All images load — http://localhost:4321/notes/1/edit
- ✅ Has a page title — http://localhost:4321/notes/2/edit
- ✅ Has one clear H1 heading — http://localhost:4321/notes/2/edit
- ✅ All images load — http://localhost:4321/notes/2/edit
- ✅ User can create content ("+ New note") — http://localhost:4321/notes
- ✅ User can edit what they created — http://localhost:4321/notes
- ✅ Uploading photo.png works — http://localhost:4321/profile
- ✅ Forgot-password sends a reset message — http://localhost:4321/forgot
- ✅ Handles 5 simultaneous users (slowest 1.2s) — http://localhost:4321/
- ✅ 5 people signed up at the same moment — http://localhost:4321/signup
- ✅ 10 elements reachable by keyboard — http://localhost:4321/
- ✅ Form #2 blocks empty submission — http://localhost:4321/login
- ✅ Loads in 1.7s on slow network — http://localhost:4321/
- ✅ Loads in 1.7s on slow network — http://localhost:4321/about
- ✅ Loads in 1.4s on slow network — http://localhost:4321/products
- ✅ Loads in 1.4s on slow network — http://localhost:4321/contact
- ✅ Back button works — http://localhost:4321/about