# Human Tester

**Human-like tester for websites and apps built with AI.**

Human Tester sends a crowd of virtual users into your website. They don't just load pages — they behave like real people with different needs: they click every button, open every page, sign up for an account, log out, log back in, edit their profile, type messy data into forms, use a phone, use only a keyboard, and suffer slow internet. Then you get a clear report: **what works, what's broken, and what to improve.**

Built for sites made with Lovable, Replit, Bolt, v0, Cursor, Claude and other AI builders — where things *look* finished but buttons go nowhere, forms crash, and sign-up silently fails.

![score](https://img.shields.io/badge/virtual%20users-6-4f46e5) ![license](https://img.shields.io/badge/license-MIT-green)

---

## The virtual users

| User | What they need | What they test |
|---|---|---|
| 🧭 **Explorer** | Look around | Crawls every page, clicks every button/toggle/menu, broken links & images, JS errors, dead buttons |
| 🙋 **New customer** | Get an account | Finds *Sign up*, tries an empty form, creates a real account, logs out, wrong password, logs in, refreshes, edits profile and checks it saved |
| 📱 **Phone user** | Use it on mobile | iPhone-size screen, sideways scrolling, tiny buttons, tiny text, viewport tag |
| ⌨️ **Keyboard user** | Accessibility | Tab-only navigation, focus traps, visible focus, labels, alt text, heading order |
| 🤪 **Messy user** | Types anything | Empty forms, bad emails, 5,000-char text, emoji, `<script>` (XSS), SQL-like input — catches crashes and injection |
| 🐢 **Impatient user** | Slow internet | Throttled network load times, page weight, Back button, refresh errors |

## What you get

A folder with:

- `index.html` — visual report: score, every journey ✅/❌, **Top improvements**, all issues with screenshots, and everything that works
- `report.md` — the same as Markdown (great for GitHub PRs and the Actions summary)
- `report.json` / `summary.json` — machine-readable, for dashboards
- `shots/` — screenshots of failures

Set `ANTHROPIC_API_KEY` and the report also gets an **AI review**: what's working, what to fix first (with prompts you can paste back into your AI builder), and UX improvement ideas.

## Quick start

```bash
git clone https://github.com/chandrayelchuri/human-tester && cd human-tester
npm install
npx playwright install chromium

node bin/human-tester.js https://your-site.com
open human-tester-report/index.html
```

Options:

```bash
--personas explorer,signup,mobile   # pick users (default: all)
--max-pages 40                      # crawl limit
--login-email you@x.com --login-password ...   # test with an existing account
--signup-url /register --login-url /signin      # if links are hidden
--unsafe          # ALSO click delete / pay / checkout (only on test/staging sites!)
--headed          # watch the browser do it
--fail-under 70   # exit 1 for CI if score < 70
--config ht.json  # all options from a file
```

### Try it on the bundled buggy demo

```bash
node demo/server.js &      # a tiny shop with 14 planted bugs
node bin/human-tester.js http://localhost:4321 --out reports/demo
```

It finds the server crash, the XSS hole, the profile that never saves, the dead "Subscribe" button, the JS error on "Open cart", the 404 link, broken images, "Lorem ipsum", sideways scrolling on phones and more. See [`reports/demo/report.md`](reports/demo/report.md).

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

- **Critical** — server crashes (5xx), XSS, wrong password accepted, sign-up/log-in impossible
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

- Multiple simultaneous users (load + race conditions)
- Visual regression (compare screenshots between runs)
- Native mobile apps via Appium
- Checkout flows with Stripe test cards on test-mode sites

MIT licensed.
