// Collects everything the virtual users notice — good and bad.

export const SEVERITY = ['critical', 'major', 'minor', 'info'];

export class Findings {
  constructor() {
    this.issues = [];
    this.passes = [];
    this.pages = new Map(); // url -> { status, loadMs, title, persona[] }
    this.journeys = []; // { persona, journey, status: 'passed'|'failed'|'skipped', detail }
    this._seen = new Set();
  }

  issue({ severity = 'minor', category, persona, page, title, detail = '', suggestion = '', screenshot, global = false }) {
    // de-duplicate the same problem on the same page (or site-wide when global)
    const key = [severity, category, global ? '*' + detail : page, title].join('|');
    if (this._seen.has(key)) {
      const existing = this.issues.find((i) => i.key === key);
      if (existing && persona && !existing.personas.includes(persona)) existing.personas.push(persona);
      return;
    }
    this._seen.add(key);
    this.issues.push({ key, severity, category, personas: persona ? [persona] : [], page, title, detail, suggestion, screenshot });
  }

  pass({ category, persona, page, title }) {
    const key = [category, page, title].join('|');
    if (this._seen.has('p|' + key)) return;
    this._seen.add('p|' + key);
    this.passes.push({ category, persona, page, title });
  }

  journey(persona, journey, status, detail = '') {
    this.journeys.push({ persona, journey, status, detail });
  }

  page(url, data) {
    const prev = this.pages.get(url) || { personas: [] };
    const merged = { ...prev, ...data };
    if (data.persona && !merged.personas.includes(data.persona)) merged.personas.push(data.persona);
    delete merged.persona;
    this.pages.set(url, merged);
  }

  score() {
    // 100 minus weighted penalties, floored at 0
    // diminishing penalty: a few bad bugs hurt a lot, a long tail of nits doesn't zero the score
    const w = { critical: 12, major: 4, minor: 1, info: 0 };
    const penalty = this.issues.reduce((s, i) => s + (w[i.severity] || 0), 0)
      + this.journeys.filter((j) => j.status === 'failed').length * 10;
    return Math.round(100 * Math.exp(-penalty / 90));
  }

  toJSON() {
    const bySev = Object.fromEntries(SEVERITY.map((s) => [s, this.issues.filter((i) => i.severity === s).length]));
    return {
      score: this.score(),
      counts: { ...bySev, passes: this.passes.length, pages: this.pages.size },
      journeys: this.journeys,
      issues: [...this.issues]
        .sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity))
        .map(({ key, ...rest }) => rest),
      passes: this.passes,
      pages: [...this.pages.entries()].map(([url, d]) => ({ url, ...d })),
    };
  }
}
