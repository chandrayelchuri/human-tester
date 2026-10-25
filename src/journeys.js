// Journeys = the things real people try to do on a site.
import { pageChecks, mobileChecks } from './checks.js';
import { MESSY_INPUTS, makeIdentity } from './personas.js';
import {
  DESTRUCTIVE, LOGOUT, SIGNUP, LOGIN, PROFILE, SUCCESS_TEXT, ERROR_TEXT,
  sameOrigin, normalizeUrl, settle, sleep, fillForm, findSubmit, findByText, visibleText,
} from './utils.js';

const CAPTCHA = 'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], .g-recaptcha, .h-captcha, .cf-turnstile';

async function goto(ctx, url) {
  const t0 = Date.now();
  const res = await ctx.page.goto(url, { waitUntil: 'domcontentloaded', timeout: ctx.opts.timeout }).catch((e) => ({ _err: e }));
  await settle(ctx.page);
  const ms = Date.now() - t0;
  if (res && res._err) {
    ctx.F.issue({ severity: 'critical', category: 'broken', persona: ctx.persona, page: url, title: 'Page failed to load', detail: String(res._err.message).split('\n')[0], suggestion: 'Check the server is up and the URL is correct.' });
    return null;
  }
  const status = res ? res.status() : 0;
  ctx.F.page(url, { status, loadMs: ms, persona: ctx.persona });
  if (status >= 500) ctx.F.issue({ severity: 'critical', category: 'broken', persona: ctx.persona, page: url, title: `Server error ${status}`, suggestion: 'Check server logs for this route — users see a crash page.' });
  else if (status === 404) ctx.F.issue({ severity: 'major', category: 'broken', persona: ctx.persona, page: url, title: 'Page not found (404)', detail: ctx.state.linkedFrom.get(url) ? `Linked from ${ctx.state.linkedFrom.get(url)}` : '', suggestion: 'Fix or remove the link pointing here, or add the page.' });
  else if (status >= 400) ctx.F.issue({ severity: 'major', category: 'broken', persona: ctx.persona, page: url, title: `HTTP ${status}`, suggestion: 'This page returns an error status.' });
  return { status, ms };
}

async function shot(ctx, name) {
  if (!ctx.opts.screenshots) return undefined;
  const file = `shots/${ctx.persona}-${name}-${Date.now()}.png`.replace(/[^a-zA-Z0-9/._-]/g, '_');
  await ctx.page.screenshot({ path: `${ctx.opts.out}/${file}`, fullPage: false }).catch(() => {});
  return file;
}

// ---------- explore: crawl like a curious visitor ----------
export async function explore(ctx) {
  const { opts, state, F, persona } = ctx;
  const queue = [opts.url];
  const seen = new Set();
  while (queue.length && seen.size < opts.maxPages) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    ctx.current = url;
    const r = await goto(ctx, url);
    if (!r || r.status >= 400) continue;
    const landed = ctx.page.url();
    if (!sameOrigin(landed, opts.url)) continue;
    await pageChecks(ctx.page, url, persona, F, opts);
    if (opts.isMobile) await mobileChecks(ctx.page, url, persona, F);
    if (await ctx.page.$('form')) state.formPages.add(url);

    const links = await ctx.page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
    for (const href of links) {
      const abs = normalizeUrl(href, landed);
      if (!abs) continue;
      if (!sameOrigin(abs, opts.url)) {
        state.externalLinks.add(abs);
        continue;
      }
      if (LOGOUT.test(abs) || DESTRUCTIVE.test(abs) || /\.(pdf|zip|jpe?g|png|gif|svg|mp4|docx?|xlsx?)$/i.test(abs)) continue;
      if (!state.linkedFrom.has(abs)) state.linkedFrom.set(abs, url);
      if (!seen.has(abs)) queue.push(abs);
    }
    state.visited.add(url);
  }
  F.journey(persona, 'explore', 'passed', `Visited ${seen.size} page(s)`);
}

