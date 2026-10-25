// Things a careful human (and a good QA reviewer) notices on every page.

export async function pageChecks(page, url, persona, F, opts = {}) {
  const data = await page.evaluate(() => {
    const q = (s) => [...document.querySelectorAll(s)];
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
    };
    const imgs = q('img');
    const nameOf = (el) =>
      (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || el.querySelector('img[alt]')?.alt || '').trim();
    const inputs = q('input, select, textarea').filter(
      (i) => !['hidden', 'submit', 'button', 'reset', 'image'].includes(i.type) && vis(i)
    );
    const unlabeled = inputs.filter((i) => {
      if (i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || i.title) return false;
      if (i.id && document.querySelector(`label[for="${CSS.escape(i.id)}"]`)) return false;
      if (i.closest('label')) return false;
      return true;
    });
    const placeholderOnly = unlabeled.filter((i) => i.placeholder).length;
    const headings = q('h1,h2,h3,h4,h5,h6').map((h) => +h.tagName[1]);
    let skips = 0;
    for (let k = 1; k < headings.length; k++) if (headings[k] - headings[k - 1] > 1) skips++;
    const emptyLinks = q('a[href]').filter((a) => vis(a) && !nameOf(a)).length;
    const emptyButtons = q('button, [role=button]').filter((b) => vis(b) && !nameOf(b)).length;
    const deadAnchors = q('a').filter((a) => vis(a) && (!a.getAttribute('href') || a.getAttribute('href') === '#') && !a.onclick && !a.getAttribute('role')).length;
    const placeholderText = /lorem ipsum|todo:|tbd|coming soon|\[insert|placeholder text|your text here/i.exec(document.body.innerText);
    const brokenImgs = imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src).slice(0, 10);
    const bigImgs = imgs.filter((i) => i.naturalWidth > 2 * (i.clientWidth || 1) && i.naturalWidth > 1200).length;
    const mixed = location.protocol === 'https:' ? q('img[src^="http:"], script[src^="http:"], link[href^="http:"]').length : 0;
    return {
      title: document.title,
      lang: document.documentElement.lang,
      metaDesc: document.querySelector('meta[name="description"]')?.content || '',
      viewport: document.querySelector('meta[name="viewport"]')?.content || '',
      favicon: !!document.querySelector('link[rel*="icon"]'),
      h1: q('h1').length,
      headingSkips: skips,
      imgsNoAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
      brokenImgs,
      bigImgs,
      unlabeled: unlabeled.length,
      placeholderOnly,
      emptyLinks,
      emptyButtons,
      deadAnchors,
      placeholderText: placeholderText ? placeholderText[0] : null,
      mixed,
      textLen: document.body.innerText.trim().length,
      forms: q('form').length,
    };
  });

  const P = (title, category = 'content') => F.pass({ category, persona, page: url, title });
  const I = (severity, category, title, detail, suggestion) =>
    F.issue({ severity, category, persona, page: url, title, detail, suggestion });

  if (data.textLen < 30) I('major', 'content', 'Page looks blank', `Only ${data.textLen} characters of visible text.`, 'Check the page renders content without errors; blank pages often mean a failed JS bundle or API call.');

  if (!data.title) I('minor', 'seo', 'Missing page title', '', 'Add a unique <title> to every page — it shows in browser tabs and Google results.');
  else P('Has a page title', 'seo');
  if (!data.metaDesc) I('minor', 'seo', 'Missing meta description', '', 'Add <meta name="description"> (120–160 chars) so search results show a useful summary.');
  if (!data.lang) I('minor', 'accessibility', 'Missing <html lang>', '', 'Add lang="en" (or the right language) so screen readers pronounce text correctly.');
  if (!data.viewport) I('major', 'mobile', 'No mobile viewport tag', '', 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> or phones will show a zoomed-out desktop page.');
  if (!data.favicon) F.issue({ severity: 'info', category: 'polish', persona, page: url, global: true, title: 'No favicon', suggestion: 'Add a favicon so the site is recognisable in tabs and bookmarks.' });
  if (data.h1 === 0) I('minor', 'seo', 'No H1 heading', '', 'Give each page one clear <h1> describing what it is.');
  else if (data.h1 > 1) I('info', 'seo', `${data.h1} H1 headings`, '', 'Prefer a single <h1> per page; use <h2>/<h3> for sections.');
  else P('Has one clear H1 heading', 'seo');
  if (data.headingSkips) I('info', 'accessibility', 'Heading levels skip', `${data.headingSkips} jump(s), e.g. H1 → H3.`, 'Keep heading levels in order for screen-reader users.');
  if (data.imgsNoAlt) I('minor', 'accessibility', `${data.imgsNoAlt} image(s) without alt text`, '', 'Add alt="" text describing each image (or alt="" for decorative ones).');
  if (data.brokenImgs.length) I('major', 'broken', `${data.brokenImgs.length} broken image(s)`, data.brokenImgs.join('\n'), 'Fix or remove the image URLs — users see empty boxes.');
  else P('All images load', 'broken');
  if (data.bigImgs) I('minor', 'performance', `${data.bigImgs} oversized image(s)`, 'Images are much larger than they display.', 'Resize/compress images (WebP/AVIF) to speed up loading, especially on phones.');
  if (data.unlabeled) I('major', 'accessibility', `${data.unlabeled} form field(s) without a label`, data.placeholderOnly ? `${data.placeholderOnly} rely only on placeholder text.` : '', 'Add a visible <label for> to each field — placeholders disappear when typing and screen readers may skip them.');
  if (data.emptyLinks) I('minor', 'accessibility', `${data.emptyLinks} link(s) with no text`, '', 'Icon-only links need aria-label so people know where they go.');
  if (data.emptyButtons) I('minor', 'accessibility', `${data.emptyButtons} button(s) with no name`, '', 'Icon-only buttons need aria-label (e.g. "Close menu").');
  if (data.deadAnchors) I('minor', 'ux', `${data.deadAnchors} link(s) that go nowhere`, 'href is missing or "#".', 'Point these links somewhere real or turn them into buttons.');
  if (data.placeholderText) I('major', 'content', 'Placeholder / unfinished text found', `Found "${data.placeholderText}".`, 'Replace dummy text before launch — it looks unfinished to real users. (Common in AI-generated sites.)');
  if (data.mixed) I('major', 'security', `${data.mixed} insecure (http) resource(s) on https page`, '', 'Load all images/scripts over https to avoid browser warnings.');

  F.page(url, { title: data.title, forms: data.forms, persona });
  return data;
}

