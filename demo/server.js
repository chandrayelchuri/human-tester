// A small demo app with deliberately planted bugs, so you can see what Human Tester finds.
// Run: node demo/server.js  →  http://localhost:4321
import http from 'node:http';
import crypto from 'node:crypto';

const users = new Map(); // email -> { name, password }
const sessions = new Map(); // sid -> email

const layout = (title, body, user) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<meta name="description" content="Demo shop used to show what Human Tester finds.">
<style>body{font-family:sans-serif;margin:0}nav{display:flex;gap:12px;padding:12px;background:#eee}main{padding:16px}
.wide{width:900px;background:#fdd}button:focus{outline:none}</style></head><body>
<nav><a href="/">Home</a><a href="/about">About</a><a href="/products">Products</a><a href="/contact">Contact</a>
${user ? `<a href="/profile">My account</a><a href="/logout">Log out</a>` : `<a href="/login">Log in</a><a href="/signup">Sign up</a>`}</nav>
<main>${body}</main></body></html>`;

const parseBody = async (req) => {
  let b = '';
  for await (const c of req) b += c;
  return Object.fromEntries(new URLSearchParams(b));
};
const cookieSid = (req) => (req.headers.cookie || '').match(/sid=([\w]+)/)?.[1];

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const email = sessions.get(cookieSid(req));
  const user = email && users.get(email);
  const send = (html, code = 200, headers = {}) => { res.writeHead(code, { 'content-type': 'text/html', ...headers }); res.end(html); };
  const go = (to, headers = {}) => { res.writeHead(302, { location: to, ...headers }); res.end(); };

  if (u.pathname === '/') return send(layout('Demo Shop', `<h1>Welcome to Demo Shop</h1>
    <p>We sell handmade things.</p>
    <button onclick="document.getElementById('more').hidden=false">Show more</button>
    <p id="more" hidden>Free shipping over $50!</p>
    <button>Subscribe to newsletter</button>
    <button onclick="openCart()">Open cart</button>
    <img src="/hero.png" alt="Shop hero">`, user));
  if (u.pathname === '/about') return send(layout('About', `<h1>About us</h1><p>Lorem ipsum dolor sit amet, our story goes here.</p>
    <img src="/team.jpg"><a href="/team">Meet the team</a><a href="#">Careers</a>`, user));
  if (u.pathname === '/products') return send(layout('Products', `<h1>Products</h1><h3>Bestsellers</h3>
    <div class="wide">Wide promo banner that does not fit phones</div><ul><li>Mug — $12</li><li>Bag — $30</li></ul>`, user));
  if (u.pathname === '/contact') {
    if (req.method === 'POST') {
      const b = await parseBody(req);
      if ((b.message || '').length > 1000) return send('Internal Server Error', 500);
      return send(layout('Thanks', `<h1>Thanks!</h1><p>We got your message: ${b.message}</p>`, user)); // XSS bug
    }
    return send(layout('Contact', `<h1>Contact</h1><form method="post">
      <input name="email" placeholder="Your email"><textarea name="message" placeholder="Message"></textarea>
      <button type="submit">Send</button></form>`, user));
  }
  if (u.pathname === '/signup') {
    if (req.method === 'POST') {
      const b = await parseBody(req);
      if (!b.email || !b.password) return send(layout('Sign up', '<h1>Sign up</h1><p>Error: email and password are required</p>'), 400);
      users.set(b.email, { name: b.name || '', password: b.password });
      const sid = crypto.randomBytes(8).toString('hex');
      sessions.set(sid, b.email);
      return go('/profile', { 'set-cookie': `sid=${sid}; Path=/; HttpOnly` });
    }
    return send(layout('Sign up', `<h1>Create your account</h1><form method="post">
      <label for="n">Full name</label><input id="n" name="name">
      <label for="e">Email</label><input id="e" name="email" type="email" required>
      <label for="p">Password</label><input id="p" name="password" type="password" required>
      <button type="submit">Create account</button></form>`, user));
  }
  if (u.pathname === '/login') {
    if (req.method === 'POST') {
      const b = await parseBody(req);
      const acc = users.get(b.email);
      if (!acc || acc.password !== b.password) return send(layout('Log in', '<h1>Log in</h1><p>Incorrect email or password.</p><form method="post"><label for="e">Email</label><input id="e" name="email"><label for="p">Password</label><input id="p" type="password" name="password"><button>Log in</button></form>'), 401);
      const sid = crypto.randomBytes(8).toString('hex');
      sessions.set(sid, b.email);
      return go('/', { 'set-cookie': `sid=${sid}; Path=/; HttpOnly` });
    }
    return send(layout('Log in', `<h1>Log in</h1><form method="post"><label for="e">Email</label><input id="e" name="email" type="email">
      <label for="p">Password</label><input id="p" type="password" name="password"><button type="submit">Log in</button></form>`, user));
  }
  if (u.pathname === '/logout') { sessions.delete(cookieSid(req)); return go('/'); }
  if (u.pathname === '/profile') {
    if (!user) return go('/login');
    if (req.method === 'POST') { await parseBody(req); return go('/profile'); } // BUG: never saves
    return send(layout('My account', `<h1>My account</h1><form method="post"><label for="n">Name</label>
      <input id="n" name="name" value="${user.name}"><button type="submit">Save</button></form>`, user));
  }
  send(layout('Not found', '<h1>Not found</h1>'), 404);
}).listen(4321, () => console.log('Demo app on http://localhost:4321'));
