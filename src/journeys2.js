// More end-user skills: logged-in use, creating & editing things, search, filters,
// uploads, forgot password, crowds of simultaneous users, privacy between accounts,
// and other browsers.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { goto, shot, explore, clickAll, signup, login, closeOverlays } from './journeys.js';
import { pageChecks } from './checks.js';
import { makeIdentity } from './personas.js';
import {
  DESTRUCTIVE, LOGOUT, SIGNUP, LOGIN, PROFILE, SUCCESS_TEXT, ERROR_TEXT,
  normalizeUrl, settle, sleep, fillForm, findSubmit, findByText, visibleText,
} from './utils.js';

const CREATE = /^\s*(\+\s*)?(add|new|create|post|write|compose|publish|upload|start|book|submit|list)\b|\b(add new|create new|new (post|item|project|note|task|listing|ad|entry|record|booking|order))\b|^\s*\+\s*$/i;
const EDIT = /^\s*(edit|update|modify|rename|change)\b|✏️|✎/i;
const NO_RESULTS = /no (results|matches|items|records|products|listings|posts)|nothing (was )?found|0 results|couldn'?t find|did not match|no .* found/i;
const FORGOT = /forgot|reset (your )?password|trouble (signing|logging) in|can'?t (sign|log) in/i;

const allPages = (state) => [...new Set([...state.visitedAuthed, ...state.visited])];

// ---------- logged-in crawl & clicks: test the app behind the login ----------
export async function exploreLoggedIn(ctx) {
  if (!ctx.loggedIn && !ctx.state.loggedIn) return ctx.F.journey(ctx.persona, 'exploreLoggedIn', 'skipped', 'Not logged in');
  // start from where login landed, then the home page
  const start = ctx.page.url();
  await explore(ctx, { loggedIn: true, start });
  if (ctx.state.visitedAuthed.size < 3) await explore(ctx, { loggedIn: true });
}

export async function clickAllLoggedIn(ctx) {
  const urls = [...ctx.state.privateUrls];
  if (!urls.length) return ctx.F.journey(ctx.persona, 'clickAllLoggedIn', 'skipped', 'No extra pages behind login');
  await clickAll(ctx, { urls, name: 'clickAllLoggedIn' });
}

// ---------- create & edit: use the things the site lets users make ----------
const STRONG_CREATE = /^\s*(\+\s*)?(add|new|create|compose|write|post)\b|^\s*\+\s*$/i;
async function findCreateButton(page, strongOnly) {
  const els = await page.$$('a, button, [role=button]');
  for (const el of els) {
    const t = ((await el.innerText().catch(() => '')) || (await el.getAttribute('aria-label')) || '').trim();
    if (!t || t.length > 40) continue;
    if (SIGNUP.test(t) || LOGIN.test(t) || LOGOUT.test(t) || DESTRUCTIVE.test(t)) continue;
    if ((strongOnly ? STRONG_CREATE : CREATE).test(t) && (await el.isVisible().catch(() => false))) return { el, text: t };
  }
  return null;
}

// the main content form on a page — not the header search box, not a login form
async function contentForm(page) {
  for (const f of await page.$$('form')) {
    if (!(await f.isVisible().catch(() => false))) continue;
    const skip = await f.evaluate((n) => n.getAttribute('role') === 'search' || !!n.querySelector('input[type=password]') ||
      [...n.querySelectorAll('input:not([type=hidden]):not([type=submit]), textarea, select')].every((i) => i.type === 'search' || /search|^q$/i.test(i.name)));
    if (!skip) return f;
  }
  return null;
}

