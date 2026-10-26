#!/usr/bin/env node
import fs from 'node:fs';
import { testSite } from '../src/index.js';
import { PERSONAS } from '../src/personas.js';

const HELP = `
Human Tester — acts as real end users to test websites and apps built with AI.

Usage:
  human-tester <url> [options]
  human-tester serve [--port 8787]          # API for dashboards (e.g. your admin panel)

Options:
  --personas <list>        all (default) or comma list: ${Object.keys(PERSONAS).join(', ')}
  --max-pages <n>          pages to crawl (default 25)
  --out <dir>              report folder (default human-tester-report)
  --login-email <email>    use an existing account instead of signing up
  --login-password <pw>
  --signup-url <path>      where the sign-up form lives, if not linked in the header
  --login-url <path>       where the log-in form lives
  --crowd <n>              how many simultaneous users the "crowd" persona uses (default 5)
  --goals "a|b"            goals for the AI end-user, separated by |  (needs ANTHROPIC_API_KEY)
  --ai-steps <n>           max steps per AI goal (default 20)
  --unsafe                 also click delete/pay/checkout buttons (ONLY on test environments)
  --headed                 watch the browser
  --no-screenshots
  --fail-under <score>     exit code 1 if score is below this (for CI)
  --config <file>          JSON file with any of the options above

Set ANTHROPIC_API_KEY to turn on the AI end-user persona and an AI-written improvement plan.

Only test sites you own or have permission to test.
`;

function parse(argv) {
  const o = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (['unsafe', 'headed', 'noScreenshots', 'help'].includes(key)) o[key] = true;
    else o[key] = argv[++i];
  }
  return { o, pos };
}

const { o, pos } = parse(process.argv.slice(2));
if (o.help || !pos.length) {
  console.log(HELP);
  process.exit(pos.length ? 0 : 1);
}

if (pos[0] === 'serve') {
  const { serve } = await import('../src/server.js');
  serve(Number(o.port || process.env.PORT || 8787));
} else {
  const cfg = o.config ? JSON.parse(fs.readFileSync(o.config, 'utf8')) : {};
  const opts = {
    ...cfg,
    url: pos[0],
    personas: o.personas || cfg.personas || 'all',
    maxPages: Number(o.maxPages || cfg.maxPages || 25),
    out: o.out || cfg.out || 'human-tester-report',
    loginEmail: o.loginEmail || cfg.loginEmail || process.env.HT_LOGIN_EMAIL,
    loginPassword: o.loginPassword || cfg.loginPassword || process.env.HT_LOGIN_PASSWORD,
    signupUrl: o.signupUrl || cfg.signupUrl,
    loginUrl: o.loginUrl || cfg.loginUrl,
    unsafe: !!(o.unsafe || cfg.unsafe),
    crowd: Number(o.crowd || cfg.crowd || 5),
    goals: (o.goals || process.env.HT_GOALS) ? (o.goals || process.env.HT_GOALS).split('|').map((g) => g.trim()).filter(Boolean) : cfg.goals,
    aiSteps: Number(o.aiSteps || cfg.aiSteps || 20),
    headless: !o.headed,
    screenshots: !o.noScreenshots,
  };
  const r = await testSite(opts);
  console.log(`\nScore ${r.score}/100 — ${r.counts.critical} critical, ${r.counts.major} major, ${r.counts.minor} minor, ${r.counts.passes} passed`);
  for (const j of r.journeys.filter((j) => j.status === 'failed')) console.log(`  ❌ ${j.persona}/${j.journey}: ${j.detail}`);
  console.log(`Report: ${opts.out}/index.html`);
  if (o.failUnder && r.score < Number(o.failUnder)) process.exit(1);
}
