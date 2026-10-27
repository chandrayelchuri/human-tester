# Human Tester

**Acts as real end users to test websites and apps built with AI.**

Human Tester sends a crowd of virtual end users into your site — several at the same time. They behave like real people with different needs: they open every page, click every button, search, filter, sign up, log out and back in, use every page behind the login, create and edit things, upload files, reset their password, type messy data, use a phone, use only a keyboard, use Safari and Firefox, and suffer slow internet. Two separate customers check that they can't see each other's data. With an API key, an AI end-user reads each page like a person and tries to reach real goals on its own. Then you get a clear report: **what works, what's broken, and what to improve.**

Built for sites made with Lovable, Replit, Bolt, v0, Cursor, Claude and other AI builders — where things *look* finished but buttons go nowhere, forms crash, sign-up silently fails, and one customer can see another customer's data.

![users](https://img.shields.io/badge/virtual%20users-11-4f46e5) ![license](https://img.shields.io/badge/license-MIT-green)

---

## The virtual end users

| User | What they need | What they test |
|---|---|---|
| 🧭 **Explorer** | Look around | Crawls every page, clicks every button/toggle/menu, **search** (real words, nonsense, odd characters), **filters, sorting, pagination**, broken links & images, JS errors, dead buttons |
| 🙋 **New customer → regular user** | Get an account and use the app | Sign-up incl. **multi-step onboarding**, empty-form check, logs out, wrong password, logs in, refresh, **crawls & clicks every page behind the login**, **creates something and edits it**, **uploads files** (normal, 12 MB, .exe), edits profile, **forgot password** |
| 🔒 **Two customers + a stranger** | Privacy | User A signs up and creates data; **user B and a logged-out visitor must not see it** — catches the #1 bug in AI-built apps |
| 👥 **Crowd** | Many people at once | 5+ users browse and **sign up simultaneously** — crashes, slowdowns, failed sign-ups |
| 📱 **Phone user** | Use it on mobile | iPhone-size screen, sideways scrolling, tiny buttons, tiny text, viewport tag |
| ⌨️ **Keyboard user** | Accessibility | Tab-only navigation, focus traps, visible focus, labels, alt text, heading order |
| 🤪 **Messy user** | Types anything | Empty forms, bad emails, 5,000-char text, emoji, `<script>` (XSS), SQL-like input |
| 🐢 **Impatient user** | Slow internet | Throttled load times, page weight, Back button, refresh errors |
| 🧭 **Safari user** | iPhone/Mac browser | Every page in the Safari (WebKit) engine — blank pages, errors |
| 🦊 **Firefox user** | Firefox | Every page in Firefox |
| 🤖 **AI end-user** | Real goals | Reads each page like a person and tries to *achieve* goals (sign up, book, buy with test data, post…) without being told how; reports where it got confused. Needs `ANTHROPIC_API_KEY` |

## What you get

A folder with:

- `index.html` — visual report: score, every journey ✅/❌, **Top improvements**, all issues with screenshots, and everything that works
- `report.md` — the same as Markdown (great for GitHub PRs and the Actions summary)
- `report.json` / `summary.json` — machine-readable, for dashboards
- `shots/` — screenshots of failures

Set `ANTHROPIC_API_KEY` to turn on the AI end-user, and the report also gets an **AI review**: what's working, what to fix first (with prompts you can paste back into your AI builder), and UX improvement ideas.

## Quick start

```bash
git clone https://github.com/chandrayelchuri/human-tester && cd human-tester
npm install
npx playwright install chromium firefox webkit

node bin/human-tester.js https://your-site.com
open human-tester-report/index.html
```

Options:

```bash
--personas explorer,signup,mobile   # pick users (default: all)
--max-pages 40                      # crawl limit
--login-email you@x.com --login-password ...   # test with an existing account
--signup-url /register --login-url /signin      # if links are hidden
--crowd 10        # simultaneous users for the crowd test (default 5)
--goals "Book a cleaning appointment|Post a classified ad"   # goals for the AI end-user
--unsafe          # ALSO click delete / pay / checkout (only on test/staging sites!)
--chrome-path /usr/bin/google-chrome   # use an installed Chrome (or set HT_CHROME_PATH)
--headed          # watch the browser do it
--fail-under 70   # exit 1 for CI if score < 70
--config ht.json  # all options from a file
```

### Try it on the bundled buggy demo

```bash
node demo/server.js &      # a tiny shop with ~20 planted bugs
node bin/human-tester.js http://localhost:4321 --out reports/demo
```

It finds the server crash, the XSS hole, **one user's notes visible to other users and to logged-out visitors**, the 12 MB upload crash, the sort dropdown that does nothing, the profile that never saves, the dead "Subscribe" button, the JS error on "Open cart", the 404 link, broken images, "Lorem ipsum", sideways scrolling on phones and more. See [`reports/demo/report.md`](reports/demo/report.md).

## Acting like a real person

Human Tester tries hard not to report things a real user wouldn't call a bug:

- Disabled buttons and buttons that are already selected (`aria-pressed`, `aria-selected`, `aria-current`) are not clicked — they are meant to do nothing.
- Text boxes (including search comboboxes) are typed into, not "clicked".
- A pop-up opened by one click is closed (Escape) before the next button; if a notice or animation is in the way, it waits a moment and tries again.
- Sign-up leaves "(optional)" boxes — referral, coupon, promo or discount codes — empty, and every virtual user has its own street address (many apps allow one account per address).
- Created items are tagged with a marker at the **start** of each value, so they are still found when an app shows only a first name or shortens text; edits change every box holding the marker.
- A link that starts a file download (e.g. a CSV export) counts as working.
- A 400/409/422/429 answer from an API is the app politely refusing bad input — not a "missing resource".
- If Chrome can't start at all, it stops with a clear message instead of a report full of skipped tests.

## Use it in GitHub Actions

```yaml
- uses: chandrayelchuri/human-tester@main
  with:
    url: https://staging.your-site.com
    fail-under: 70
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}   # optional
```

The Markdown report appears in the job summary and the full HTML report is uploaded as an artifact. This repo also has a **"Test a site"** workflow you can run from the Actions tab with any URL.

## Add it to your admin dashboard

Run the API (Docker or Node):

```bash
HT_API_TOKEN=change-me node bin/human-tester.js serve --port 8787
# or
docker build -t human-tester . && docker run -p 8787:8787 -e HT_API_TOKEN=change-me -v $PWD/runs:/data human-tester
```

| Endpoint | |
|---|---|
| `POST /api/runs` `{ "url": "...", "personas": "all" }` | start a test → `{ id }` |
| `GET /api/runs` | all runs with score & counts |
| `GET /api/runs/:id?full=1` | status + full report JSON |
| `GET /reports/:id/` | the HTML report (embed in an iframe) |

Then drop [`dashboard/widget.html`](dashboard/widget.html) into your admin page: a URL box, a "Run test" button, a table of past runs with scores, and the report inline. Proxy the token through your backend rather than putting it in browser code.

## How it decides

- **Critical** — server crashes (5xx), XSS, one user's data visible to others, wrong password accepted, sign-up/log-in impossible, errors under simultaneous use
- **Major** — JS errors, 404s, broken images, unsaved edits, missing labels, sideways scrolling, placeholder text
- **Minor** — dead buttons, small tap targets, slow pages, missing alt text, focus outlines
- **Info** — favicon, heading order, nice-to-haves

Score = 100 × e^(−penalty/90), so a couple of serious bugs hurt a lot while a long tail of nitpicks doesn't zero you out.

## Safety

- Only test sites **you own or have permission to test.** It creates real accounts and submits real forms.
- By default it **never** clicks delete, pay, purchase, checkout, unsubscribe or log-out buttons. `--unsafe` turns that off — use it only on staging.
- It skips sign-up/log-in when a CAPTCHA is present rather than trying to defeat it.
- Test accounts use `testhuman+<id>@mailinator.com` style emails so they are easy to find and delete.

## Roadmap

- Native iPhone/Android apps via Appium (today: mobile web and PWAs)
- Visual regression (compare screenshots between runs)
- Checkout flows with Stripe test cards on test-mode sites
- Email verification via a test inbox

MIT licensed.