export async function crud(ctx) {
  const { F, persona, page, state, opts } = ctx;
  if (!ctx.loggedIn && !state.loggedIn) return F.journey(persona, 'crud', 'skipped', 'Not logged in');
  const marker = 'HT' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const pages = [...new Set([page.url(), ...state.privateUrls, ...allPages(state)])].slice(0, 15);
  // look for a clear "New / Add / Create" first, then weaker verbs like "Upload" or "Book"
  for (const [u, strong] of [...pages.map((x) => [x, true]), ...pages.map((x) => [x, false])]) {
    if (!(await goto(ctx, u))) continue;
    const btn = await findCreateButton(page, strong);
    if (!btn) continue;
    const url = u;
    ctx.current = `${url} → "${btn.text}"`;
    await btn.el.click().catch(() => {});
    await settle(page);
    const form = await contentForm(page);
    if (!form) continue;
    // The marker goes FIRST in every value, so it is still visible when an app shows only a first word or cuts text short.
    const id = { ...makeIdentity(), fullName: `${marker} Test`, message: `${marker} created by Human Tester`, company: `${marker} Co` };
    await fillForm(form, id);
    const firstText = await form.$('input[type=text]:visible, input:not([type]):visible, textarea:visible');
    if (firstText) await firstText.fill(`${marker} Item`).catch(() => {});
    const s = await findSubmit(form);
    if (!s) continue;
    const srv0 = ctx.serverErrorCount;
    await s.click().catch(() => {});
    await settle(page, 900);
    if (ctx.serverErrorCount > srv0) {
      F.issue({ severity: 'critical', category: 'journey', persona, page: url, title: `Creating something via "${btn.text}" crashes the server`, detail: ctx.lastServerError, suggestion: 'Check the create endpoint logs; validate input and return a friendly error.' });
      return F.journey(persona, 'crud', 'failed', `"${btn.text}" → server error`);
    }
    let where = (await visibleText(page)).includes(marker) ? page.url() : null;
    // A real person reads the message: if the app explains why it can't add this (e.g. a limit is reached), that's a clear answer, not a lost item.
    const refusal = where ? '' : await page.evaluate(() => [...document.querySelectorAll('[role=alert], [aria-live=assertive], [data-sonner-toast]')]
      .map((e) => e.innerText.trim()).filter((t) => t.length > 8)[0] || '').catch(() => '');
    if (refusal) {
      F.issue({ severity: 'info', category: 'journey', persona, page: url, title: `"${btn.text}" was refused with a clear message`, detail: refusal.slice(0, 200), suggestion: 'Fine if this is a real limit; otherwise check why it was refused.' });
      await closeOverlays(page); continue;
    }
    if (!where) { await goto(ctx, url); if ((await visibleText(page)).includes(marker)) where = url; }
    if (!where) {
      F.issue({ severity: 'major', category: 'journey', persona, page: url, title: `Item created with "${btn.text}" never shows up`, detail: `Filled the form with "${marker} Item" and submitted. It did not appear afterwards or after reloading.`, suggestion: 'Make sure the item is saved and the list re-fetches after creating (or show a clear error).', screenshot: await shot(ctx, 'create-missing') });
      return F.journey(persona, 'crud', 'failed', `Created via "${btn.text}" but it never appeared`);
    }
    F.pass({ category: 'journey', persona, page: url, title: `User can create content ("${btn.text}")` });
    // remember where this user's private item lives — used by the privacy test
    const links = await page.$$eval('a[href]', (as, m) => as.filter((a) => (a.closest('li,tr,article,.card,div')?.innerText || a.innerText).includes(m)).map((a) => a.href), marker).catch(() => []);
    state.created.push({ marker, urls: [...new Set([where, ...links.map((h) => normalizeUrl(h)).filter(Boolean)])].slice(0, 6), owner: ctx.account?.email || state.account?.email });
    // edit it — open the item first if the list has no Edit button
    const findEdit = () => page.$$('a, button').then(async (els) => {
      for (const el of els) {
        const t = ((await el.innerText().catch(() => '')) || (await el.getAttribute('aria-label')) || '').trim();
        if (EDIT.test(t) && (await el.isVisible().catch(() => false))) return el;
      }
      return null;
    });
    let editBtn = await findEdit();
    const itemLink = state.created.at(-1).urls.find((x) => x !== where);
    if (!editBtn && itemLink) { await goto(ctx, itemLink); editBtn = await findEdit(); }
    if (editBtn) {
      await editBtn.click().catch(() => {});
      await settle(page);
      const f = await contentForm(page);
      // Change every box that holds our marker: the app may display a different one (e.g. a preferred name).
      const fields = f ? await f.$$(`input[value*="${marker}"]`) : [];
      if (!fields.length && f) { const ta = await f.$('textarea'); if (ta) fields.push(ta); }
      const field = fields[0];
      if (field) {
        for (const el of fields) await el.fill(`${marker} edited`).catch(() => {});
        const s2 = await findSubmit(f);
        if (s2) await s2.click().catch(() => {});
        await settle(page, 800);
        await page.reload().catch(() => {});
        await settle(page);
        if ((await visibleText(page)).includes(`${marker} edited`)) F.pass({ category: 'journey', persona, page: url, title: 'User can edit what they created' });
        else F.issue({ severity: 'major', category: 'journey', persona, page: page.url(), title: 'Edits to a created item are not saved', suggestion: 'Check the update endpoint writes to the database and the page shows fresh data.' });
      }
    }
    return F.journey(persona, 'crud', 'passed', `Created "Item ${marker}" via "${btn.text}"${editBtn ? ' and tried editing it' : ''}`);
  }
  F.journey(persona, 'crud', 'skipped', 'No "Add / New / Create" action found for logged-in users');
}

