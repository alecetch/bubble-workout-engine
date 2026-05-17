import express from "express";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { parseFrontmatter } from "../utils/markdown.js";
import { escapeHtml } from "./referralLanding.js";
import { wrapPage } from "../views/pageChrome.js";
import { sendEmail } from "../services/emailService.js";
import { pool } from "../db.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const GUIDES_DIR = join(__dirname, "../../content/guides");

export const contentHubRouter = express.Router();

const HUB_CSS = `
.guides-page { padding: 48px 0 80px; }
.guides-header { margin-bottom: 40px; }
.guides-header h1 { font-size: clamp(24px, 5vw, 36px); font-weight: 800; margin-bottom: 8px; }
.guides-header p { color: #94A3B8; font-size: 16px; }
.guide-filters { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
.guide-filters a { background: #1E293B; border: 1px solid #334155; border-radius: 999px; padding: 6px 14px; color: #CBD5E1; font-size: 13px; font-weight: 600; }
.guide-card { border-top: 1px solid #1E293B; padding: 24px 0; display: flex; gap: 16px; align-items: flex-start; scroll-margin-top: 90px; }
.guide-card:last-child { border-bottom: 1px solid #1E293B; }
.category-badge { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 3px 10px; border-radius: 999px; }
.category-badge.hyrox { background: #164E63; color: #22D3EE; }
.category-badge.strength { background: #1E3A5F; color: #93C5FD; }
.guide-card-body { flex: 1; }
.guide-card-body h2 { font-size: 19px; font-weight: 700; margin-bottom: 8px; }
.guide-card-body h2 a { color: #F1F5F9; }
.guide-card-body h2 a:hover { color: #22D3EE; text-decoration: none; }
.guide-excerpt { color: #94A3B8; font-size: 14px; margin-bottom: 10px; line-height: 1.6; }
.guide-meta { color: #64748B; font-size: 13px; }
.read-more { color: #22D3EE; font-size: 14px; font-weight: 600; margin-top: 10px; display: inline-block; }
.guide-post { padding: 48px 0 80px; }
.guide-post .back-link { color: #64748B; font-size: 14px; display: inline-block; margin-bottom: 20px; }
.guide-post .back-link:hover { color: #94A3B8; text-decoration: none; }
.guide-post h1 { font-size: clamp(22px, 5vw, 34px); font-weight: 800; margin-bottom: 12px; line-height: 1.2; }
.guide-meta-row { display: flex; align-items: center; gap: 14px; margin-bottom: 32px; flex-wrap: wrap; }
.guide-toc { background: #1E293B; border-radius: 12px; padding: 20px 24px; margin-bottom: 36px; }
.guide-toc h3 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; margin-bottom: 12px; }
.guide-toc ol { padding-left: 18px; margin: 0; }
.guide-toc ol li { margin-bottom: 6px; }
.guide-toc ol li a { color: #94A3B8; font-size: 14px; }
.guide-toc ol li a:hover { color: #22D3EE; text-decoration: none; }
.guide-body { font-size: 1.05rem; line-height: 1.8; color: #CBD5E1; max-width: 750px; }
.guide-body h2 { font-size: 22px; font-weight: 700; color: #F1F5F9; margin: 40px 0 14px; padding-top: 8px; }
.guide-body h3 { font-size: 18px; font-weight: 600; color: #F1F5F9; margin: 28px 0 10px; }
.guide-body p { margin-bottom: 18px; }
.guide-body ul, .guide-body ol { padding-left: 24px; margin-bottom: 18px; }
.guide-body li { margin-bottom: 6px; }
.guide-body a { color: #22D3EE; }
.guide-body strong { color: #F1F5F9; }
.lead-box { background: #1E293B; border-left: 4px solid #22D3EE; border-radius: 0 14px 14px 0; padding: 28px 32px; margin: 40px 0; max-width: 750px; }
.lead-box h3 { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
.lead-box p { color: #94A3B8; font-size: 14px; margin-bottom: 20px; }
.lead-form { display: flex; gap: 10px; flex-wrap: wrap; }
.lead-form input[type=email] { background: #0F172A; border: 1px solid #334155; border-radius: 999px; padding: 10px 18px; color: #F1F5F9; font-size: 14px; min-width: 220px; outline: none; }
.lead-form input[type=email]:focus { border-color: #22D3EE; }
.lead-form-error { color: #F87171; font-size: 13px; margin-top: 8px; }
`;

