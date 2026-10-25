import { chromium } from 'playwright';
import fs from 'node:fs';
import { Findings } from './findings.js';
import { PERSONAS, resolvePersonas } from './personas.js';
import { JOURNEYS, explore } from './journeys.js';
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

async function runPersona(browser, name, opts, state, F, log) {
  const p = PERSONAS[name];
  const context = await browser.newContext({
    viewport: p.viewport,
    isMobile: !!p.isMobile,
    hasTouch: !!p.hasTouch,
    userAgent: p.userAgent,
    ignoreHTTPSErrors: false,
  });
  const page = await context.newPage();
  const ctx = {
    persona: name, page, context, F, state,
    opts: { ...opts, isMobile: !!p.isMobile },
    errorCount: 0, serverErrorCount: 0, requestCount: 0,
    lastError: '', lastServerError: '', current: '', xssFired: false,
  };
  attachListeners(ctx, page);
  if (!state.visited.size && !p.journeys.includes('explore')) {
    log(`  [${name}] mapping the site first…`);
    await explore(ctx);
  }
  for (const j of p.journeys) {
    log(`  [${name}] ${j}…`);
    const t0 = Date.now();
    try {
      await JOURNEYS[j](ctx);
    } catch (e) {
      F.journey(name, j, 'failed', 'Tester error: ' + String(e.message).split('\n')[0]);
    }
    log(`  [${name}] ${j} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  await context.close();
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
  const state = { visited: new Set(), formPages: new Set(), externalLinks: new Set(), linkedFrom: new Map(), account: null, loggedIn: false };
  const browser = await chromium.launch({ headless: opts.headless });
  const started = new Date();
  const personas = resolvePersonas(opts.personas);
  // explorer first so everyone else knows the site map
  personas.sort((a, b) => (a === 'explorer' ? -1 : b === 'explorer' ? 1 : 0));
  log(`Human Tester → ${opts.url}`);
  log(`Personas: ${personas.join(', ')}`);
  for (const name of personas) {
    log(`\n▶ ${PERSONAS[name].label}`);
    await runPersona(browser, name, opts, state, F, log);
  }
  if (opts.checkExternal !== false) await checkExternalLinks(browser, state, F, opts);
  await browser.close();
  return {
    meta: {
      tool: 'human-tester',
      version: '0.1.0',
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