// ---------- search ----------
const SEARCH_SEL = 'input[type=search], input[name*=search i], input[placeholder*=search i], input[aria-label*=search i], [role=search] input, input[name=q]';

export async function search(ctx) {
  const { F, persona, page, state } = ctx;
  for (const url of allPages(state).slice(0, 12)) {
    if (!(await goto(ctx, url))) continue;
    const box = await page.$(SEARCH_SEL);
    if (!box || !(await box.isVisible().catch(() => false))) continue;
    // pick real words from the site's content (list items, headings, cards — not the menu)
    if (!state.searchWords) {
      state.searchWords = [];
      for (const u of allPages(state).slice(0, 8)) {
        if (!(await goto(ctx, u))) continue;
        const words = await page.evaluate(() => {
          const stop = new Set(['about', 'contact', 'login', 'search', 'privacy', 'terms', 'welcome', 'please', 'there', 'their', 'which', 'would', 'products', 'notes', 'account', 'results', 'previous', 'next']);
          const els = [...document.querySelectorAll('main li, main h2, main h3, main td, article h2, article h3, .card, li, h2, h3, td')].filter((e) => !e.closest('nav, header, footer, form'));
          return els.flatMap((e) => (e.innerText.match(/\b[A-Za-z]{4,14}\b/g) || [])).filter((w) => !stop.has(w.toLowerCase()));
        });
        state.searchWords.push(...words);
      }
      state.searchWords = [...new Set(state.searchWords)];
    }
    const run = async (q) => {
      await goto(ctx, url);
      const b = await page.$(SEARCH_SEL);
      const srv0 = ctx.serverErrorCount;
      await b.fill(q);
      await b.press('Enter');
      await settle(page, 900);
      return { crashed: ctx.serverErrorCount > srv0, text: await visibleText(page) };
    };
    const tries = state.searchWords.slice(0, 3);
    if (!tries.length) tries.push('test');
    let found = null, crashed = false;
    for (const w of tries) {
      const r = await run(w);
      if (r.crashed) { crashed = true; break; }
      if (new RegExp(w, 'i').test(r.text) && !NO_RESULTS.test(r.text)) { found = w; break; }
    }
    const word = found || tries.join('", "');
    if (crashed) F.issue({ severity: 'critical', category: 'search', persona, page: url, title: 'Search crashes the server', suggestion: 'Check the search endpoint logs.' });
    else if (found) F.pass({ category: 'search', persona, page: url, title: `Search finds "${found}"` });
    else F.issue({ severity: 'major', category: 'search', persona, page: url, title: 'Search finds nothing for words that are on the site', detail: `Tried "${word}" — all appear on the site, none were found.`, suggestion: 'Check the search covers the content users see (titles, descriptions) and is case-insensitive.' });
    const none = await run('zqxjvw');
    if (!none.crashed && !NO_RESULTS.test(none.text)) F.issue({ severity: 'minor', category: 'search', persona, page: url, title: 'No "no results" message', suggestion: 'When nothing matches, say so ("No results for …") and suggest something else.' });
    for (const odd of [`%'"<>`, '   ', 'a'.repeat(300)]) {
      const r = await run(odd);
      if (r.crashed) { F.issue({ severity: 'critical', category: 'search', persona, page: url, title: 'Search crashes on special characters', detail: `Input: ${odd.slice(0, 40)}`, suggestion: 'Escape or parameterise the search query on the server.' }); break; }
    }
    return F.journey(persona, 'search', 'passed', `Searched "${word}", nonsense, and odd characters`);
  }
  F.journey(persona, 'search', 'skipped', 'No search box found');
}

