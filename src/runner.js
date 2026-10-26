import { chromium, firefox, webkit } from 'playwright';
import fs from 'node:fs';
import { Findings } from './findings.js';
import { PERSONAS, resolvePersonas } from './personas.js';
import { JOURNEYS as BASE, explore } from './journeys.js';
import * as more from './journeys2.js';
import { aiAgent } from './ai-agent.js';

const JOURNEYS = { ...BASE, exploreLoggedIn: more.exploreLoggedIn, clickAllLoggedIn: more.clickAllLoggedIn, crud: more.crud, search: more.search, filters: more.filters, upload: more.upload, forgotPassword: more.forgotPassword, crowd: more.crowd, privacy: more.privacy, crossBrowser: more.crossBrowser, aiAgent };
import { sameOrigin, normalizeUrl } from './utils.js';

export const DEFAULTS = {
  maxPages: 25,
  maxClickPages: 8,
  maxClicksPerPage: 25,
  maxFormPages: 5,
  timeout: 30000,
  headless: true,
  screenshots: true,
  unsafe: false,
  personas: 'all',
  out: 'human-tester-report',
};

function attachListeners(ctx, page) {
  const { F, opts } = ctx;
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/favicon|Failed to load resource/i.test(text)) return; // reported via network listener instead
    ctx.errorCount++;
    ctx.lastError = text.slice(0, 400);
    F.issue({ severity: 'major', category: 'javascript', persona: ctx.persona, page: (ctx.current || page.url()).split(' → ')[0], title: 'JavaScript error in console', detail: text.slice(0, 400), suggestion: 'Open DevTools → Console on this page and fix the error; it can silently break buttons and forms.' });
  });
  page.on('pageerror', (err) => {
    ctx.errorCount++;
    ctx.lastError = String(err.message).slice(0, 400);
    F.issue({ severity: 'major', category: 'javascript', persona: ctx.persona, page: (ctx.current || page.url()).split(' → ')[0], title: 'Uncaught JavaScript exception', detail: ctx.lastError, suggestion: 'An uncaught exception stops the rest of the script — fix the root cause or add error handling.' });
  });
  page.on('request', () => ctx.requestCount++);
  page.on('response', (res) => {
    const status = res.status();
    const url = res.url();
    const isDoc = res.request().resourceType() === 'document';
    if (status >= 500) {
      ctx.serverErrorCount++;
      ctx.lastServerError = `${status} ${res.request().method()} ${url}`;
      if (!isDoc) F.issue({ severity: 'critical', category: 'broken', persona: ctx.persona, page: (ctx.current || page.url()).split(' → ')[0], title: `API/server error ${status}`, detail: `${res.request().method()} ${url}\nWhile: ${ctx.current || ''}`, suggestion: 'Check server logs for this endpoint.' });
    } else if (status >= 400 && !isDoc && res.request().resourceType() !== 'image' && sameOrigin(url, opts.url) && !/favicon/.test(url) && ![401, 403].includes(status)) {
      F.issue({ severity: 'minor', category: 'broken', persona: ctx.persona, global: true, page: (ctx.current || page.url()).split(' → ')[0], title: `Missing resource (${status})`, detail: url, suggestion: 'A file or API the page asks for does not exist. Fix the path or remove the reference.' });
    }
  });
  page.on('requestfailed', (req) => {
    if (!sameOrigin(req.url(), opts.url)) return;
    const reason = req.failure()?.errorText || '';
    if (/aborted|cancel/i.test(reason)) return;
    F.issue({ severity: 'minor', category: 'broken', persona: ctx.persona, page: (ctx.current || page.url()).split(' → ')[0], title: 'Network request failed', detail: `${req.url()} — ${reason}`, suggestion: 'Check CORS, HTTPS certificates, and that the endpoint exists.' });
  });
  page.on('dialog', async (d) => {
    if (d.message().includes('ht-xss')) ctx.xssFired = true;
    await d.dismiss().catch(() => {});
  });
}

const browsers = new Map();
async function getBrowser(type, opts) {
  if (!browsers.has(type)) {
    const engine = { chromium, firefox, webkit }[type];
    browsers.set(type, engine.launch({ headless: opts.headless }).catch((e) => ({ _err: e })));
  }
  return browsers.get(type);
}

