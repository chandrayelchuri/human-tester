// Tiny HTTP API so an admin dashboard (e.g. kinovo.com) can start test runs
// and show results. No extra dependencies.
//
//   POST /api/runs           { "url": "https://site.com", "personas": "all" }  -> { id }
//   GET  /api/runs           list of runs
//   GET  /api/runs/:id       status + summary (+ full report when done)
//   GET  /reports/:id/       the full HTML report (embed in an <iframe>)
//
// Protect it with HT_API_TOKEN (sent as "Authorization: Bearer <token>").

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { testSite } from './index.js';

const ROOT = path.resolve(process.env.HT_DATA_DIR || 'ht-runs');
const runs = new Map();
let busy = false;
const queue = [];

function load() {
  if (!fs.existsSync(ROOT)) return;
  for (const id of fs.readdirSync(ROOT)) {
    const f = path.join(ROOT, id, 'summary.json');
    if (fs.existsSync(f)) runs.set(id, { id, status: 'done', ...JSON.parse(fs.readFileSync(f, 'utf8')) });
  }
}

async function next() {
  if (busy || !queue.length) return;
  busy = true;
  const job = queue.shift();
  job.status = 'running';
  job.log = [];
  try {
    const r = await testSite({ url: job.url, personas: job.personas, maxPages: job.maxPages || 20, out: path.join(ROOT, job.id), loginEmail: job.loginEmail, loginPassword: job.loginPassword }, (l) => job.log.push(l));
    Object.assign(job, { status: 'done', score: r.score, counts: r.counts, finishedAt: r.meta.finishedAt });
  } catch (e) {
    Object.assign(job, { status: 'error', error: String(e.message) });
  }
  busy = false;
  next();
}

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': process.env.HT_CORS_ORIGIN || '*', 'access-control-allow-headers': 'authorization, content-type' });
  res.end(JSON.stringify(obj));
};

export function serve(port) {
  load();
  const token = process.env.HT_API_TOKEN;
  http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (u.pathname.startsWith('/reports/')) {
      const rel = path.normalize(decodeURIComponent(u.pathname.slice('/reports/'.length))).replace(/^(\.\.[/\\])+/, '');
      let file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT)) return json(res, 403, { error: 'forbidden' });
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) return json(res, 404, { error: 'not found' });
      const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.png') ? 'image/png' : 'application/json';
      res.writeHead(200, { 'content-type': type });
      return fs.createReadStream(file).pipe(res);
    }
    if (token && req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { error: 'unauthorized' });
    if (u.pathname === '/api/runs' && req.method === 'POST') {
      let body = '';
      for await (const c of req) body += c;
      let b;
      try { b = JSON.parse(body || '{}'); } catch { return json(res, 400, { error: 'bad json' }); }
      if (!b.url) return json(res, 400, { error: 'url required' });
      const id = new Date().toISOString().slice(0, 10) + '-' + crypto.randomBytes(3).toString('hex');
      const job = { id, url: b.url, personas: b.personas || 'all', maxPages: b.maxPages, loginEmail: b.loginEmail, loginPassword: b.loginPassword, status: 'queued', createdAt: new Date().toISOString() };
      runs.set(id, job);
      queue.push(job);
      next();
      return json(res, 202, { id, status: job.status });
    }
    if (u.pathname === '/api/runs' && req.method === 'GET') {
      return json(res, 200, [...runs.values()].map(({ loginPassword, log, ...r }) => r).reverse());
    }
    const m = u.pathname.match(/^\/api\/runs\/([\w-]+)$/);
    if (m && req.method === 'GET') {
      const job = runs.get(m[1]);
      if (!job) return json(res, 404, { error: 'not found' });
      const { loginPassword, ...safe } = job;
      const full = path.join(ROOT, m[1], 'report.json');
      if (job.status === 'done' && fs.existsSync(full) && u.searchParams.get('full')) safe.report = JSON.parse(fs.readFileSync(full, 'utf8'));
      safe.reportUrl = `/reports/${m[1]}/`;
      return json(res, 200, safe);
    }
    json(res, 404, { error: 'not found' });
  }).listen(port, () => console.log(`Human Tester API on http://localhost:${port}`));
}
