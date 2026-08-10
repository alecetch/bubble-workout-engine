import express from "express";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { escapeHtml } from "./referralLanding.js";
import { gatePage, wrapPage } from "../views/pageChrome.js";
import { sendEmail } from "../services/emailService.js";
import { requireInternalToken } from "../middleware/auth.js";
import { parseFrontmatter } from "../utils/markdown.js";
import { pool } from "../db.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const BLOG_DIR = join(__dirname, "../../content/blog");
const CHANGELOG_FILE = join(__dirname, "../../content/changelog.md");
const GUIDES_DIR_SITEMAP = join(__dirname, "../../content/guides");

export const websiteEnhancementsRouter = express.Router();

const PRICING_CSS = `
.pricing-page { padding: 64px 24px 80px; text-align: center; }
.pricing-hero { margin-bottom: 48px; }
.pricing-hero h1 { font-size: clamp(28px, 6vw, 48px); font-weight: 800; margin-bottom: 12px; }
.pricing-hero p { color: #94A3B8; font-size: 18px; max-width: 480px; margin: 0 auto; }
.trial-card { background: #1E293B; border: 2px solid #22D3EE; border-radius: 20px; max-width: 480px; margin: 0 auto 48px; padding: 32px; }
.trial-card h2 { font-size: 22px; font-weight: 700; margin-bottom: 16px; color: #22D3EE; }
.trial-card ul { list-style: none; text-align: left; display: flex; flex-direction: column; gap: 10px; }
.trial-card ul li { color: #94A3B8; padding-left: 20px; position: relative; }
.trial-card ul li::before { content: "+"; position: absolute; left: 0; color: #22D3EE; font-weight: 700; }
.plan-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 640px; margin: 0 auto 48px; text-align: left; }
.plan-card { background: #1E293B; border-radius: 16px; padding: 28px; position: relative; }
.plan-card.featured { border: 2px solid #22D3EE; }
.plan-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #22D3EE; color: #0F172A; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
.plan-card h3 { font-size: 16px; font-weight: 600; color: #94A3B8; margin-bottom: 8px; }
.plan-price { font-size: 32px; font-weight: 800; margin-bottom: 4px; }
.plan-billing { color: #64748B; font-size: 13px; margin-bottom: 16px; }
.plan-saving { color: #22D3EE; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
.pricing-faq { max-width: 640px; margin: 0 auto 48px; text-align: left; }
.pricing-faq h2 { font-size: 22px; font-weight: 700; margin-bottom: 24px; text-align: center; }
.pfaq-item { border-top: 1px solid #1E293B; padding: 18px 0; }
.pfaq-item:last-child { border-bottom: 1px solid #1E293B; }
.pfaq-q { font-weight: 600; margin-bottom: 8px; }
.pfaq-a { color: #94A3B8; font-size: 14px; }
@media (max-width: 600px) { .plan-row { grid-template-columns: 1fr; } }
`;

const SIGNUP_CSS = `
.signup-page { max-width: 560px; margin: 80px auto; padding: 0 24px; text-align: center; }
.signup-page h1 { font-size: clamp(24px, 5vw, 40px); font-weight: 800; margin-bottom: 16px; }
.signup-sub { color: #94A3B8; font-size: 16px; margin-bottom: 32px; }
.signup-error { color: #F87171; background: #1E293B; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; font-size: 14px; }
.signup-form { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.signup-form input[type=email] { background: #1E293B; border: 1px solid #334155; border-radius: 999px; padding: 12px 20px; color: #F1F5F9; font-size: 15px; min-width: 260px; outline: none; }
.signup-form input[type=email]:focus { border-color: #22D3EE; }
`;

