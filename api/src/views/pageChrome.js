import { getBrand, getFormaBrand } from "../config/brand.js";
import { escapeHtml } from "../routes/referralLanding.js";

function marketingPreviewEnabled() {
  return process.env.MARKETING_PREVIEW_ENABLED === "true";
}

function header() {
  const brand = getBrand();
  const logo = brand.variant === "200days"
    ? `<img src="${brand.logo.header}" width="32" height="32" alt=""><span class="logo-text">${brand.name}</span>`
    : `<img src="${brand.logo.header}" width="110" alt="${brand.logo.headerAlt}" class="logo-img">`;
  const previewLinks = marketingPreviewEnabled() ? `
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
      <a href="/signup">Updates</a>` : "";
  return `
  <header class="site-header">
    <a href="/" class="logo-link">
      ${logo}
    </a>
    <nav class="site-nav">
      <a href="/">Home</a>
      <a href="/download">Download</a>
      ${previewLinks}
      <a href="/download" class="nav-cta">Get the app</a>
    </nav>
  </header>`;
}

export const COMPANY_LEGAL_LINE =
  `${getFormaBrand().operator} is registered in England and Wales, company number 06771687. `
  + "Registered office: Grain Store, Sheepstreet Lane, Etchingham, East Sussex TN19 7AY.";

function footer() {
  const previewLinks = marketingPreviewEnabled() ? '<a href="/support">Support</a>' : "";
  return `
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-links">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        ${previewLinks}
      </div>
      <p class="footer-copy">© 2026 ${getBrand().operator}. All rights reserved.</p>
      <a href="/download" class="app-store-badge">Get launch updates</a>
      <p class="footer-legal">${COMPANY_LEGAL_LINE}</p>
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
  .logo-link { display: flex; align-items: center; gap: 10px; }
  .logo-text { font-weight: 600; font-size: 18px; color: #F1F5F9; white-space: nowrap; }
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
  .footer-legal { flex-basis: 100%; color: #475569; font-size: 12px; }
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
  const brand = getBrand();
  const description = opts.description ?? brand.defaultDescription;
  const image = opts.ogImage ?? brand.logo.ogImage;
  const ogImage = /^https?:\/\//i.test(image) ? image : brand.siteUrl + image;
  const ogType = opts.ogType ?? "website";
  const canonicalTag = opts.canonical
    ? `<link rel="canonical" href="${escapeHtml(brand.siteUrl + opts.canonical)}">`
    : "";
  const jsonLdTag = opts.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>`
    : "";
  const iconTags = brand.variant === "200days"
    ? `<link rel="icon" href="${brand.logo.favicon}" type="image/svg+xml">
  <link rel="icon" href="${brand.logo.favicon32}" sizes="32x32">
  <link rel="alternate icon" href="${brand.logo.faviconIco}">
  <link rel="apple-touch-icon" href="${brand.logo.appleTouchIcon}">
  <meta name="theme-color" content="#0F172A">`
    : `<link rel="icon" type="image/png" href="${brand.logo.favicon}">`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${brand.titleSuffix}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)} - ${brand.titleSuffix}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)} - ${brand.titleSuffix}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  ${iconTags}
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

export function gatePage(_req, res, next) {
  if (marketingPreviewEnabled()) {
    return next();
  }

  const body = `<div class="container-narrow" style="padding:80px 24px;text-align:center;">
  <h1>Page not found</h1>
  <p style="color:#94A3B8;margin-top:12px;">This page is not live yet. <a href="/">Back home</a></p>
</div>`;
  return res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").send(wrapPage("Page not found", body));
}