// ---------- clickAll: press every button / link-button ----------
async function tagClickables(page) {
  return page.evaluate(() => {
    const sel = 'button, [role=button], a[href="#"], a:not([href]), summary, input[type=button], [onclick], [data-toggle], [data-bs-toggle], [aria-expanded]';
    const out = [];
    document.querySelectorAll(sel).forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return;
      if (el.closest('form') && (el.type === 'submit' || (el.tagName === 'BUTTON' && !el.getAttribute('type')))) return; // forms are tested separately
      el.setAttribute('data-ht-id', String(i));
      out.push({ id: String(i), text: (el.innerText || el.value || el.getAttribute('aria-label') || el.title || el.tagName).trim().slice(0, 60) });
    });
    return out;
  });
}

export async function clickAll(ctx) {
  const { opts, state, F, persona, page } = ctx;
  const pages = [...state.visited].slice(0, opts.maxClickPages);
  let clicked = 0, dead = 0;
  for (const url of pages) {
    if (!(await goto(ctx, url))) continue;
    let items = await tagClickables(page);
    items = items.slice(0, opts.maxClicksPerPage);
    for (const item of items) {
      if (DESTRUCTIVE.test(item.text) && !opts.unsafe) continue;
      if (LOGOUT.test(item.text)) continue;
      if (page.url() !== url) {
        await goto(ctx, url);
        await tagClickables(page);
      }
      const el = await page.$(`[data-ht-id="${item.id}"]`);
      if (!el || !(await el.isVisible().catch(() => false))) continue;
      ctx.current = `${url} → click "${item.text}"`;
      const before = await page.evaluate(() => document.body.innerHTML.length + '|' + document.querySelectorAll('[aria-expanded="true"],[open],.show,.open,.active').length);
      const reqBefore = ctx.requestCount;
      const errBefore = ctx.errorCount;
      const popup = ctx.context.waitForEvent('page', { timeout: 1200 }).catch(() => null);
      const ok = await el.click({ timeout: 3000 }).then(() => true).catch(() => false);
      clicked++;
      await sleep(700);
      const newTab = await popup;
      if (newTab) await newTab.close().catch(() => {});
      if (!ok) {
        F.issue({ severity: 'minor', category: 'ux', persona, page: url, title: `Can't click "${item.text}"`, detail: 'Element is covered by something else or not interactive.', suggestion: 'Check for overlays, z-index issues, or elements hidden behind sticky headers.' });
        continue;
      }
      if (ctx.errorCount > errBefore) {
        F.issue({ severity: 'major', category: 'javascript', persona, page: url, title: `Clicking "${item.text}" causes a JavaScript error`, detail: ctx.lastError, suggestion: 'Open the browser console, click this element, and fix the error shown.', screenshot: await shot(ctx, 'click-error') });
        continue;
      }
      const after = page.url() === url ? await page.evaluate(() => document.body.innerHTML.length + '|' + document.querySelectorAll('[aria-expanded="true"],[open],.show,.open,.active').length).catch(() => before) : 'navigated';
      if (after === before && ctx.requestCount === reqBefore && !newTab) {
        dead++;
        F.issue({ severity: 'minor', category: 'ux', persona, page: url, title: `"${item.text}" does nothing when clicked`, detail: 'No page change, no network request, no new content.', suggestion: 'Wire this button up, or remove it — users think the site is broken.' });
      } else {
        F.pass({ category: 'interaction', persona, page: url, title: `"${item.text}" responds to clicks` });
      }
    }
  }
  F.journey(persona, 'clickAll', 'passed', `Clicked ${clicked} element(s), ${dead} did nothing`);
}

