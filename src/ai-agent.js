// AI end-user: Claude looks at each page like a person, decides what to do next to reach
// a goal ("buy a mug", "book an appointment", "post an ad"), and reports where it got
// confused. Runs only when ANTHROPIC_API_KEY is set.
import { goto, shot } from './journeys.js';
import { makeIdentity } from './personas.js';
import { DESTRUCTIVE, settle, visibleText } from './utils.js';

const DEFAULT_GOALS = [
  'You are a brand-new visitor. Work out what this website/app offers, then complete its main action as a real customer would (for example sign up, create something, book, buy with a test card only if this is clearly a test site, or send an enquiry).',
  'You are a returning customer who wants to change something about your account or something you created earlier (log in with the test identity if you need to).',
];

async function callClaude(prompt, { apiKey, model }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text = j.content?.map((c) => c.text || '').join('') || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in reply');
  return JSON.parse(m[0]);
}

async function observe(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('a[href], button, input, select, textarea, [role=button], [role=link], [role=tab], [role=menuitem], summary, [onclick]')];
    const out = [];
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden' || el.type === 'hidden') return;
      const id = out.length;
      el.setAttribute('data-ht-ai', String(id));
      let label = el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || el.name || '';
      if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) label = l.innerText + (el.placeholder ? ` (${el.placeholder})` : ''); }
      out.push(`[${id}] ${el.tagName.toLowerCase()}${el.type ? `:${el.type}` : ''} "${label.trim().replace(/\s+/g, ' ').slice(0, 70)}"${el.tagName === 'SELECT' ? ` options=${[...el.options].map((o) => o.text).slice(0, 8).join('|')}` : ''}${el.value && el.tagName !== 'BUTTON' && el.type !== 'submit' ? ` value="${String(el.value).slice(0, 30)}"` : ''}`);
    });
    return { url: location.href, title: document.title, elements: out.slice(0, 120) };
  });
}

export async function aiAgent(ctx) {
  const { F, persona, page, opts } = ctx;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return F.journey(persona, 'aiAgent', 'skipped', 'Set ANTHROPIC_API_KEY to let an AI end-user explore with its own goals');
  const model = process.env.HT_AI_MODEL || 'claude-sonnet-5-5';
  const goals = opts.goals?.length ? opts.goals : DEFAULT_GOALS;
  const id = makeIdentity();
  const maxSteps = opts.aiSteps || 20;

  for (const goal of goals) {
    await goto(ctx, opts.url);
    const history = [];
    let result = null;
    for (let step = 1; step <= maxSteps && !result; step++) {
      const obs = await observe(page);
      const text = (await visibleText(page)).slice(0, 2500);
      const prompt = `You are testing a website by acting as a real end user (not a developer). Behave like a normal person: read, look for obvious buttons, and don't guess hidden URLs.
GOAL: ${goal}
Test identity to use in any form: name ${id.fullName}, email ${id.email}, password ${id.password}, phone ${id.phone}, address ${id.address}, ${id.city} ${id.state} ${id.zip}.
Never pay with a real card, never delete things, never contact real people.

Current page: ${obs.url} — "${obs.title}"
Visible text (truncated):
${text}

Interactive elements:
${obs.elements.join('\n')}

Your previous steps:
${history.slice(-8).join('\n') || '(none)'}

Reply with ONLY a JSON object:
{"thought":"what you notice as a user","action":"click|type|select|back|done|stuck","id":<element number>,"text":"<for type/select>","outcome":"<for done/stuck: what happened>","frictions":["anything confusing, slow, broken or annoying you noticed on this page"]}
Use "done" when the goal is achieved, "stuck" if a real user would give up.`;
      let d;
      try { d = await callClaude(prompt, { apiKey, model }); } catch (e) {
        F.journey(persona, 'aiAgent', 'skipped', `AI unavailable: ${e.message}`);
        return;
      }
      for (const fr of (d.frictions || []).slice(0, 3)) {
        if (fr && fr.length > 8) F.issue({ severity: 'minor', category: 'ai-review', persona, page: obs.url, title: fr.slice(0, 140), suggestion: 'Reported by the AI end-user while trying to: ' + goal.slice(0, 80) + '…' });
      }
      if (d.action === 'done' || d.action === 'stuck') { result = d; break; }
      const el = d.id !== undefined ? await page.$(`[data-ht-ai="${d.id}"]`) : null;
      const label = el ? ((await el.innerText().catch(() => '')) || (await el.getAttribute('value')) || '') : '';
      if (DESTRUCTIVE.test(label) && !opts.unsafe) { history.push(`${step}. (blocked: "${label}" is a destructive/payment action)`); continue; }
      const srv0 = ctx.serverErrorCount;
      try {
        if (d.action === 'back') await page.goBack();
        else if (!el) { history.push(`${step}. element ${d.id} not found`); continue; }
        else if (d.action === 'type') await el.fill(String(d.text ?? ''));
        else if (d.action === 'select') await el.selectOption({ label: String(d.text) }).catch(() => el.selectOption(String(d.text)));
        else await el.click({ timeout: 4000 });
      } catch (e) {
        history.push(`${step}. ${d.action} [${d.id}] failed: ${String(e.message).split('\n')[0].slice(0, 80)}`);
        continue;
      }
      await settle(page, 600);
      history.push(`${step}. ${d.action} [${d.id}] "${label.slice(0, 40)}"${d.text ? ` = "${String(d.text).slice(0, 30)}"` : ''} — ${d.thought?.slice(0, 100) || ''}`);
      if (ctx.serverErrorCount > srv0) history.push(`   ⚠ server error: ${ctx.lastServerError}`);
    }
    const short = goal.split('.')[0].slice(0, 70);
    if (result?.action === 'done') {
      F.journey(persona, 'aiAgent', 'passed', `${short} → ${result.outcome || 'done'} (${history.length} steps)`);
      F.pass({ category: 'journey', persona, page: page.url(), title: `AI end-user completed: ${short}` });
    } else {
      const why = result?.outcome || `Ran out of ${maxSteps} steps`;
      F.journey(persona, 'aiAgent', 'failed', `${short} → ${why}`);
      F.issue({ severity: 'major', category: 'journey', persona, page: page.url(), title: `A user trying to "${short}" gave up`, detail: `${why}\n\nSteps:\n${history.join('\n')}`, suggestion: 'Walk through these steps yourself — the path to this goal is unclear or broken.', screenshot: await shot(ctx, 'ai-stuck') });
    }
  }
}