const BLOG_CSS = `
.blog-index { padding: 48px 0 80px; }
.blog-index h1 { font-size: 32px; font-weight: 800; margin-bottom: 8px; }
.blog-intro { color: #94A3B8; margin-bottom: 40px; }
.post-card { border-top: 1px solid #1E293B; padding: 24px 0; }
.post-card:last-child { border-bottom: 1px solid #1E293B; }
.post-date { color: #64748B; font-size: 13px; margin-bottom: 6px; }
.post-card h2 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
.post-card h2 a { color: #F1F5F9; }
.post-card h2 a:hover { color: #22D3EE; text-decoration: none; }
.post-excerpt { color: #94A3B8; font-size: 15px; margin-bottom: 12px; }
.read-more { color: #22D3EE; font-size: 14px; font-weight: 600; }
.blog-post { padding: 48px 0 80px; }
.blog-post .back-link { color: #64748B; font-size: 14px; display: inline-block; margin-bottom: 24px; }
.blog-post .back-link:hover { color: #94A3B8; text-decoration: none; }
.blog-post h1 { font-size: clamp(24px, 5vw, 36px); font-weight: 800; margin-bottom: 8px; line-height: 1.2; }
.blog-post .post-date { color: #64748B; font-size: 14px; margin-bottom: 32px; }
.blog-post-body { font-size: 1.05rem; line-height: 1.8; color: #CBD5E1; }
.blog-post-body h2 { font-size: 22px; font-weight: 700; color: #F1F5F9; margin: 36px 0 12px; }
.blog-post-body h3 { font-size: 18px; font-weight: 600; color: #F1F5F9; margin: 28px 0 10px; }
.blog-post-body p { margin-bottom: 18px; }
.blog-post-body ul, .blog-post-body ol { padding-left: 24px; margin-bottom: 18px; }
.blog-post-body li { margin-bottom: 6px; }
.blog-post-body a { color: #22D3EE; }
.blog-post-body strong { color: #F1F5F9; }
`;

const CHANGELOG_CSS = `
.changelog-page { padding: 48px 0 80px; }
.changelog-page h1 { font-size: 32px; font-weight: 800; margin-bottom: 8px; }
.changelog-intro { color: #94A3B8; margin-bottom: 8px; }
.changelog-download { display: inline-block; margin-bottom: 40px; font-size: 14px; color: #22D3EE; }
.changelog-body h2 { font-size: 22px; font-weight: 700; color: #F1F5F9; padding: 28px 0 12px; border-top: 1px solid #1E293B; margin-top: 0; }
.changelog-body h2:first-child { border-top: none; padding-top: 0; }
.changelog-body ul { padding-left: 20px; margin-bottom: 8px; }
.changelog-body li { color: #94A3B8; font-size: 15px; margin-bottom: 6px; }
`;

function sendHtml(res, title, body, options) {
  return res.setHeader("Content-Type", "text/html; charset=utf-8").send(wrapPage(title, body, options));
}

