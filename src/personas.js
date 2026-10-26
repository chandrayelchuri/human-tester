// Each persona is a different kind of real end user with different needs.
// Personas drive browser, viewport, input style, test data, and which journeys they attempt.

const stamp = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4);

export const PERSONAS = {
  explorer: {
    label: 'Curious first-time visitor',
    need: 'Look around, open every page, click every button, search, filter and sort',
    viewport: { width: 1366, height: 800 },
    journeys: ['explore', 'clickAll', 'search', 'filters'],
  },
  signup: {
    label: 'New customer who becomes a regular user',
    need: 'Sign up (incl. multi-step), log out & in, use every page behind the login, create and edit things, upload files, reset password, edit profile',
    viewport: { width: 1440, height: 900 },
    journeys: ['signup', 'login', 'exploreLoggedIn', 'clickAllLoggedIn', 'crud', 'upload', 'editProfile', 'forgotPassword'],
  },
  privacy: {
    label: 'Two different customers + a stranger',
    need: "User A's data must never be visible to user B or to someone who isn't logged in",
    viewport: { width: 1280, height: 800 },
    journeys: ['privacy'],
  },
  crowd: {
    label: 'Many people at the same time',
    need: 'Several users browse and sign up simultaneously — no crashes, no big slowdown',
    viewport: { width: 1280, height: 800 },
    journeys: ['crowd'],
  },
  mobile: {
    label: 'Phone user on the go',
    need: 'Use the site on a small touch screen',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    journeys: ['explore', 'clickAll', 'mobileChecks'],
  },
  keyboard: {
    label: 'Keyboard-only / accessibility user',
    need: 'Navigate with Tab and Enter only, needs labels and visible focus',
    viewport: { width: 1280, height: 800 },
    journeys: ['keyboard', 'a11y'],
  },
  messy: {
    label: 'Careless user who types messy data',
    need: 'Submits empty forms, wrong emails, very long text, emoji, script tags',
    viewport: { width: 1280, height: 800 },
    journeys: ['forms'],
  },
  impatient: {
    label: 'Impatient user on slow internet',
    need: 'Slow mobile data, Back button, refreshing pages',
    viewport: { width: 1280, height: 800 },
    slowNetwork: true,
    journeys: ['performance', 'doubleClick'],
  },
  safari: {
    label: 'Safari user (iPhone/Mac engine)',
    need: 'Every page works in Safari, not just Chrome',
    browser: 'webkit',
    browserLabel: 'Safari',
    viewport: { width: 1280, height: 800 },
    journeys: ['crossBrowser'],
  },
  firefox: {
    label: 'Firefox user',
    need: 'Every page works in Firefox',
    browser: 'firefox',
    browserLabel: 'Firefox',
    viewport: { width: 1280, height: 800 },
    journeys: ['crossBrowser'],
  },
  ai: {
    label: 'AI end-user with real goals',
    need: 'Reads each page like a person and tries to achieve goals (sign up, buy, book, post…) without being told how; reports confusion',
    viewport: { width: 1366, height: 850 },
    journeys: ['aiAgent'],
  },
};

export function makeIdentity(domainHint = 'example.com') {
  const id = stamp();
  return {
    firstName: 'Test',
    lastName: 'Human' + id.slice(-4),
    fullName: 'Test Human' + id.slice(-4),
    username: 'testhuman_' + id,
    email: `testhuman+${id}@${domainHint.includes('.') ? 'mailinator.com' : 'example.com'}`,
    password: 'Ht!' + id + 'Aa9',
    phone: '5555550' + String(Math.floor(Math.random() * 900) + 100),
    address: '123 Test Street',
    city: 'Houston',
    state: 'TX',
    zip: '77002',
    company: 'Human Tester QA',
    message: 'Hello, this is an automated Human Tester run. Please ignore.',
    url: 'https://example.com',
    number: '3',
    date: '2026-01-15',
  };
}

// Bad inputs the "messy" persona throws at every field.
export const MESSY_INPUTS = [
  { name: 'empty', value: '' },
  { name: 'spaces only', value: '     ' },
  { name: 'bad email', value: 'not-an-email@' },
  { name: 'very long text', value: 'A'.repeat(5000) },
  { name: 'emoji & unicode', value: '😀 Ñandú 测试 مرحبا' },
  { name: 'html/script', value: '<script>alert("ht-xss")</script>' },
  { name: 'sql-like', value: "' OR '1'='1" },
  { name: 'negative number', value: '-1' },
];

export function resolvePersonas(list) {
  if (!list || list === 'all') return Object.keys(PERSONAS);
  return list
    .split(',')
    .map((s) => s.trim())
    .filter((p) => {
      if (!PERSONAS[p]) console.warn(`Unknown persona "${p}" — skipped`);
      return PERSONAS[p];
    });
}