// ---------- signup ----------
export async function signup(ctx) {
  const { opts, state, F, persona, page } = ctx;
  await goto(ctx, opts.url);
  let link = opts.signupUrl ? null : await findByText(page, SIGNUP);
  if (opts.signupUrl) await goto(ctx, new URL(opts.signupUrl, opts.url).toString());
  else if (link) {
    await link.click().catch(() => {});
    await settle(page);
  } else {
    // a sign-up form might already be on another crawled page
    const guess = [...state.visited].find((u) => SIGNUP.test(u));
    if (guess) await goto(ctx, guess);
    else {
      F.journey(persona, 'signup', 'skipped', 'No sign-up / register link found');
      F.issue({ severity: 'info', category: 'journey', persona, page: opts.url, title: 'No sign-up option found', suggestion: 'If users should create accounts, make the "Sign up" button easy to find in the header. Or pass --signup-url.' });
      return;
    }
  }
  ctx.current = page.url() + ' (signup)';
  if (await page.$(CAPTCHA)) {
    F.journey(persona, 'signup', 'skipped', 'CAPTCHA present — automated sign-up intentionally not attempted');
    return;
  }
  const form = (await page.$('form:has(input[type=password])')) || (await page.$('form'));
  if (!form) {
    F.journey(persona, 'signup', 'failed', 'Sign-up page has no form');
    F.issue({ severity: 'critical', category: 'journey', persona, page: page.url(), title: 'Sign-up page has no form', suggestion: 'The sign-up link leads to a page with nothing to fill in.', screenshot: await shot(ctx, 'signup-noform') });
    return;
  }
  const signupUrl = page.url();
  // 1. Empty submit should be rejected
  const submit0 = await findSubmit(form);
  if (submit0) {
    await submit0.click().catch(() => {});
    await settle(page, 400);
    const invalid = await page.$$eval(':invalid', (e) => e.length).catch(() => 0);
    const txt = await visibleText(page);
    if (page.url() !== signupUrl && !invalid && !ERROR_TEXT.test(txt)) {
      F.issue({ severity: 'critical', category: 'validation', persona, page: signupUrl, title: 'Sign-up accepts an empty form', suggestion: 'Require email and password on both the browser (required attribute) and the server.' });
    } else F.pass({ category: 'validation', persona, page: signupUrl, title: 'Empty sign-up is rejected' });
    if (page.url() !== signupUrl) await goto(ctx, signupUrl);
  }
  // 2. Real sign-up
  const id = makeIdentity(new URL(opts.url).hostname);
  const f2 = (await page.$('form:has(input[type=password])')) || (await page.$('form'));
  await fillForm(f2, id);
  const submit = await findSubmit(f2);
  if (!submit) {
    F.journey(persona, 'signup', 'failed', 'No submit button');
    return;
  }
  const srvBefore = ctx.serverErrorCount;
  await submit.click().catch(() => {});
  await settle(page, 1000);
  const txt = await visibleText(page);
  const stillHasPwd = await page.$('input[type=password]:visible').catch(() => null);
  const loggedInSign = await findByText(page, LOGOUT);
  const success = loggedInSign || (SUCCESS_TEXT.test(txt) && !/error|invalid|failed/i.test(txt.slice(0, 600))) || (page.url() !== signupUrl && !stillHasPwd);
  if (ctx.serverErrorCount > srvBefore) {
    F.issue({ severity: 'critical', category: 'journey', persona, page: signupUrl, title: 'Sign-up crashes the server (5xx)', detail: ctx.lastServerError, suggestion: 'Check the registration endpoint logs.' });
  }
  if (success) {
    state.account = { email: id.email, username: id.username, password: id.password, identity: id };
    F.journey(persona, 'signup', 'passed', `Created account ${id.email}`);
    F.pass({ category: 'journey', persona, page: signupUrl, title: 'New user can sign up' });
  } else {
    const errLine = (txt.match(/[^\n]*(error|invalid|required|failed|taken|exists)[^\n]*/i) || [''])[0].slice(0, 200);
    F.journey(persona, 'signup', 'failed', errLine || 'No sign of success after submitting');
    F.issue({ severity: 'critical', category: 'journey', persona, page: signupUrl, title: 'New user could not sign up', detail: errLine || 'Filled every field with realistic data and submitted; no success message, redirect, or logged-in state.', suggestion: 'Try signing up yourself. If it needs email verification, show a clear "check your email" message.', screenshot: await shot(ctx, 'signup-fail') });
  }
}