// Phone-specific checks
export async function mobileChecks(page, url, persona, F) {
  const vw = page.viewportSize()?.width || 390;
  const d = await page.evaluate((vw) => {
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const overflow = sw > vw + 2;
    const small = [...document.querySelectorAll('a, button, input, select, [role=button]')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.width < 32 || r.height < 32) && getComputedStyle(el).display !== 'inline';
    }).length;
    const tinyText = [...document.querySelectorAll('p, li, span, a, td')].filter((el) => {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      return el.innerText?.trim().length > 10 && fs < 12;
    }).length;
    return { overflow, small, tinyText, sw, w: vw };
  }, vw);
  if (d.overflow) F.issue({ severity: 'major', category: 'mobile', persona, page: url, title: 'Page scrolls sideways on phones', detail: `Content is ${d.sw}px wide on a ${d.w}px screen.`, suggestion: 'Find the element wider than the screen (often a table, image or fixed-width div) and add max-width:100% / overflow-x:auto.' });
  else F.pass({ category: 'mobile', persona, page: url, title: 'Fits phone screen width' });
  if (d.small > 3) F.issue({ severity: 'minor', category: 'mobile', persona, page: url, title: `${d.small} tap targets are too small`, suggestion: 'Make buttons/links at least 44×44px so thumbs can hit them.' });
  if (d.tinyText > 3) F.issue({ severity: 'minor', category: 'mobile', persona, page: url, title: 'Text too small to read on phones', detail: `${d.tinyText} text blocks under 12px.`, suggestion: 'Use at least 16px body text on mobile.' });
}
