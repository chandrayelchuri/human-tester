// Shared helpers: safety rules, URL handling, and the "smart form filler"
// that types into fields the way a person would.

export const DESTRUCTIVE = /\b(delete|remove|destroy|erase|deactivate|close account|cancel (my )?(account|subscription)|unsubscribe|pay|payment|purchase|buy now|place order|checkout|check out|confirm order|subscribe now|transfer|withdraw|donate)\b/i;
export const LOGOUT = /\b(log ?out|sign ?out|logoff)\b/i;
export const SIGNUP = /\b(sign ?up|register|create (an )?account|get started|join( now| free)?|start free|try (it )?free)\b/i;
export const LOGIN = /\b(log ?in|sign ?in|login|signin|my account)\b/i;
export const PROFILE = /\b(profile|account settings|my account|settings|edit profile|account)\b/i;
export const SUCCESS_TEXT = /\b(welcome|success|successfully|thank you|thanks|account created|signed in|logged in|dashboard|saved|updated|verify your email|check your email|confirmation)\b/i;
export const ERROR_TEXT = /\b(error|invalid|incorrect|not correct|doesn't match|does not match|failed|went wrong|try again|not found|required|already (exists|taken|registered)|exception)\b/i;

export function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

export function normalizeUrl(href, base) {
  try {
    const u = new URL(href, base);
    u.hash = '';
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function settle(page, ms = 600) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 });
    await page.waitForLoadState('networkidle', { timeout: 4000 });
  } catch {
    /* busy pages never go idle — that's fine */
  }
  await sleep(ms);
}

// Describe a field so we can guess what a human would type.
async function fieldHints(el) {
  return el.evaluate((n) => {
    const id = n.id;
    let label = '';
    if (id) {
      const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (l) label = l.innerText;
    }
    if (!label && n.closest('label')) label = n.closest('label').innerText;
    return [n.type, n.name, n.id, n.placeholder, n.getAttribute('autocomplete'), n.getAttribute('aria-label'), label]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  });
}

export function valueFor(hints, type, identity, mode = 'good') {
  const h = hints;
  if (mode !== 'good') return mode; // explicit messy value
  if (type === 'email' || /e-?mail/.test(h)) return identity.email;
  if (type === 'password' || /pass(word)?|pwd/.test(h)) return identity.password;
  if (type === 'tel' || /phone|mobile|tel\b/.test(h)) return identity.phone;
  if (type === 'url' || /website|url/.test(h)) return identity.url;
  if (type === 'number') return identity.number;
  if (type === 'date') return identity.date;
  if (/user ?name|login|handle/.test(h)) return identity.username;
  if (/first/.test(h)) return identity.firstName;
  if (/last|surname/.test(h)) return identity.lastName;
  if (/full ?name|your name|\bname\b/.test(h)) return identity.fullName;
  if (/company|organi[sz]ation|business/.test(h)) return identity.company;
  if (/address|street/.test(h)) return identity.address;
  if (/city|town/.test(h)) return identity.city;
  if (/state|province|region/.test(h)) return identity.state;
  if (/zip|postal|post ?code/.test(h)) return identity.zip;
  if (/search/.test(h)) return 'test';
  return identity.message.slice(0, 40);
}

// Fill every visible field inside `scope` (a form or the page).
// mode: 'good' -> realistic data, or a literal string for messy testing.
export async function fillForm(scope, identity, mode = 'good') {
  const filled = [];
  const fields = await scope.$$('input, textarea, select');
  const radiosDone = new Set();
  for (const el of fields) {
    try {
      if (!(await el.isVisible()) || !(await el.isEnabled())) continue;
      const type = ((await el.getAttribute('type')) || (await el.evaluate((n) => n.tagName.toLowerCase()))).toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(type)) continue;
      const hints = await fieldHints(el);
      // A real person filling a sign-up form leaves "(optional)" boxes (referral, discount, coupon code…) empty.
      if (mode === 'good' && /\boptional\b|referral|coupon|promo|discount/.test(hints) && !(await el.getAttribute('required'))) continue;
      if (type === 'select') {
        const opts = await el.$$eval('option', (os) => os.map((o) => o.value).filter((v) => v !== ''));
        if (opts.length) await el.selectOption(opts[Math.min(1, opts.length - 1)]);
        filled.push(hints);
        continue;
      }
      if (type === 'checkbox') {
        if (mode === 'good' && !(await el.isChecked())) await el.check({ timeout: 2000 }).catch(() => {});
        continue;
      }
      if (type === 'radio') {
        const name = await el.getAttribute('name');
        if (name && radiosDone.has(name)) continue;
        radiosDone.add(name);
        await el.check({ timeout: 2000 }).catch(() => {});
        continue;
      }
      // confirm-password style fields must match
      const v = /confirm|repeat|again|retype/.test(hints) && /pass/.test(hints) && mode === 'good'
        ? identity.password
        : valueFor(hints, type, identity, mode);
      await el.fill(v, { timeout: 3000 });
      filled.push(hints);
    } catch {
      /* field disappeared or isn't fillable — keep going like a person would */
    }
  }
  return filled;
}

export async function findSubmit(scope) {
  const candidates = [
    'button[type=submit]',
    'input[type=submit]',
    'button:not([type])',
    '[role=button]',
    'button',
  ];
  for (const sel of candidates) {
    const els = await scope.$$(sel);
    for (const el of els) {
      if (await el.isVisible().catch(() => false)) return el;
    }
  }
  return null;
}

// Find a clickable thing whose visible text matches a pattern.
export async function findByText(page, pattern) {
  const els = await page.$$('a, button, [role=button], [role=link], [role=menuitem]');
  for (const el of els) {
    const txt = ((await el.innerText().catch(() => '')) + ' ' + ((await el.getAttribute('aria-label')) || '') + ' ' + ((await el.getAttribute('href')) || '')).trim();
    if (pattern.test(txt) && (await el.isVisible().catch(() => false))) return el;
  }
  return null;
}

export async function visibleText(page) {
  return (await page.evaluate(() => document.body?.innerText || '').catch(() => '')).slice(0, 20000);
}