// ---------- login (incl. wrong-password check) ----------
export async function login(ctx) {
  const { opts, state, F, persona, page, context } = ctx;
  const creds = opts.loginEmail ? { email: opts.loginEmail, username: opts.loginEmail, password: opts.loginPassword } : state.account;
  // log out by clearing cookies/storage — like a fresh visit
  await context.clearCookies();
  await goto(ctx, opts.url);
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  if (opts.loginUrl) await goto(ctx, new URL(opts.loginUrl, opts.url).toString());
  else {
    const link = await findByText(page, LOGIN);
    if (!link) {
      F.journey(persona, 'login', 'skipped', 'No log-in link found');
      return;
    }
    await link.click().catch(() => {});
    await settle(page);
  }
  const loginUrl = page.url();
  if (await page.$(CAPTCHA)) return F.journey(persona, 'login', 'skipped', 'CAPTCHA present');
  const pwd = await page.$('input[type=password]');
  if (!pwd) {
    F.journey(persona, 'login', 'failed', 'Log-in page has no password field');
    return;
  }
  const doLogin = async (password) => {
    const form = (await page.$('form:has(input[type=password])')) || page;
    const fields = await form.$$('input:not([type=hidden]):not([type=submit]):not([type=checkbox])');
    for (const f of fields) {
      const t = (await f.getAttribute('type')) || 'text';
      if (t === 'password') await f.fill(password).catch(() => {});
      else if (await f.isVisible()) await f.fill(creds?.email || 'nobody@example.com').catch(() => {});
    }
    const s = await findSubmit(form);
    if (s) await s.click().catch(() => {});
    else await page.keyboard.press('Enter');
    await settle(page, 900);
  };
  // wrong password must fail
  await doLogin('Wrong-Password-123!');
  const wrongTxt = await visibleText(page);
  const wrongIn = await findByText(page, LOGOUT);
  if (wrongIn) {
    F.issue({ severity: 'critical', category: 'security', persona, page: loginUrl, title: 'Log-in accepts a WRONG password', suggestion: 'Verify the password hash on the server before creating a session. This is a serious security hole.' });
  } else if (!ERROR_TEXT.test(wrongTxt)) {
    F.issue({ severity: 'minor', category: 'ux', persona, page: loginUrl, title: 'No clear message for a wrong password', suggestion: 'Show "Incorrect email or password" so users know what happened.' });
  } else F.pass({ category: 'security', persona, page: loginUrl, title: 'Wrong password is rejected with a message' });

  if (!creds) {
    F.journey(persona, 'login', 'skipped', 'No account to log in with (sign-up failed and no --login-email given)');
    return;
  }
  if (page.url() !== loginUrl) await goto(ctx, loginUrl);
  await doLogin(creds.password);
  const ok = (await findByText(page, LOGOUT)) || (!(await page.$('input[type=password]:visible').catch(() => null)) && page.url() !== loginUrl);
  if (ok) {
    state.loggedIn = true;
    F.journey(persona, 'login', 'passed', `Logged in as ${creds.email}`);
    F.pass({ category: 'journey', persona, page: loginUrl, title: 'Existing user can log in' });
    // session should survive a reload
    await page.reload().catch(() => {});
    await settle(page);
    if (await page.$('input[type=password]:visible').catch(() => null)) {
      F.issue({ severity: 'major', category: 'journey', persona, page: page.url(), title: 'User is logged out after refreshing the page', suggestion: 'Persist the session (cookie or token in storage) so a refresh keeps the user signed in.' });
    }
  } else {
    F.journey(persona, 'login', 'failed', 'Correct credentials did not log in');
    F.issue({ severity: 'critical', category: 'journey', persona, page: loginUrl, title: 'User cannot log in with correct credentials', detail: `Account ${creds.email}`, suggestion: 'Check the login endpoint, session cookie settings (SameSite/Secure), and redirect after login.', screenshot: await shot(ctx, 'login-fail') });
  }
}

