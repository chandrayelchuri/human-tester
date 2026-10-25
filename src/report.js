import fs from 'node:fs';

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEV_W = { critical: 4, major: 3, minor: 2, info: 1 };

// Group the same advice across pages into ranked "Top improvements".
export function topSuggestions(report, n = 10) {
  const map = new Map();
  for (const i of report.issues) {
    if (!i.suggestion) continue;
    const k = i.title.replace(/\d+/g, 'N') + '|' + i.suggestion;
    const e = map.get(k) || { title: i.title.replace(/^\d+ /, '').replace(/^./, (c) => c.toUpperCase()), suggestion: i.suggestion, severity: i.severity, pages: new Set(), weight: 0 };
    e.pages.add(i.page);
    e.weight += SEV_W[i.severity];
    if (SEV_W[i.severity] > SEV_W[e.severity]) e.severity = i.severity;
    map.set(k, e);
  }
  return [...map.values()]
    .sort((a, b) => SEV_W[b.severity] - SEV_W[a.severity] || b.weight - a.weight)
    .slice(0, n)
    .map((e) => ({ ...e, pages: [...e.pages] }));
}

function grade(score) {
  if (score >= 90) return ['Excellent', '#16a34a'];
  if (score >= 75) return ['Good', '#65a30d'];
  if (score >= 55) return ['Needs work', '#d97706'];
  return ['Poor', '#dc2626'];
}

export function toMarkdown(r) {
  const top = topSuggestions(r);
  const [g] = grade(r.score);
  const L = [];
  L.push(`# Human Tester report — ${r.meta.url}`);
  L.push(`**Score: ${r.score}/100 (${g})** · ${r.counts.pages} pages · ${r.counts.critical} critical · ${r.counts.major} major · ${r.counts.minor} minor · ${r.counts.passes} checks passed · ${r.meta.durationSec}s`);
  L.push('');
  L.push('## User journeys');
  L.push('| Persona | Journey | Result | Detail |\n|---|---|---|---|');
  for (const j of r.journeys) L.push(`| ${j.persona} | ${j.journey} | ${j.status === 'passed' ? '✅' : j.status === 'failed' ? '❌' : '⏭️'} ${j.status} | ${(j.detail || '').replace(/\|/g, '/')} |`);
  L.push('\n## Top improvements');
  top.forEach((t, i) => L.push(`${i + 1}. **[${t.severity}] ${t.title}** — ${t.suggestion} _(${t.pages.length} page${t.pages.length > 1 ? 's' : ''})_`));
  if (r.ai) L.push('\n## AI review\n' + r.ai);
  L.push('\n## All issues');
  for (const i of r.issues) L.push(`- **${i.severity}** · ${i.category} · ${i.title} — ${i.page}${i.detail ? `\n  - ${i.detail.split('\n')[0]}` : ''}`);
  L.push('\n## What works');
  for (const p of r.passes.slice(0, 100)) L.push(`- ✅ ${p.title} — ${p.page}`);
  return L.join('\n');
}