// ---------- filters, sorting, tabs, pagination ----------
export async function filters(ctx) {
  const { F, persona, page, state } = ctx;
  let tried = 0;
  for (const url of allPages(state).slice(0, 10)) {
    if (!(await goto(ctx, url))) continue;
    const selects = await page.$$('select:visible');
    for (const sel of selects.slice(0, 3)) {
      if (await sel.evaluate((s) => !!s.closest('form') && !s.onchange)) continue; // part of a form → covered by form tests
      const opts = await sel.$$eval('option', (os) => os.map((o) => o.value));
      if (opts.length < 2) continue;
      const before = await page.evaluate(() => location.href + document.body.innerText.length);
      await sel.selectOption(opts[opts.length - 1]).catch(() => {});
      await settle(page, 700);
      tried++;
      const after = await page.evaluate(() => location.href + document.body.innerText.length).catch(() => before);
      const label = (await sel.getAttribute('aria-label')) || (await sel.getAttribute('name')) || 'dropdown';
      if (after === before) F.issue({ severity: 'minor', category: 'ux', persona, page: url, title: `Filter/sort "${label}" changes nothing`, suggestion: 'Changing a filter or sort should visibly update the list.' });
      else F.pass({ category: 'interaction', persona, page: url, title: `Filter/sort "${label}" updates the page` });
      if (page.url() !== url) await goto(ctx, url);
    }
    const next = await page.$('a[rel=next], a:text-is("Next"), a:text-is("2"), button:text-is("Next"), a:text-is("›"), a:text-is("»"), button:text-is("Load more"), button:text-is("Show more")');
    if (next && (await next.isVisible().catch(() => false))) {
      const before = await page.evaluate(() => location.href + document.body.innerText.length);
      const srv0 = ctx.serverErrorCount;
      await next.click().catch(() => {});
      await settle(page, 700);
      tried++;
      const after = await page.evaluate(() => location.href + document.body.innerText.length).catch(() => before);
      if (ctx.serverErrorCount > srv0) F.issue({ severity: 'critical', category: 'broken', persona, page: url, title: 'Next page / Load more crashes', suggestion: 'Check pagination offsets on the server.' });
      else if (after === before) F.issue({ severity: 'minor', category: 'ux', persona, page: url, title: 'Pagination / "Load more" does nothing', suggestion: 'Make sure the next page of results loads.' });
      else F.pass({ category: 'interaction', persona, page: url, title: 'Pagination works' });
    }
  }
  F.journey(persona, 'filters', tried ? 'passed' : 'skipped', tried ? `Tried ${tried} filter/sort/pagination control(s)` : 'No filters, sorting or pagination found');
}