// ---------- edit profile ----------
export async function editProfile(ctx) {
  const { opts, state, F, persona, page } = ctx;
  if (!state.loggedIn) return F.journey(persona, 'editProfile', 'skipped', 'Not logged in');
  const link = await findByText(page, PROFILE);
  if (!link) {
    F.journey(persona, 'editProfile', 'skipped', 'No profile/account/settings link found while logged in');
    F.issue({ severity: 'info', category: 'journey', persona, page: page.url(), title: 'Logged-in users have no visible profile/settings link', suggestion: 'Give users a clear "My account" area to update their details.' });
    return;
  }
  await link.click().catch(() => {});
  await settle(page);
  const profileUrl = page.url();
  const field = await page.$('form input[name*="name" i]:visible, form input[id*="name" i]:visible, form input[type=text]:visible');
  if (!field) return F.journey(persona, 'editProfile', 'skipped', 'Profile page has no editable text field');
  const newVal = 'Edited' + Date.now().toString(36).slice(-5);
  await field.fill(newVal);
  const form = await field.evaluateHandle((n) => n.closest('form'));
  const s = await findSubmit(form.asElement() || page);
  if (s) await s.click().catch(() => {});
  await settle(page, 800);
  await goto(ctx, profileUrl);
  const persisted = await page.evaluate((v) => [...document.querySelectorAll('input')].some((i) => i.value === v) || document.body.innerText.includes(v), newVal);
  if (persisted) {
    F.journey(persona, 'editProfile', 'passed', 'Profile edit saved and survived reload');
    F.pass({ category: 'journey', persona, page: profileUrl, title: 'User can edit and save their profile' });
  } else {
    F.journey(persona, 'editProfile', 'failed', 'Edit did not persist after reload');
    F.issue({ severity: 'major', category: 'journey', persona, page: profileUrl, title: 'Profile changes are not saved', detail: `Changed a field to "${newVal}", saved, reloaded — the old value came back.`, suggestion: 'Check the update API actually writes to the database and the page reads fresh data.', screenshot: await shot(ctx, 'profile-fail') });
  }
}

