// A small demo app with deliberately planted bugs, so you can see what Human Tester finds.
// Run: node demo/server.js  →  http://localhost:4321
import http from 'node:http';
import crypto from 'node:crypto';

const users = new Map(); // email -> { name, password }
const sessions = new Map(); // sid -> email
const notes = []; // { id, owner, title, body }  — BUG: listed for everyone
const PRODUCTS = ['Ceramic mug', 'Canvas tote bag', 'Linen apron', 'Walnut spoon', 'Beeswax candle', 'Wool blanket', 'Glass vase', 'Cotton napkins'];

const layout = (title, body, user) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<meta name="description" content="Demo shop used to show what Human Tester finds.">
<style>body{font-family:sans-serif;margin:0}nav{display:flex;gap:12px;padding:12px;background:#eee}main{padding:16px}
.wide{width:900px;background:#fdd}button:focus{outline:none}</style></head><body>
<nav><a href="/">Home</a><a href="/about">About</a><a href="/products">Products</a><a href="/contact">Contact</a>
<form action="/search" role="search"><input type="search" name="q" aria-label="Search products"></form>
${user ? `<a href="/notes">My notes</a><a href="/profile">My account</a><a href="/logout">Log out</a>` : `<a href="/login">Log in</a><a href="/signup">Sign up</a>`}</nav>
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
  if (u.pathname === '/products') {
    const pg = Number(u.searchParams.get('page') || 1);
    const items = PRODUCTS.slice((pg - 1) * 4, pg * 4);
    // BUG: the sort dropdown is not wired to anything
    return send(layout('Products', `<h1>Products</h1><h3>Bestsellers</h3>
    <div class="wide">Wide promo banner that does not fit phones</div>
    <label for="sort">Sort by</label><select id="sort" aria-label="Sort products"><option>Popular</option><option>Price: low to high</option></select>
    <ul>${items.map((p) => `<li>${p}</li>`).join('')}</ul>${pg === 1 ? '<a href="/products?page=2" rel="next">Next</a>' : '<a href="/products?page=1">Previous</a>'}`, user));
  }
  if (u.pathname === '/search') {
    const q = (u.searchParams.get('q') || '').trim().toLowerCase();
    const hits = q ? PRODUCTS.filter((p) => p.toLowerCase().includes(q)) : [];
    return send(layout('Search', `<h1>Search</h1>${hits.length ? `<ul>${hits.map((h) => `<li>${h}</li>`).join('')}</ul>` : `<p>No results for that search.</p>`}`, user));
  }
  if (u.pathname === '/notes') {
    if (!user) return go('/login');
    // BUG: shows every user's notes, not just mine
    return send(layout('My notes', `<h1>My notes</h1><a href="/notes/new">+ New note</a><ul>${notes.map((n) => `<li><a href="/notes/${n.id}">${n.title}</a></li>`).join('') || '<li>No notes yet</li>'}</ul>`, user));
  }
  if (u.pathname === '/notes/new') {
    if (!user) return go('/login');
    if (req.method === 'POST') {
      const b = await parseBody(req);
      const id = notes.length + 1;
      notes.push({ id, owner: email, title: b.title || 'Untitled', body: b.body || '' });
      return go('/notes');
    }
    return send(layout('New note', `<h1>New note</h1><form method="post"><label for="t">Title</label><input id="t" name="title" required>
      <label for="b">Note</label><textarea id="b" name="body"></textarea><button type="submit">Save note</button></form>`, user));
  }
  const nm = u.pathname.match(/^\/notes\/(\d+)$/);
  if (nm) {
    const n = notes.find((x) => x.id === Number(nm[1]));
    if (!n) return send(layout('Not found', '<h1>Not found</h1>'), 404);
    // BUG: no login or owner check
    if (req.method === 'POST') { const b = await parseBody(req); n.title = b.title; return go(`/notes/${n.id}`); }
    return send(layout(n.title, `<h1>${n.title}</h1><p>${n.body}</p><a href="/notes/${n.id}/edit">Edit</a>`, user));
  }
  const em = u.pathname.match(/^\/notes\/(\d+)\/edit$/);
  if (em) {
    const n = notes.find((x) => x.id === Number(em[1]));
    if (!n) return send(layout('Not found', '<h1>Not found</h1>'), 404);
    return send(layout('Edit note', `<h1>Edit note</h1><form method="post" action="/notes/${n.id}"><label for="t">Title</label><input id="t" name="title" value="${n.title}"><button type="submit">Save</button></form>`, user));
  }
  if (u.pathname === '/forgot') {
    if (req.method === 'POST') { await parseBody(req); return send(layout('Reset', '<h1>Check your email</h1><p>If that email has an account, we sent a reset link.</p>', user)); }
    return send(layout('Reset password', `<h1>Reset password</h1><form method="post"><label for="e">Email</label><input id="e" name="email" type="email" required><button type="submit">Send reset link</button></form>`, user));
  }
  if (u.pathname === '/avatar' && req.method === 'POST') {
    let size = 0;
    for await (const c of req) size += c.length;
    if (size > 5 * 1024 * 1024) return send('Payload crash', 500); // BUG: crashes on big files
    return go('/profile');
  }
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
      <label for="p">Password</label><input id="p" type="password" name="password"><button type="submit">Log in</button></form><a href="/forgot">Forgot password?</a>`, user));
  }
  if (u.pathname === '/logout') { sessions.delete(cookieSid(req)); return go('/'); }
  if (u.pathname === '/profile') {
    if (!user) return go('/login');
    if (req.method === 'POST') { await parseBody(req); return go('/profile'); } // BUG: never saves
    return send(layout('My account', `<h1>My account</h1><form method="post"><label for="n">Name</label>
      <input id="n" name="name" value="${user.name}"><button type="submit">Save</button></form>
      <h2>Profile photo</h2><form method="post" action="/avatar" enctype="multipart/form-data"><label for="a">Photo</label><input id="a" type="file" name="avatar" accept="image/*"><button type="submit">Upload photo</button></form>`, user));
  }
  send(layout('Not found', '<h1>Not found</h1>'), 404);
}).listen(4321, () => console.log('Demo app on http://localhost:4321'));