// ---------- file uploads ----------
function testFiles(dir) {
  fs.mkdirSync(dir, { recursive: true });
  // a real 1×1 PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(`${dir}/photo.png`, png);
  fs.writeFileSync(`${dir}/document.pdf`, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  fs.writeFileSync(`${dir}/program.exe`, 'MZ not really a program');
  fs.writeFileSync(`${dir}/huge-photo.png`, Buffer.concat([png, zlib.gzipSync(Buffer.alloc(1)), Buffer.alloc(12 * 1024 * 1024)]));
  return dir;
}

export async function upload(ctx) {
  const { F, persona, page, state, opts } = ctx;
  const dir = testFiles(`${opts.out}/.upload-files`);
  for (const url of allPages(state).slice(0, 20)) {
    if (!(await goto(ctx, url))) continue;
    const input = await page.$('input[type=file]');
    if (!input) continue;
    const accept = (await input.getAttribute('accept')) || '';
    const good = /pdf/.test(accept) && !/image/.test(accept) ? 'document.pdf' : 'photo.png';
    const attempt = async (file) => {
      await goto(ctx, url);
      const inp = await page.$('input[type=file]');
      await inp.setInputFiles(`${dir}/${file}`).catch(() => {});
      const form = await inp.evaluateHandle((n) => n.closest('form'));
      const el = form.asElement();
      if (el) await fillForm(el, makeIdentity());
      const s = el ? await findSubmit(el) : null;
      const srv0 = ctx.serverErrorCount;
      if (s) await s.click().catch(() => {});
      await settle(page, 1200);
      return { crashed: ctx.serverErrorCount > srv0, text: await visibleText(page), submitted: !!s };
    };
    const ok = await attempt(good);
    if (ok.crashed) F.issue({ severity: 'critical', category: 'upload', persona, page: url, title: 'Uploading a normal file crashes the server', detail: good, suggestion: 'Check upload size limits, storage credentials and the upload endpoint logs.' });
    else if (ERROR_TEXT.test(ok.text) && !SUCCESS_TEXT.test(ok.text)) F.issue({ severity: 'major', category: 'upload', persona, page: url, title: `Uploading a normal file (${good}) fails`, detail: (ok.text.match(/[^\n]*(error|invalid|failed)[^\n]*/i) || [''])[0].slice(0, 200), suggestion: 'Make sure common file types upload successfully.' });
    else F.pass({ category: 'upload', persona, page: url, title: `Uploading ${good} works` });
    const big = await attempt('huge-photo.png');
    if (big.crashed) F.issue({ severity: 'major', category: 'upload', persona, page: url, title: 'A 12 MB file crashes the upload', suggestion: 'Set a size limit and show "File too large (max X MB)" instead of crashing.' });
    const bad = await attempt('program.exe');
    if (bad.crashed) F.issue({ severity: 'major', category: 'upload', persona, page: url, title: 'Wrong file type crashes the upload', suggestion: 'Reject unsupported types with a friendly message.' });
    else if (!accept && SUCCESS_TEXT.test(bad.text) && !ERROR_TEXT.test(bad.text)) F.issue({ severity: 'minor', category: 'security', persona, page: url, title: 'Upload accepts a .exe file', suggestion: 'Restrict uploads to the types you need (accept="image/*" plus a server-side check).' });
    return F.journey(persona, 'upload', 'passed', `Uploaded a normal file, a 12 MB file and a .exe on ${new URL(url).pathname}`);
  }
  F.journey(persona, 'upload', 'skipped', 'No file upload fields found');
}

// ---------- forgot password ----------
export async function forgotPassword(ctx) {
  const { F, persona, page, state, opts, context } = ctx;
  const loginUrl = state.loginUrl || (opts.loginUrl && new URL(opts.loginUrl, opts.url).toString());
  if (!loginUrl) return F.journey(persona, 'forgotPassword', 'skipped', 'No log-in page known');
  const ctx2 = await ctx.spawn('signup');
  try {
    await goto(ctx2, loginUrl);
    const link = await findByText(ctx2.page, FORGOT);
    if (!link) {
      F.issue({ severity: 'major', category: 'journey', persona, page: loginUrl, title: 'No "Forgot password?" link on the log-in page', suggestion: 'Users who forget their password are locked out forever. Add a reset flow.' });
      return F.journey(persona, 'forgotPassword', 'failed', 'No forgot-password link');
    }
    await link.click().catch(() => {});
    await settle(ctx2.page);
    const resetUrl = ctx2.page.url();
    const send = async (email) => {
      await goto(ctx2, resetUrl);
      const input = await ctx2.page.$('input[type=email], input[name*=mail i], form input[type=text]');
      if (!input) return null;
      await input.fill(email);
      const s = await findSubmit((await ctx2.page.$('form')) || ctx2.page);
      const srv0 = ctx2.serverErrorCount;
      if (s) await s.click().catch(() => {}); else await input.press('Enter');
      await settle(ctx2.page, 900);
      return { crashed: ctx2.serverErrorCount > srv0, text: await visibleText(ctx2.page) };
    };
    const real = await send(state.account?.email || opts.loginEmail || 'testhuman@example.com');
    if (!real) return F.journey(persona, 'forgotPassword', 'failed', 'Reset page has no email field');
    if (real.crashed) {
      F.issue({ severity: 'critical', category: 'journey', persona, page: resetUrl, title: 'Password reset crashes the server', suggestion: 'Check the reset endpoint and email provider settings.' });
      return F.journey(persona, 'forgotPassword', 'failed', 'Server error');
    }
    if (/sent|check your (e-?mail|inbox)|reset link|reset code|if (an|that) (account|email) exists|instructions/i.test(real.text)) F.pass({ category: 'journey', persona, page: resetUrl, title: 'Forgot-password sends a reset message' });
    else F.issue({ severity: 'minor', category: 'ux', persona, page: resetUrl, title: 'No confirmation after requesting a password reset', suggestion: 'Tell users "If that email has an account, we sent a reset link."' });
    const fake = await send(`nobody-${Date.now()}@example.com`);
    if (fake && /not (found|registered|exist)|no (account|user)/i.test(fake.text)) F.issue({ severity: 'info', category: 'security', persona, page: resetUrl, title: 'Password reset reveals which emails have accounts', suggestion: 'Show the same message for every email so attackers can\'t discover your users.' });
    F.journey(persona, 'forgotPassword', 'passed', 'Requested a reset for a real and a fake email');
  } finally {
    await ctx2.close();
  }
}

// ---------- crowd: many people at the same time ----------
async function quickSignup(sub, signupUrl) {
  await goto(sub, signupUrl);
  const form = (await sub.page.$('form:has(input[type=password])')) || (await sub.page.$('form'));
  if (!form) return false;
  const id = makeIdentity();
  await fillForm(form, id);
  const s = await findSubmit(form);
  if (!s) return false;
  await s.click().catch(() => {});
  await settle(sub.page, 800);
  const ok = (await findByText(sub.page, LOGOUT)) || (sub.page.url() !== signupUrl && !(await sub.page.$('input[type=password]:visible').catch(() => null))) || SUCCESS_TEXT.test(await visibleText(sub.page));
  return !!ok;
}

export async function crowd(ctx) {
  const { F, persona, state, opts } = ctx;
  const n = opts.crowd || 5;
  const pages = allPages(state);
  if (!pages.length) return F.journey(persona, 'crowd', 'skipped', 'No pages to visit');
  const loads = [...F.pages.values()].map((p) => p.loadMs).filter(Boolean).sort((a, b) => a - b);
  const baseline = loads[Math.floor(loads.length / 2)] || 1000;
  const subs = await Promise.all(Array.from({ length: n }, () => ctx.spawn('crowd')));
  const times = [];
  let srv = 0, signOk = 0, signTried = 0;
  try {
    await Promise.all(subs.map(async (sub, i) => {
      const srv0 = sub.serverErrorCount;
      for (let k = 0; k < Math.min(6, pages.length); k++) {
        const url = pages[(i * 3 + k) % pages.length];
        const r = await goto(sub, url);
        if (r) times.push(r.ms);
      }
      if (state.signupUrl) { signTried++; if (await quickSignup(sub, state.signupUrl)) signOk++; }
      srv += sub.serverErrorCount - srv0;
    }));
  } finally {
    await Promise.all(subs.map((s) => s.close()));
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)] || 0;
  const page = opts.url;
  if (srv) F.issue({ severity: 'critical', category: 'load', persona, page, title: `Site errors when ${n} people use it at once`, detail: `${srv} server error(s) during simultaneous use. Last: ${ctx.lastServerError || ''}`, suggestion: 'Check database connection limits, race conditions and serverless cold starts.' });
  if (p95 > Math.max(4000, baseline * 3)) F.issue({ severity: 'major', category: 'load', persona, page, title: `Slows down badly with ${n} users at once`, detail: `Slowest pages took ${(p95 / 1000).toFixed(1)}s vs ${(baseline / 1000).toFixed(1)}s for one user.`, suggestion: 'Cache pages, add database indexes, or upgrade the hosting plan.' });
  else F.pass({ category: 'load', persona, page, title: `Handles ${n} simultaneous users (slowest ${(p95 / 1000).toFixed(1)}s)` });
  if (signTried && signOk < signTried) F.issue({ severity: 'major', category: 'load', persona, page: state.signupUrl, title: `Only ${signOk} of ${signTried} simultaneous sign-ups succeeded`, suggestion: 'Sign-ups at the same moment fail — check unique constraints, rate limits and transactions.' });
  else if (signTried) F.pass({ category: 'load', persona, page: state.signupUrl, title: `${signTried} people signed up at the same moment` });
  F.journey(persona, 'crowd', srv ? 'failed' : 'passed', `${n} users browsed${signTried ? ' and signed up' : ''} simultaneously — ${times.length} page loads, ${srv} server errors`);
}