// ---------- forms: messy-data user ----------
export async function forms(ctx) {
  const { opts, state, F, persona, page } = ctx;
  const formPages = [...state.formPages].slice(0, opts.maxFormPages);
  if (!formPages.length) return F.journey(persona, 'forms', 'skipped', 'No forms found');
  let tested = 0;
  for (const url of formPages) {
    const r = await goto(ctx, url);
    if (!r) continue;
    const nForms = await page.$$eval('form', (f) => f.length);
    for (let fi = 0; fi < Math.min(nForms, 3); fi++) {
      for (const bad of [{ name: 'empty', value: '' }, ...MESSY_INPUTS.filter((m) => m.name !== 'empty')]) {
        await goto(ctx, url);
        const form = (await page.$$('form'))[fi];
        if (!form) break;
        const s = await findSubmit(form);
        if (!s) break;
        const sText = (await s.innerText().catch(() => '')) || (await s.getAttribute('value')) || '';
        if (DESTRUCTIVE.test(sText) && !opts.unsafe) break;
        ctx.current = `${url} form#${fi + 1} with ${bad.name}`;
        await fillForm(form, makeIdentity(), bad.value === '' ? '' : bad.value);
        const err0 = ctx.serverErrorCount;
        ctx.xssFired = false;
        await s.click({ timeout: 3000 }).catch(() => {});
        await settle(page, 500);
        tested++;
        if (ctx.xssFired) {
          F.issue({ severity: 'critical', category: 'security', persona, page: url, title: 'Form is vulnerable to script injection (XSS)', detail: `Typing ${bad.value} executed JavaScript.`, suggestion: 'Escape user input before showing it on the page. Never use innerHTML with user data.' });
        }
        if (ctx.serverErrorCount > err0) {
          F.issue({ severity: 'critical', category: 'validation', persona, page: url, title: `Form crashes the server with ${bad.name} input`, detail: ctx.lastServerError, suggestion: 'Validate and sanitise input on the server; return a friendly 400 error instead of crashing.' });
        }
        if (bad.name === 'empty') {
          const invalid = await page.$$eval(':invalid', (e) => e.length).catch(() => 0);
          const txt = await visibleText(page);
          const hasRequired = await page.$$eval('form [required]', (e) => e.length).catch(() => 0);
          if (!invalid && !ERROR_TEXT.test(txt) && SUCCESS_TEXT.test(txt)) {
            F.issue({ severity: 'major', category: 'validation', persona, page: url, title: `Form #${fi + 1} accepts empty submission`, suggestion: 'Mark required fields with `required` and validate on the server too.' });
          } else if (invalid || ERROR_TEXT.test(txt) || hasRequired) {
            F.pass({ category: 'validation', persona, page: url, title: `Form #${fi + 1} blocks empty submission` });
          }
        }
        if (bad.name === 'bad email') {
          const txt = await visibleText(page);
          const invalid = await page.$$eval(':invalid', (e) => e.length).catch(() => 0);
          const hasEmail = await page.$('input[type=email], input[name*=mail i]');
          if (hasEmail && !invalid && SUCCESS_TEXT.test(txt) && !ERROR_TEXT.test(txt)) {
            F.issue({ severity: 'minor', category: 'validation', persona, page: url, title: `Form #${fi + 1} accepts an invalid email`, suggestion: 'Use <input type="email"> and check the format on the server.' });
          }
        }
      }
    }
  }
  F.journey(persona, 'forms', 'passed', `Submitted ${tested} messy form attempt(s)`);
}

// ---------- keyboard-only ----------
export async function keyboard(ctx) {
  const { opts, F, persona, page } = ctx;
  await goto(ctx, opts.url);
  const seen = new Map();
  let noFocusRing = 0, repeats = 0, last = '';
  for (let i = 0; i < 50; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const st = getComputedStyle(el);
      const ring = (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0) || (st.boxShadow && st.boxShadow !== 'none');
      return { key: el.tagName + '|' + (el.id || el.innerText?.slice(0, 30) || el.name || ''), ring };
    });
    if (!info) continue;
    if (info.key === last) repeats++;
    else repeats = 0;
    last = info.key;
    if (repeats > 4) {
      F.issue({ severity: 'major', category: 'accessibility', persona, page: opts.url, title: 'Keyboard focus gets stuck', detail: `Focus trapped on ${info.key}`, suggestion: 'Make sure Tab moves forward and modals release focus when closed.' });
      break;
    }
    if (!seen.has(info.key)) {
      seen.set(info.key, info.ring);
      if (!info.ring) noFocusRing++;
    }
  }
  if (seen.size === 0) F.issue({ severity: 'major', category: 'accessibility', persona, page: opts.url, title: 'Nothing can be reached with the Tab key', suggestion: 'Use real <a>/<button> elements (or tabindex="0") for interactive items.' });
  else F.pass({ category: 'accessibility', persona, page: opts.url, title: `${seen.size} elements reachable by keyboard` });
  if (noFocusRing > 2) F.issue({ severity: 'minor', category: 'accessibility', persona, page: opts.url, title: `${noFocusRing} elements have no visible focus outline`, suggestion: 'Don\'t remove outline in CSS; add a clear :focus-visible style so keyboard users see where they are.' });
  F.journey(persona, 'keyboard', 'passed', `Tabbed through ${seen.size} element(s)`);
}

