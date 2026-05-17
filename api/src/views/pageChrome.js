import { escapeHtml } from "../routes/referralLanding.js";

const APP_STORE_URL = () => process.env.APP_STORE_URL ?? "#";

function header() {
  return `
  <header class="site-header">
    <a href="/" class="logo-link">
      <img src="/images/formai_wordmark_only@2x.png" width="110" alt="Formai" class="logo-img">
    </a>
    <nav class="site-nav">
      <a href="/">Home</a>
      <a href="/download">Download</a>
      <a href="/pricing">Pricing</a>
      <a href="/hyrox">Hyrox</a>
      <a href="/strength">Strength</a>
      <a href="/testimonials">Testimonials</a>
      <a href="/press">Press</a>
      <a href="/guides">Guides</a>
      <a href="/partners">Partners</a>
      <a href="/blog">Blog</a>
      <a href="/changelog">Changelog</a>
      <a href="/support">Support</a>
      <a href="/signup">Updates</a>
      <a href="${escapeHtml(APP_STORE_URL())}" class="nav-cta">Get the app</a>
    </nav>
  </header>`;
}

function footer() {
  return `
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-links">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/support">Support</a>
      </div>
      <p class="footer-copy">© 2026 Engle Consulting Limited. All rights reserved.</p>
      <a href="${escapeHtml(APP_STORE_URL())}" class="app-store-badge">Download on the App Store</a>
    </div>
  </footer>`;
}

const SHARED_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 16px; -webkit-text-size-adjust: 100%; }
  body {
    background: #0F172A;
    color: #F1F5F9;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    line-height: 1.6;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  main { flex: 1; }
  a { color: #22D3EE; text-decoration: none; }
  a:hover { text-decoration: underline; }
  img { max-width: 100%; height: auto; display: block; }
  .site-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid #1E293B;
    position: sticky;
    top: 0;
    background: #0F172A;
    z-index: 10;
  }
  .logo-link { display: flex; align-items: center; }
  .logo-img { width: 110px; }
  .site-nav { display: flex; align-items: center; gap: 24px; }
  .site-nav a { color: #94A3B8; font-size: 14px; font-weight: 500; }
  .site-nav a:hover { color: #F1F5F9; text-decoration: none; }
  .nav-cta {
    background: #22D3EE;
    color: #0F172A !important;
    padding: 8px 16px;
    border-radius: 999px;
    font-weight: 600;
    font-size: 14px;
  }
  .nav-cta:hover { background: #67E8F9; text-decoration: none !important; }
  .site-footer {
    border-top: 1px solid #1E293B;
    padding: 32px 24px;
    margin-top: 64px;
  }
  .footer-inner {
    max-width: 920px;
    margin: 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    justify-content: space-between;
  }
  .footer-links { display: flex; gap: 24px; }
  .footer-links a { color: #94A3B8; font-size: 14px; }
  .footer-copy { color: #475569; font-size: 13px; }
  .app-store-badge {
    background: #1E293B;
    color: #F1F5F9 !important;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
  }
  .container { max-width: 920px; margin: 0 auto; padding: 0 24px; }
  .container-narrow { max-width: 680px; margin: 0 auto; padding: 0 24px; }
  .cta-btn {
    display: inline-block;
    background: #22D3EE;
    color: #0F172A;
    font-weight: 700;
    font-size: 16px;
    padding: 14px 32px;
    border-radius: 999px;
    text-decoration: none;
    transition: background 0.15s;
  }
  .cta-btn:hover { background: #67E8F9; text-decoration: none; }
  .trial-note { color: #94A3B8; font-size: 13px; margin-top: 10px; }
  @media (max-width: 600px) {
    .site-nav .nav-cta { display: none; }
    .site-nav a:not(.nav-cta) { display: none; }
    .footer-inner { flex-direction: column; align-items: flex-start; }
  }
`;

export function wrapPage(title, bodyHtml, extraCssOrOptions = "") {
  const isOptions = extraCssOrOptions !== null && typeof extraCssOrOptions === "object";
  const extraCss = isOptions ? (extraCssOrOptions.extraCss ?? "") : extraCssOrOptions;
  const opts = isOptions ? extraCssOrOptions : {};
  const description = opts.description ?? "Formai - personalised strength and conditioning programs that adapt to your performance.";
  const ogImage = opts.ogImage ?? "/images/formai_hero@2x.png";
  const ogType = opts.ogType ?? "website";
  const baseUrl = process.env.BASE_URL ?? "";
  const canonicalTag = baseUrl && opts.canonical
    ? `<link rel="canonical" href="${escapeHtml(baseUrl + opts.canonical)}">`
    : "";
  const jsonLdTag = opts.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Formai</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)} - Formai">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)} - Formai">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <link rel="icon" type="image/svg+xml" href="/images/formai_icon.svg">
  ${canonicalTag}
  ${jsonLdTag}
  <style>${SHARED_CSS}${extraCss}</style>
</head>
<body>
  ${header()}
  <main>${bodyHtml}</main>
  ${footer()}
</body>
</html>`;
}