function readGuides() {
  let files = [];
  try {
    files = readdirSync(GUIDES_DIR).filter((file) => file.endsWith(".md"));
  } catch {
    return [];
  }
  return files
    .map((file) => {
      try {
        const src = readFileSync(join(GUIDES_DIR, file), "utf8");
        const { meta } = parseFrontmatter(src);
        return {
          slug: basename(file, ".md"),
          title: meta.title ?? "",
          category: meta.category ?? "",
          excerpt: meta.excerpt ?? "",
          readTime: meta.readTime ?? "",
          leadMagnetTitle: meta.leadMagnetTitle ?? "",
          leadMagnetFile: meta.leadMagnetFile ?? "",
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function slugifyHeading(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function extractToc(html) {
  const headings = [];
  const re = /<h2[^>]*>(.*?)<\/h2>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, "");
    headings.push({ text, id: slugifyHeading(text) });
  }
  return headings.length >= 3 ? headings : null;
}

function addHeadingIds(html) {
  return html.replace(/<h2>(.*?)<\/h2>/gi, (_match, text) => {
    const clean = text.replace(/<[^>]+>/g, "");
    return `<h2 id="${slugifyHeading(clean)}">${text}</h2>`;
  });
}

function notFound(res) {
  return res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").send(
    wrapPage("Not Found", "<div style='padding:80px 24px;text-align:center;color:#94A3B8;'>Guide not found.</div>"),
  );
}

contentHubRouter.get("/guides", (_req, res) => {
  const guides = readGuides();
  const categories = [...new Set(guides.map((guide) => guide.category).filter(Boolean))];
  const filters = categories.length > 1
    ? `<div class="guide-filters"><a href="/guides">All</a>${categories.map((category) => `<a href="#${escapeHtml(category)}">${escapeHtml(category)}</a>`).join("")}</div>`
    : "";
  const cards = guides.length
    ? guides.map((guide) => `<div class="guide-card" id="${escapeHtml(guide.category)}">
  <div class="guide-card-body">
    <div style="margin-bottom:8px;"><span class="category-badge ${escapeHtml(guide.category)}">${escapeHtml(guide.category)}</span></div>
    <h2><a href="/guides/${escapeHtml(guide.slug)}">${escapeHtml(guide.title)}</a></h2>
    <p class="guide-excerpt">${escapeHtml(guide.excerpt)}</p>
    <div class="guide-meta">${guide.readTime ? `${escapeHtml(String(guide.readTime))} min read` : ""}</div>
    <a href="/guides/${escapeHtml(guide.slug)}" class="read-more">Read guide -&gt;</a>
  </div>
</div>`).join("")
    : "<p style='color:#94A3B8;'>Guides coming soon.</p>";
  const body = `<div class="container-narrow guides-page">
<div class="guides-header">
  <h1>Training Guides</h1>
  <p>In-depth resources for Hyrox athletes and serious strength trainers.</p>
  ${filters}
</div>
${cards}
</div>`;
  return res.setHeader("Content-Type", "text/html; charset=utf-8").send(
    wrapPage("Training Guides", body, {
      description: "In-depth Hyrox and strength training guides from the Formai team.",
      canonical: "/guides",
      extraCss: HUB_CSS,
    }),
  );
});

contentHubRouter.get("/guides/:slug", (req, res) => {
  const { slug } = req.params;
  if (!/^[a-z0-9-]+$/.test(slug)) return notFound(res);

  let src;
  try {
    src = readFileSync(join(GUIDES_DIR, `${slug}.md`), "utf8");
  } catch {
    return notFound(res);
  }

  const { meta, body: mdBody } = parseFrontmatter(src);
  let renderedHtml = marked.parse(mdBody);
  renderedHtml = addHeadingIds(renderedHtml);
  const toc = extractToc(renderedHtml);
  const tocHtml = toc
    ? `<nav class="guide-toc"><h3>Contents</h3><ol>${toc.map((heading) => `<li><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`).join("")}</ol></nav>`
    : "";
  const hasLeadMagnet = Boolean(meta.leadMagnetTitle && meta.leadMagnetFile);
  const errorHtml = req.query.error === "invalid-email" ? '<p class="lead-form-error">Please enter a valid email address.</p>' : "";
  const leadMagnetHtml = hasLeadMagnet ? `<div class="lead-magnet-box lead-box">
  <h3>${escapeHtml(meta.leadMagnetTitle)}</h3>
  <p>Enter your email and we will send you the download link instantly.</p>
  <form method="POST" action="/guides/${escapeHtml(slug)}/signup" class="lead-form">
    <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
    <button type="submit" class="cta-btn" style="font-size:14px;padding:10px 20px;">Get the download</button>
  </form>
  ${errorHtml}
</div>` : "";
  const body = `<div class="container-narrow guide-post">
<a href="/guides" class="back-link">&lt;- All guides</a>
<div style="margin-bottom:10px;"><span class="category-badge ${escapeHtml(meta.category ?? "")}">${escapeHtml(meta.category ?? "")}</span></div>
<h1>${escapeHtml(meta.title ?? "")}</h1>
<div class="guide-meta-row">${meta.readTime ? `<span class="guide-meta">${escapeHtml(String(meta.readTime))} min read</span>` : ""}</div>
${tocHtml}
<div class="guide-body">${renderedHtml}</div>
${leadMagnetHtml}
</div>`;
  return res.setHeader("Content-Type", "text/html; charset=utf-8").send(
    wrapPage(meta.title ?? "Guide", body, {
      description: meta.excerpt ?? "",
      ogImage: meta.ogImage || undefined,
      canonical: `/guides/${slug}`,
      extraCss: HUB_CSS,
    }),
  );
});

export function createGuideSignupHandler(db = pool) {
  return async function guideSignupHandler(req, res) {
    const { slug } = req.params;
    if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).send("Invalid guide.");

    let meta;
    try {
      const src = readFileSync(join(GUIDES_DIR, `${slug}.md`), "utf8");
      ({ meta } = parseFrontmatter(src));
    } catch {
      return res.status(404).send("Guide not found.");
    }

    if (!meta.leadMagnetFile) return res.status(400).send("This guide has no downloadable resource.");

    const rawEmail = (req.body?.email ?? "").toString().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return res.redirect(302, `/guides/${encodeURIComponent(slug)}?error=invalid-email`);
    }

    const email = rawEmail.toLowerCase();
    try {
      await db.query(
        "INSERT INTO email_signups (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING",
        [email, "guide"],
      );
    } catch (err) {
      console.error("guide email_signups insert error", err);
    }

    const baseUrl = process.env.BASE_URL ?? "https://getformai.com";
    const downloadUrl = `${baseUrl}${meta.leadMagnetFile}`;
    sendEmail({
      to: email,
      subject: `Your download - ${meta.title ?? "Formai Guide"}`,
      text: `Here's your download:\n\n${downloadUrl}\n\nHappy training,\nFormai`,
      html: `<p>Here's your download: <a href="${escapeHtml(downloadUrl)}">${escapeHtml(meta.leadMagnetTitle ?? "Download")}</a></p><p>Happy training,<br>Formai</p>`,
    }).catch(() => {});

    return res.redirect(302, meta.leadMagnetFile);
  };
}

contentHubRouter.post(
  "/guides/:slug/signup",
  express.urlencoded({ extended: false }),
  createGuideSignupHandler(),
);
