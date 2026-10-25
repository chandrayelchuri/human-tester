// Optional: ask Claude to turn raw findings into a prioritised improvement plan.
// Runs only when ANTHROPIC_API_KEY is set. Without it, rule-based suggestions are used.

export async function aiSuggestions(report, { apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.HT_AI_MODEL || 'claude-sonnet-5-5' } = {}) {
  if (!apiKey) return null;
  const compact = {
    url: report.meta.url,
    score: report.score,
    journeys: report.journeys,
    issues: report.issues.slice(0, 80).map((i) => ({ s: i.severity, c: i.category, t: i.title, p: i.page, d: (i.detail || '').slice(0, 200) })),
    passes: report.passes.slice(0, 40).map((p) => p.title),
  };
  const prompt = `You are a senior QA lead and UX reviewer. Automated "virtual human" users just tested ${report.meta.url}.
Here are their findings as JSON:\n${JSON.stringify(compact)}\n
Write a short improvement plan in Markdown for the site owner (who may have built it with AI tools and is not necessarily a developer):
1. "What's working" — 3-5 bullets.
2. "Fix first" — the 5 most important problems, each with a plain-English why and a concrete fix (and a prompt they could paste into their AI builder).
3. "Improvements" — up to 6 UX/conversion/accessibility ideas beyond bugs.
Be specific to the findings; do not invent problems that are not in the data.`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return `_AI suggestions unavailable (${res.status})._`;
    const j = await res.json();
    return j.content?.map((c) => c.text || '').join('\n') || null;
  } catch (e) {
    return `_AI suggestions unavailable (${e.message})._`;
  }
}