// A ctx is one virtual user: its own browser context (cookies), page and error counters.
async function makeCtx(name, opts, state, F) {
  const p = PERSONAS[name];
  const browser = await getBrowser(p.browser || 'chromium', opts);
  if (browser._err) {
    return { persona: name, F, state, opts, unavailable: `${p.browserLabel || p.browser} engine not installed here (run: npx playwright install ${p.browser})`, close: async () => {} };
  }
  const context = await browser.newContext({
    viewport: p.viewport,
    isMobile: !!p.isMobile && (p.browser || 'chromium') === 'chromium',
    hasTouch: !!p.hasTouch,
    userAgent: p.userAgent,
  });
  const page = await context.newPage();
  const ctx = {
    persona: name, page, context, F, state, browserLabel: p.browserLabel || 'Chrome',
    opts: { ...opts, isMobile: !!p.isMobile },
    errorCount: 0, serverErrorCount: 0, requestCount: 0,
    lastError: '', lastServerError: '', current: '', xssFired: false, loggedIn: false,
  };
  attachListeners(ctx, page);
  ctx.spawn = (n = name) => makeCtx(n, opts, state, F);
  ctx.close = () => context.close().catch(() => {});
  return ctx;
}

async function runPersona(name, opts, state, F, log) {
  const p = PERSONAS[name];
  const ctx = await makeCtx(name, opts, state, F);
  if (!ctx.unavailable && !state.visited.size && !p.journeys.includes('explore')) {
    log(`  [${name}] mapping the site first…`);
    await explore(ctx);
  }
  for (const j of p.journeys) {
    log(`  [${name}] ${j}…`);
    const t0 = Date.now();
    try {
      if (ctx.unavailable && j !== 'crossBrowser') F.journey(name, j, 'skipped', ctx.unavailable);
      else await JOURNEYS[j](ctx);
    } catch (e) {
      F.journey(name, j, 'failed', 'Tester error: ' + String(e.message).split('\n')[0]);
    }
    log(`  [${name}] ${j} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  await ctx.close();
}

async function checkExternalLinks(browser, state, F, opts) {
  const links = [...state.externalLinks].filter((u) => !/(facebook|instagram|linkedin|twitter|x)\.com/.test(u)).slice(0, 40);
  const ctx = await browser.newContext();
  for (const url of links) {
    try {
      const r = await ctx.request.get(url, { timeout: 10000, maxRedirects: 5 });
      if (r.status() === 404 || r.status() === 410 || r.status() >= 500) F.issue({ severity: 'minor', category: 'broken', persona: 'explorer', page: opts.url, title: `Broken external link (${r.status()})`, detail: url, suggestion: 'Update or remove links to pages that no longer exist.' });
    } catch {
      /* network blocked or timeout — don't count as broken */
    }
  }
  await ctx.close();
}

export async function run(userOpts, log = console.log) {
  const opts = { ...DEFAULTS, ...userOpts };
  if (!/^https?:\/\//.test(opts.url)) opts.url = 'https://' + opts.url;
  opts.url = normalizeUrl(opts.url);
  fs.mkdirSync(`${opts.out}/shots`, { recursive: true });
  const F = new Findings();
  const state = { visited: new Set(), visitedAuthed: new Set(), privateUrls: new Set(), formPages: new Set(), externalLinks: new Set(), linkedFrom: new Map(), created: [], account: null, loggedIn: false, signupUrl: null, loginUrl: null };
  browsers.clear();
  const started = new Date();
  const personas = resolvePersonas(opts.personas);
  // explorer maps the site and signup finds the account pages before the others need them
  const order = ['explorer', 'signup'];
  personas.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  log(`Human Tester → ${opts.url}`);
  log(`Personas: ${personas.join(', ')}`);
  for (const name of personas) {
    log(`\n▶ ${PERSONAS[name].label}`);
    await runPersona(name, opts, state, F, log);
  }
  if (opts.checkExternal !== false) await checkExternalLinks(await getBrowser('chromium', opts), state, F, opts);
  for (const b of browsers.values()) { const br = await b; if (!br._err) await br.close().catch(() => {}); }
  return {
    meta: {
      tool: 'human-tester',
      version: '0.2.0',
      url: opts.url,
      startedAt: started.toISOString(),
      finishedAt: new Date().toISOString(),
      durationSec: Math.round((Date.now() - started) / 1000),
      personas: personas.map((n) => ({ id: n, label: PERSONAS[n].label, need: PERSONAS[n].need })),
      account: state.account ? { email: state.account.email } : null,
    },
    ...F.toJSON(),
  };
}