export function toHTML(r) {
  const top = topSuggestions(r);
  const [g, col] = grade(r.score);
  const sevColor = { critical: '#dc2626', major: '#ea580c', minor: '#ca8a04', info: '#64748b' };
  const md = (s) => esc(s).replace(/^### (.*)$/gm, '<h4>$1</h4>').replace(/^## (.*)$/gm, '<h3>$1</h3>').replace(/^# (.*)$/gm, '<h3>$1</h3>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>').replace(/^\d+\. (.*)$/gm, '<li>$1</li>').replace(/\n{2,}/g, '<br><br>');
  const issueRows = r.issues.map((i) => `
    <details class="issue" data-sev="${i.severity}" data-cat="${esc(i.category)}">
      <summary><span class="pill" style="background:${sevColor[i.severity]}">${i.severity}</span> <b>${esc(i.title)}</b> <span class="muted">· ${esc(i.category)} · ${esc(i.personas.join(', '))}</span></summary>
      <div class="body">
        <div class="muted">Page: <a href="${esc(i.page)}" target="_blank" rel="noopener">${esc(i.page)}</a></div>
        ${i.detail ? `<pre>${esc(i.detail)}</pre>` : ''}
        ${i.suggestion ? `<p>💡 ${esc(i.suggestion)}</p>` : ''}
        ${i.screenshot ? `<a href="${esc(i.screenshot)}" target="_blank"><img src="${esc(i.screenshot)}" alt="Screenshot of the problem" loading="lazy"></a>` : ''}
      </div>
    </details>`).join('');
  const journeyRows = r.journeys.map((j) => `<tr><td>${esc(j.persona)}</td><td>${esc(j.journey)}</td><td class="${j.status}">${j.status === 'passed' ? '✅ Passed' : j.status === 'failed' ? '❌ Failed' : '⏭️ Skipped'}</td><td>${esc(j.detail)}</td></tr>`).join('');
  const cats = [...new Set(r.issues.map((i) => i.category))];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Human Tester Report</title>
<style>
:root{--bg:#f8fafc;--card:#fff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--accent:#4f46e5}
@media (prefers-color-scheme:dark){:root{--bg:#0b1020;--card:#121a2e;--ink:#e2e8f0;--muted:#94a3b8;--line:#1f2a44;--accent:#818cf8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:24px 16px 64px}
header{display:flex;gap:20px;align-items:center;flex-wrap:wrap}
.score{width:110px;height:110px;border-radius:50%;display:grid;place-items:center;border:8px solid ${col};font-size:32px;font-weight:800}
h1{margin:0;font-size:22px}h2{margin:32px 0 12px;font-size:18px}.muted{color:var(--muted)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}.card b{font-size:22px;display:block}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden;border:1px solid var(--line)}
td,th{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:13px;color:var(--muted)}
td.failed{color:#dc2626;font-weight:600}td.passed{color:#16a34a}
ol.top li{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0}
.pill{color:#fff;border-radius:999px;padding:1px 8px;font-size:12px;text-transform:uppercase;letter-spacing:.03em}
.issue{background:var(--card);border:1px solid var(--line);border-radius:10px;margin:6px 0}.issue summary{padding:10px 12px;cursor:pointer}
.issue .body{padding:0 12px 12px}.issue img{max-width:100%;border:1px solid var(--line);border-radius:8px;margin-top:8px}
pre{white-space:pre-wrap;word-break:break-all;background:var(--bg);padding:8px;border-radius:8px;font-size:12px}
.filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.filters button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:4px 10px;cursor:pointer}
.filters button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.passes{columns:2;column-gap:24px}@media(max-width:640px){.passes{columns:1}td:nth-child(4){display:none}}
.ai{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px}
a{color:var(--accent)}
</style></head><body><div class="wrap">
<header><div class="score">${r.score}</div><div>
<h1>Human Tester report</h1>
<div><a href="${esc(r.meta.url)}" target="_blank" rel="noopener">${esc(r.meta.url)}</a></div>
<div class="muted">${g} · ${new Date(r.meta.finishedAt).toLocaleString()} · ${r.meta.durationSec}s · ${r.meta.personas.length} virtual users</div></div></header>
<div class="cards">
<div class="card"><b style="color:#dc2626">${r.counts.critical}</b>Critical</div>
<div class="card"><b style="color:#ea580c">${r.counts.major}</b>Major</div>
<div class="card"><b style="color:#ca8a04">${r.counts.minor}</b>Minor</div>
<div class="card"><b style="color:#16a34a">${r.counts.passes}</b>Checks passed</div>
<div class="card"><b>${r.counts.pages}</b>Pages visited</div>
</div>
<h2>What each virtual user tried</h2>
<table><tr><th>User</th><th>Journey</th><th>Result</th><th>Detail</th></tr>${journeyRows}</table>
<h2>Top improvements</h2>
<ol class="top">${top.map((t) => `<li><span class="pill" style="background:${sevColor[t.severity]}">${t.severity}</span> <b>${esc(t.title)}</b><br>${esc(t.suggestion)} <span class="muted">(${t.pages.length} page${t.pages.length > 1 ? 's' : ''})</span></li>`).join('') || '<li>No issues found 🎉</li>'}</ol>
${r.ai ? `<h2>AI review</h2><div class="ai">${md(r.ai)}</div>` : ''}
<h2>All issues (${r.issues.length})</h2>
<div class="filters"><button class="on" data-f="all">All</button>${['critical', 'major', 'minor', 'info'].map((s) => `<button data-f="sev:${s}">${s}</button>`).join('')}${cats.map((c) => `<button data-f="cat:${esc(c)}">${esc(c)}</button>`).join('')}</div>
<div id="issues">${issueRows || '<p>No issues found.</p>'}</div>
<h2>What works (${r.passes.length})</h2>
<ul class="passes">${r.passes.map((p) => `<li>✅ ${esc(p.title)} <span class="muted">— ${esc(new URL(p.page).pathname)}</span></li>`).join('')}</ul>
<h2>Virtual users</h2>
<table><tr><th>User</th><th>Needs</th></tr>${r.meta.personas.map((p) => `<tr><td>${esc(p.label)}</td><td>${esc(p.need)}</td></tr>`).join('')}</table>
<p class="muted">Generated by <a href="https://github.com/">Human Tester</a> — human texture testing for websites and apps built with AI.</p>
</div>
<script>
document.querySelectorAll('.filters button').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.filters button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
 const f=b.dataset.f;document.querySelectorAll('.issue').forEach(el=>{
  el.style.display = f==='all' || (f.startsWith('sev:')&&el.dataset.sev===f.slice(4)) || (f.startsWith('cat:')&&el.dataset.cat===f.slice(4)) ? '' : 'none';});});
</script></body></html>`;
}

export function writeReports(r, out) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(r, null, 2));
  fs.writeFileSync(`${out}/report.md`, toMarkdown(r));
  fs.writeFileSync(`${out}/index.html`, toHTML(r));
  // small badge-style summary for dashboards
  fs.writeFileSync(`${out}/summary.json`, JSON.stringify({ url: r.meta.url, score: r.score, counts: r.counts, finishedAt: r.meta.finishedAt, journeys: r.journeys, top: topSuggestions(r, 5) }, null, 2));
}