function readBlogPosts() {
  let files = [];
  try {
    files = readdirSync(BLOG_DIR).filter((file) => file.endsWith(".md"));
  } catch {
    return [];
  }

  return files
    .map((file) => {
      const src = readFileSync(join(BLOG_DIR, file), "utf8");
      const { meta, body } = parseFrontmatter(src);
      return {
        slug: basename(file, ".md"),
        title: meta.title ?? "",
        date: meta.date ?? "",
        excerpt: meta.excerpt ?? "",
        ogImage: meta.ogImage ?? "",
        body,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function renderSignupForm(res, errorMsg = "") {
  const body = `<div class="signup-page">
  <h1>Join the Forma launch list.</h1>
  <p class="signup-sub">Training insights, app updates, and early access to new features. No spam. Unsubscribe anytime.</p>
  ${errorMsg ? `<p class="signup-error">${escapeHtml(errorMsg)}</p>` : ""}
  <form method="POST" action="/signup" class="signup-form">
    <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
    <button type="submit" class="cta-btn">Sign me up</button>
  </form>
  <p class="trial-note" style="margin-top:24px;">Or get notified when the app launches.</p>
  <a href="/download" class="cta-btn" style="margin-top:12px;">Get launch updates</a>
</div>`;
  return sendHtml(res, "Sign up for updates", body, {
    description: "Get Hyrox and strength training tips in your inbox.",
    canonical: "/signup",
    extraCss: SIGNUP_CSS,
  });
}

export async function insertEmailSignupAndNotify(email, source = "website", db = pool) {
  try {
    await db.query(
      "INSERT INTO email_signups (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING",
      [email, source],
    );
  } catch (err) {
    console.error("email_signups insert error", err);
  }

  sendEmail({
    to: email,
    subject: "You're on the Forma list",
    text: `Hi,\n\nYou're signed up for Forma updates. We'll send training tips and app news - no spam.\n\nWe'll email you when Forma is ready.\n\nTo unsubscribe, reply with 'unsubscribe'.\n\nForma`,
    html: `<p>You're signed up for Forma updates. We'll send training tips and app news - no spam.</p><p>We'll email you when Forma is ready.</p><p style="color:#94A3B8;font-size:12px;">To unsubscribe, reply with 'unsubscribe'.</p>`,
  }).catch((err) => console.error("confirmation email error", err));
}

export function createSignupHandlers(db = pool) {
  function getHandler(_req, res) {
    return renderSignupForm(res);
  }

  async function postHandler(req, res) {
    const raw = (req.body?.email ?? "").toString().trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
    if (!valid) {
      res.status(400);
      return renderSignupForm(res, "Please enter a valid email address.");
    }

    const email = raw.toLowerCase();
    await insertEmailSignupAndNotify(email, "website", db);

    return res.redirect(302, "/signup/confirmed");
  }

  return { getHandler, postHandler };
}

export function createAdminEmailSignupsHandler(db = pool) {
  return async function adminEmailSignupsHandler(_req, res) {
    const { rows } = await db.query("SELECT id, email, source, created_at FROM email_signups ORDER BY created_at DESC");
    const header = "id,email,source,created_at\n";
    const csv = rows
      .map((row) => `${row.id},${row.email},${row.source},${new Date(row.created_at).toISOString()}`)
      .join("\n");
    return res
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", 'attachment; filename="email-signups.csv"')
      .send(header + csv);
  };
}

websiteEnhancementsRouter.get("/robots.txt", (_req, res) => {
  const baseUrl = process.env.BASE_URL ?? "https://getforma.fit";
  res
    .setHeader("Content-Type", "text/plain; charset=utf-8")
    .send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
});

websiteEnhancementsRouter.get("/sitemap.xml", (_req, res) => {
  const baseUrl = process.env.BASE_URL ?? "https://getforma.fit";
  const today = new Date().toISOString().slice(0, 10);
  const previewEnabled = process.env.MARKETING_PREVIEW_ENABLED === "true";
  const staticPaths = previewEnabled
    ? ["/", "/download", "/pricing", "/hyrox", "/strength", "/testimonials", "/press", "/guides", "/partners", "/blog", "/changelog", "/privacy", "/terms", "/support", "/signup"]
    : ["/", "/download", "/privacy", "/terms"];
  let blogSlugs = [];
  try {
    if (!previewEnabled) throw new Error("preview gated");
    blogSlugs = readdirSync(BLOG_DIR)
      .filter((file) => file.endsWith(".md"))
      .map((file) => `/blog/${basename(file, ".md")}`);
  } catch {
    blogSlugs = [];
  }
  let guideSlugs = [];
  try {
    if (!previewEnabled) throw new Error("preview gated");
    guideSlugs = readdirSync(GUIDES_DIR_SITEMAP)
      .filter((file) => file.endsWith(".md"))
      .map((file) => `/guides/${basename(file, ".md")}`);
  } catch {
    guideSlugs = [];
  }
  const urls = [...staticPaths, ...blogSlugs, ...guideSlugs]
    .map((path) => `  <url><loc>${baseUrl}${path}</loc><lastmod>${today}</lastmod></url>`)
    .join("\n");
  res
    .setHeader("Content-Type", "text/xml; charset=utf-8")
    .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
});

websiteEnhancementsRouter.get("/pricing", gatePage, (_req, res) => {
  const monthly = escapeHtml(process.env.MONTHLY_PRICE ?? "");
  const annual = escapeHtml(process.env.ANNUAL_PRICE ?? "");
  const monthlyDisplay = monthly || "See App Store for pricing";
  const annualDisplay = annual || "See App Store for pricing";
  const body = `<div class="pricing-page"><div class="pricing-hero"><h1>Start free. Train smarter.</h1><p>Preview pricing for the Forma app launch.</p></div><div class="container"><div class="trial-card"><h2>Launch pricing</h2><ul><li>Full access to every feature, every day</li><li>Your data is yours - export or delete anytime</li><li>Pricing will be confirmed before launch</li></ul></div><div class="plan-row"><div class="plan-card"><h3>Monthly</h3><div class="plan-price">${monthlyDisplay}</div><div class="plan-billing">Billed monthly</div><a href="/download" class="cta-btn">Get launch updates</a></div><div class="plan-card featured"><div class="plan-badge">Best value</div><h3>Annual</h3><div class="plan-price">${annualDisplay}</div><div class="plan-billing">Billed once per year</div>${annual ? '<div class="plan-saving">Save ~33% vs monthly</div>' : ""}<a href="/download" class="cta-btn">Get launch updates</a></div></div><div class="pricing-faq"><h2>Common questions</h2><div class="pfaq-item"><p class="pfaq-q">Is the app available yet?</p><p class="pfaq-a">Not yet. Join the launch list and we will email you when Forma is ready.</p></div><div class="pfaq-item"><p class="pfaq-q">Can I switch between monthly and annual?</p><p class="pfaq-a">Yes. Subscription management will be handled through your device once the app is live.</p></div></div><div style="text-align:center;"><a href="/download" class="cta-btn">Get launch updates</a></div></div></div>`;
  return sendHtml(res, "Pricing", body, {
    description: "Forma pricing preview for the upcoming training app.",
    canonical: "/pricing",
    extraCss: PRICING_CSS,
  });
});

const { getHandler: signupGet, postHandler: signupPost } = createSignupHandlers();
websiteEnhancementsRouter.get("/signup", gatePage, signupGet);
websiteEnhancementsRouter.post("/signup", express.urlencoded({ extended: false }), signupPost);

websiteEnhancementsRouter.get("/signup/confirmed", gatePage, (_req, res) => {
  const body = `<div class="signup-page" style="text-align:center;"><h1>You're on the list.</h1><p class="signup-sub">We'll be in touch with training tips and app updates.</p><p style="color:#94A3B8;margin-top:16px;">In the meantime, you can also join the app launch list.</p><a href="/download" class="cta-btn" style="margin-top:24px;">Get launch updates</a></div>`;
  return sendHtml(res, "You're signed up", body, {
    description: "You're on the Forma list.",
    canonical: "/signup/confirmed",
    extraCss: SIGNUP_CSS,
  });
});

websiteEnhancementsRouter.get("/blog", gatePage, (_req, res) => {
  const posts = readBlogPosts();
  const cards = posts.length
    ? posts.map((post) => `<div class="post-card"><div class="post-date">${escapeHtml(post.date)}</div><h2><a href="/blog/${escapeHtml(post.slug)}">${escapeHtml(post.title)}</a></h2><p class="post-excerpt">${escapeHtml(post.excerpt)}</p><a href="/blog/${escapeHtml(post.slug)}" class="read-more">Read more -></a></div>`).join("")
    : "<p style='color:#94A3B8;'>No posts yet - check back soon.</p>";
  const body = `<div class="container-narrow blog-index"><h1>Blog</h1><p class="blog-intro">Training insights, programme design, and app updates.</p>${cards}</div>`;
  return sendHtml(res, "Blog", body, {
    description: "Forma blog - Hyrox training, strength programming, and app updates.",
    canonical: "/blog",
    extraCss: BLOG_CSS,
  });
});

websiteEnhancementsRouter.get("/blog/:slug", gatePage, (req, res) => {
  const { slug } = req.params;
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(404).send(wrapPage("Not Found", "<p style='padding:80px 24px;text-align:center;color:#94A3B8;'>Post not found.</p>"));
  }
  let src;
  try {
    src = readFileSync(join(BLOG_DIR, `${slug}.md`), "utf8");
  } catch {
    return res.status(404).send(wrapPage("Not Found", "<p style='padding:80px 24px;text-align:center;color:#94A3B8;'>Post not found.</p>"));
  }
  const { meta, body: mdBody } = parseFrontmatter(src);
  const html = marked.parse(mdBody);
  const body = `<div class="container-narrow blog-post"><a href="/blog" class="back-link">&lt;- Back to blog</a><h1>${escapeHtml(meta.title ?? "")}</h1><div class="post-date">${escapeHtml(meta.date ?? "")}</div><div class="blog-post-body">${html}</div></div>`;
  return sendHtml(res, meta.title ?? "Post", body, {
    description: meta.excerpt ?? "",
    ogImage: meta.ogImage || undefined,
    canonical: `/blog/${slug}`,
    extraCss: BLOG_CSS,
  });
});

websiteEnhancementsRouter.get("/changelog", gatePage, (_req, res) => {
  let html = "<p style='color:#94A3B8;'>Changelog coming soon.</p>";
  try {
    html = marked.parse(readFileSync(CHANGELOG_FILE, "utf8"));
  } catch {
    html = "<p style='color:#94A3B8;'>Changelog coming soon.</p>";
  }
  const body = `<div class="container-narrow changelog-page"><h1>Changelog</h1><p class="changelog-intro">A running record of what's new in Forma.</p><a class="changelog-download" href="/download">Get launch updates</a><div class="changelog-body">${html}</div></div>`;
  return sendHtml(res, "Changelog", body, {
    description: "Forma changelog - see what's new in every version of the app.",
    canonical: "/changelog",
    extraCss: CHANGELOG_CSS,
  });
});

websiteEnhancementsRouter.get("/admin/email-signups", requireInternalToken, createAdminEmailSignupsHandler(pool));