export async function a11y(ctx) {
  const { state, F, persona } = ctx;
  for (const url of [...state.visited].slice(0, 5)) {
    if (await goto(ctx, url)) await pageChecks(ctx.page, url, persona, F);
  }
  F.journey(persona, 'a11y', 'passed', 'Accessibility checks run');
}

export async function mobileChecksJourney(ctx) {
  const { state, F, persona } = ctx;
  for (const url of [...state.visited].slice(0, ctx.opts.maxPages)) {
    if (await goto(ctx, url)) await mobileChecks(ctx.page, url, persona, F);
  }
  F.journey(persona, 'mobileChecks', 'passed', 'Phone layout checks run');
}

// ---------- slow network + impatient behaviour ----------
export async function performance(ctx) {
  const { opts, state, F, persona, page } = ctx;
  const cdp = await ctx.context.newCDPSession(page).catch(() => null);
  if (cdp) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  }
  const urls = [...new Set([opts.url, ...state.visited])].slice(0, 4);
  for (const url of urls) {
    const r = await goto(ctx, url);
    if (!r) continue;
    const weight = await page.evaluate(() => performance.getEntriesByType('resource').reduce((s, e) => s + (e.transferSize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.transferSize || 0));
    const kb = Math.round(weight / 1024);
    if (r.ms > 10000) F.issue({ severity: 'major', category: 'performance', persona, page: url, title: `Very slow on mobile data (${(r.ms / 1000).toFixed(1)}s)`, detail: `${kb} KB transferred`, suggestion: 'Compress images, lazy-load below-the-fold content, and cut unused JavaScript.' });
    else if (r.ms > 5000) F.issue({ severity: 'minor', category: 'performance', persona, page: url, title: `Slow on mobile data (${(r.ms / 1000).toFixed(1)}s)`, detail: `${kb} KB transferred`, suggestion: 'Aim for under 3s on 3G/4G. Optimise images and defer non-critical scripts.' });
    else F.pass({ category: 'performance', persona, page: url, title: `Loads in ${(r.ms / 1000).toFixed(1)}s on slow network` });
    if (kb > 3000) F.issue({ severity: 'minor', category: 'performance', persona, page: url, title: `Heavy page (${(kb / 1024).toFixed(1)} MB)`, suggestion: 'Keep pages under ~1.5 MB; check large images, videos and bundles.' });
  }
  if (cdp) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {});
  F.journey(persona, 'performance', 'passed', `Measured ${urls.length} page(s) on throttled network`);
}

export async function doubleClick(ctx) {
  const { opts, state, F, persona, page } = ctx;
  const urls = [...new Set([...state.visited].map((u) => normalizeUrl(u)))];
  // back button works?
  if (urls.length >= 2) {
    await goto(ctx, urls[0]);
    await goto(ctx, urls[1]);
    await page.goBack().catch(() => {});
    await settle(page);
    if (normalizeUrl(page.url()) !== normalizeUrl(urls[0])) F.issue({ severity: 'minor', category: 'ux', persona, page: urls[1], title: 'Browser Back button does not return to previous page', detail: `Expected ${urls[0]}, got ${page.url()}`, suggestion: 'Use real URLs/routes for each screen so Back works as people expect.' });
    else F.pass({ category: 'ux', persona, page: urls[1], title: 'Back button works' });
  }
  // refresh every page — no errors
  for (const url of urls.slice(0, 5)) {
    await goto(ctx, url);
    const e0 = ctx.errorCount;
    await page.reload().catch(() => {});
    await settle(page);
    if (ctx.errorCount > e0) F.issue({ severity: 'major', category: 'javascript', persona, page: url, title: 'Page throws errors after refresh', detail: ctx.lastError, suggestion: 'Common in single-page apps when the server doesn\'t handle deep links — add a fallback route.' });
  }
  F.journey(persona, 'doubleClick', 'passed', 'Back/refresh behaviour checked');
}

export const JOURNEYS = { explore, clickAll, signup, login, editProfile, forms, keyboard, a11y, mobileChecks: mobileChecksJourney, performance, doubleClick };