// ---------- privacy: user A's data must stay private ----------
export async function privacy(ctx) {
  const { F, persona, state, opts } = ctx;
  if (!state.signupUrl && !opts.loginEmail) return F.journey(persona, 'privacy', 'skipped', 'Needs a working sign-up to create two accounts');
  // User A: sign up, create something, note their private pages
  const A = await ctx.spawn('privacy');
  let secrets = [], urls = [];
  try {
    A.account = await signup(A);
    if (!A.account) return F.journey(persona, 'privacy', 'skipped', 'Could not create user A');
    if (!A.loggedIn) await login(A, { creds: A.account, quiet: true });
    secrets = [A.account.email, A.account.identity.lastName];
    urls.push(A.page.url());
    const prof = await findByText(A.page, PROFILE);
    if (prof) { await prof.click().catch(() => {}); await settle(A.page); urls.push(A.page.url()); }
    const before = state.created.length;
    await crud(A);
    for (const c of state.created.slice(before)) { secrets.push(c.marker); urls.push(...c.urls); }
  } finally {
    await A.close();
  }
  urls = [...new Set(urls.map((u) => normalizeUrl(u)).filter(Boolean))];
  const leaks = [];
  const check = async (who, sub) => {
    for (const url of [...urls, ...[...state.privateUrls].slice(0, 10)]) {
      const r = await goto(sub, url);
      if (!r || r.status >= 400) continue;
      const text = await visibleText(sub.page);
      const hit = secrets.find((s) => s && text.includes(s));
      if (hit) { leaks.push({ who, url, hit }); break; }
    }
  };
  // User B: different account
  const B = await ctx.spawn('privacy');
  try {
    B.account = await signup(B);
    if (B.account) await check('another logged-in user', B);
  } finally {
    await B.close();
  }
  // Logged-out visitor
  const anon = await ctx.spawn('privacy');
  try { await check('a logged-out visitor', anon); } finally { await anon.close(); }

  for (const l of leaks) {
    F.issue({ severity: 'critical', category: 'security', persona, page: l.url, title: `Private data visible to ${l.who}`, detail: `User A's data ("${l.hit}") was shown to ${l.who} at this URL.`, suggestion: 'Every database query must filter by the logged-in user (e.g. WHERE user_id = current user / Supabase Row Level Security), and private pages must require login.' });
  }
  if (!leaks.length) F.pass({ category: 'security', persona, page: opts.url, title: `User A's data stayed private (checked ${urls.length} URL(s) as user B and logged out)` });
  F.journey(persona, 'privacy', leaks.length ? 'failed' : 'passed', leaks.length ? `${leaks.length} leak(s) of one user's data` : `Two accounts + logged-out visitor, ${urls.length} private URL(s) checked`);
}

// ---------- other browsers (Safari engine, Firefox) ----------
export async function crossBrowser(ctx) {
  const { F, persona, state, opts } = ctx;
  if (ctx.unavailable) return F.journey(persona, 'crossBrowser', 'skipped', ctx.unavailable);
  const pages = [...state.visited].slice(0, 10);
  let broken = 0;
  for (const url of pages) {
    const e0 = ctx.errorCount;
    const r = await goto(ctx, url);
    if (!r) { broken++; continue; }
    const len = await ctx.page.evaluate(() => document.body?.innerText.trim().length || 0).catch(() => 0);
    if (len < 30 && r.status < 400) {
      broken++;
      F.issue({ severity: 'major', category: 'browser', persona, page: url, title: `Page is blank in ${ctx.browserLabel}`, suggestion: `It works in Chrome — likely an unsupported JavaScript or CSS feature in ${ctx.browserLabel}.`, screenshot: await shot(ctx, 'blank') });
    } else if (ctx.errorCount > e0) broken++;
  }
  await pageChecks(ctx.page, opts.url, persona, F);
  F.journey(persona, 'crossBrowser', broken ? 'failed' : 'passed', `${pages.length - broken}/${pages.length} pages work in ${ctx.browserLabel}`);
}
