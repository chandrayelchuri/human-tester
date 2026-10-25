# Human Tester report — http://localhost:4321/
**Score: 39/100 (Poor)** · 8 pages · 2 critical · 10 major · 10 minor · 35 checks passed · 142s

## User journeys
| Persona | Journey | Result | Detail |
|---|---|---|---|
| explorer | explore | ✅ passed | Visited 7 page(s) |
| explorer | clickAll | ✅ passed | Clicked 4 element(s), 1 did nothing |
| signup | signup | ✅ passed | Created account testhuman+mvoefr1n8564@example.com |
| signup | login | ✅ passed | Logged in as testhuman+mvoefr1n8564@example.com |
| signup | editProfile | ❌ failed | Edit did not persist after reload |
| mobile | explore | ✅ passed | Visited 7 page(s) |
| mobile | clickAll | ✅ passed | Clicked 4 element(s), 1 did nothing |
| mobile | mobileChecks | ✅ passed | Phone layout checks run |
| keyboard | keyboard | ✅ passed | Tabbed through 9 element(s) |
| keyboard | a11y | ✅ passed | Accessibility checks run |
| messy | forms | ✅ passed | Submitted 24 messy form attempt(s) |
| impatient | performance | ✅ passed | Measured 4 page(s) on throttled network |
| impatient | doubleClick | ✅ passed | Back/refresh behaviour checked |

## Top improvements
1. **[critical] Form crashes the server with very long text input** — Validate and sanitise input on the server; return a friendly 400 error instead of crashing. _(1 page)_
2. **[critical] Form is vulnerable to script injection (XSS)** — Escape user input before showing it on the page. Never use innerHTML with user data. _(1 page)_
3. **[major] Broken image(s)** — Fix or remove the image URLs — users see empty boxes. _(2 pages)_
4. **[major] Placeholder / unfinished text found** — Replace dummy text before launch — it looks unfinished to real users. (Common in AI-generated sites.) _(1 page)_
5. **[major] Form field(s) without a label** — Add a visible <label for> to each field — placeholders disappear when typing and screen readers may skip them. _(1 page)_
6. **[major] Page not found (404)** — Fix or remove the link pointing here, or add the page. _(1 page)_
7. **[major] Uncaught JavaScript exception** — An uncaught exception stops the rest of the script — fix the root cause or add error handling. _(1 page)_
8. **[major] Clicking "Open cart" causes a JavaScript error** — Open the browser console, click this element, and fix the error shown. _(1 page)_
9. **[major] Profile changes are not saved** — Check the update API actually writes to the database and the page reads fresh data. _(1 page)_
10. **[major] Page scrolls sideways on phones** — Find the element wider than the screen (often a table, image or fixed-width div) and add max-width:100% / overflow-x:auto. _(1 page)_

## All issues
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
- **major** · journey · Profile changes are not saved — http://localhost:4321/profile
  - Changed a field to "Editedefypp", saved, reloaded — the old value came back.
- **major** · mobile · Page scrolls sideways on phones — http://localhost:4321/products
  - Content is 916px wide on a 390px screen.
- **major** · validation · Form #1 accepts empty submission — http://localhost:4321/contact
- **minor** · accessibility · 1 image(s) without alt text — http://localhost:4321/about
- **minor** · ux · 1 link(s) that go nowhere — http://localhost:4321/about
  - href is missing or "#".
- **minor** · ux · "Subscribe to newsletter" does nothing when clicked — http://localhost:4321/
  - No page change, no network request, no new content.
- **minor** · mobile · 9 tap targets are too small — http://localhost:4321/
- **minor** · mobile · 6 tap targets are too small — http://localhost:4321/about
- **minor** · mobile · 6 tap targets are too small — http://localhost:4321/products
- **minor** · mobile · 8 tap targets are too small — http://localhost:4321/contact
- **minor** · mobile · 9 tap targets are too small — http://localhost:4321/login
- **minor** · mobile · 10 tap targets are too small — http://localhost:4321/signup
- **minor** · accessibility · 3 elements have no visible focus outline — http://localhost:4321/
- **info** · polish · No favicon — http://localhost:4321/
- **info** · accessibility · Heading levels skip — http://localhost:4321/products
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
- ✅ "Show more" responds to clicks — http://localhost:4321/
- ✅ "Careers" responds to clicks — http://localhost:4321/about
- ✅ Empty sign-up is rejected — http://localhost:4321/signup
- ✅ New user can sign up — http://localhost:4321/signup
- ✅ Wrong password is rejected with a message — http://localhost:4321/login
- ✅ Existing user can log in — http://localhost:4321/login
- ✅ Fits phone screen width — http://localhost:4321/
- ✅ Fits phone screen width — http://localhost:4321/about
- ✅ Fits phone screen width — http://localhost:4321/contact
- ✅ Fits phone screen width — http://localhost:4321/login
- ✅ Fits phone screen width — http://localhost:4321/signup
- ✅ 9 elements reachable by keyboard — http://localhost:4321/
- ✅ Form #1 blocks empty submission — http://localhost:4321/login
- ✅ Form #1 blocks empty submission — http://localhost:4321/signup
- ✅ Loads in 1.7s on slow network — http://localhost:4321/
- ✅ Loads in 1.7s on slow network — http://localhost:4321/about
- ✅ Loads in 1.4s on slow network — http://localhost:4321/products
- ✅ Loads in 1.4s on slow network — http://localhost:4321/contact
- ✅ Back button works — http://localhost:4321/about