import express from "express";
import QRCode from "qrcode";
import { escapeHtml } from "./referralLanding.js";
import { wrapPage } from "../views/pageChrome.js";

export const marketingRouter = express.Router();

const HOME_CSS = `
.hero { text-align: center; padding: 64px 24px 48px; }
.hero-img { margin: 0 auto 40px; width: 220px; }
.hero h1 { font-size: clamp(28px, 6vw, 52px); font-weight: 800; line-height: 1.15; letter-spacing: 0; margin-bottom: 16px; }
.hero p { color: #94A3B8; font-size: 18px; max-width: 520px; margin: 0 auto 32px; }
.who-section { padding: 64px 0; border-top: 1px solid #1E293B; }
.who-section h2, .how-section h2, .features-section h2, .bottom-cta h2 { font-size: 28px; font-weight: 700; margin-bottom: 32px; text-align: center; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.two-col h3 { color: #22D3EE; font-size: 18px; margin-bottom: 12px; }
.two-col ul { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.two-col ul li::before { content: ".  "; color: #22D3EE; }
.two-col ul li { color: #94A3B8; }
.how-section { padding: 64px 0; border-top: 1px solid #1E293B; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
.step { background: #1E293B; border-radius: 12px; padding: 28px; }
.step-num { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; background: #22D3EE; color: #0F172A; font-weight: 800; border-radius: 50%; margin-bottom: 16px; }
.step h3 { font-size: 17px; margin-bottom: 8px; }
.step p { color: #94A3B8; font-size: 14px; }
.features-section { padding: 64px 0; border-top: 1px solid #1E293B; }
.feature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.feature-card { background: #1E293B; border-radius: 12px; padding: 28px; }
.feature-card h3 { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
.feature-card p { color: #94A3B8; font-size: 14px; }
.email-capture-strip { padding: 64px 24px; border-top: 1px solid #1E293B; text-align: center; }
.email-capture-strip h2 { font-size: 26px; font-weight: 700; margin-bottom: 10px; }
.email-capture-strip p { color: #94A3B8; margin-bottom: 24px; }
.strip-form { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.strip-form input[type=email] { background: #1E293B; border: 1px solid #334155; border-radius: 999px; padding: 12px 20px; color: #F1F5F9; font-size: 15px; min-width: 240px; outline: none; }
.strip-form input[type=email]:focus { border-color: #22D3EE; }
.bottom-cta { padding: 80px 24px; text-align: center; border-top: 1px solid #1E293B; }
.bottom-cta h2 { margin-bottom: 24px; }
@media (max-width: 600px) { .two-col, .steps, .feature-grid { grid-template-columns: 1fr; } }
`;

const DOWNLOAD_CSS = `
.download-page { text-align: center; padding: 80px 24px; }
.download-icon { width: 100px; height: 100px; margin: 0 auto 24px; }
.download-page h1 { font-size: 36px; font-weight: 800; margin-bottom: 12px; }
.download-page .tagline { color: #94A3B8; font-size: 18px; margin-bottom: 40px; }
.qr-wrap { margin: 0 auto 32px; width: 200px; background: #1E293B; border-radius: 16px; padding: 20px; }
.qr-wrap svg { display: block; max-width: 100%; height: auto; }
.scan-label { color: #94A3B8; font-size: 13px; margin-bottom: 32px; }
`;

const LEGAL_CSS = `
.legal-page { padding: 48px 0 80px; }
.legal-page h1 { font-size: 32px; font-weight: 800; margin-bottom: 8px; }
.legal-page .effective { color: #94A3B8; font-size: 14px; margin-bottom: 40px; }
.legal-page h2 { font-size: 20px; font-weight: 700; margin: 40px 0 12px; padding-top: 40px; border-top: 1px solid #1E293B; }
.legal-page h2:first-of-type { border-top: none; padding-top: 0; }
.legal-page h3 { font-size: 16px; font-weight: 600; margin: 24px 0 8px; color: #CBD5E1; }
.legal-page p { color: #94A3B8; margin-bottom: 16px; }
.legal-page ul { list-style: disc; padding-left: 24px; margin-bottom: 16px; }
.legal-page ul li { color: #94A3B8; margin-bottom: 6px; }
.legal-page table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px; }
.legal-page th { text-align: left; padding: 10px 12px; background: #1E293B; color: #F1F5F9; font-weight: 600; }
.legal-page td { padding: 10px 12px; border-bottom: 1px solid #1E293B; color: #94A3B8; vertical-align: top; }
.legal-page strong { color: #F1F5F9; font-weight: 600; }
.legal-page hr { border: none; border-top: 1px solid #1E293B; margin: 32px 0; }
.legal-page a { color: #22D3EE; }
`;

const SUPPORT_CSS = `
.support-page { padding: 48px 0 80px; }
.support-page h1 { font-size: 32px; font-weight: 800; margin-bottom: 8px; }
.support-page .intro { color: #94A3B8; margin-bottom: 48px; }
.support-page h2 { font-size: 22px; font-weight: 700; margin-bottom: 24px; }
.faq-item { border-top: 1px solid #1E293B; padding: 20px 0; }
.faq-item:last-of-type { border-bottom: 1px solid #1E293B; }
.faq-q { font-size: 16px; font-weight: 600; margin-bottom: 10px; }
.faq-a { color: #94A3B8; font-size: 15px; }
.faq-a a { color: #22D3EE; }
.contact-section { margin-top: 64px; background: #1E293B; border-radius: 16px; padding: 32px; }
.contact-section h2 { font-size: 20px; font-weight: 700; margin-bottom: 12px; }
.contact-section p { color: #94A3B8; margin-bottom: 8px; }
.contact-section a { color: #22D3EE; font-weight: 600; }
`;

const PRIVACY_HTML = `
<h1>Privacy Policy</h1>
<p class="effective">Effective date: 15 May 2026</p>
<p>This Privacy Policy explains how Formai ("we", "us", or "our") collects, uses, and protects your personal information when you use the Formai mobile application and website at getformai.com (together, the "Service").</p>
<p>By using the Service, you agree to the collection and use of information as described in this policy.</p>
<h2>1. Who We Are</h2>
<p>Formai is operated by Engle Consulting Limited, a company registered in England and Wales. If you have any questions about this policy, contact us at alecpringle@outlook.com.</p>
<h2>2. Information We Collect</h2>
<h3>Information you provide directly</h3>
<ul>
<li><strong>Account information:</strong> your email address and password (stored as a one-way hash - we cannot read your password).</li>
<li><strong>Profile and fitness data:</strong> your age, height, weight, training goals, experience level, available equipment, and training schedule.</li>
<li><strong>Workout logs:</strong> sets, reps, weights, and performance data logged during your sessions.</li>
<li><strong>Physique photos:</strong> optional photos for AI-assisted progress tracking. These are stored encrypted and are never shared with third parties except as described below.</li>
</ul>
<h3>Information collected automatically</h3>
<ul>
<li><strong>Device and usage data:</strong> device type, operating system, app version, and usage patterns for debugging and improving the app.</li>
<li><strong>Error reports:</strong> crash and error reports sent to Sentry. These do not include your workout data or photos.</li>
<li><strong>Push notification tokens:</strong> stored only if you enable push notifications.</li>
</ul>
<h3>Information from Apple Health (optional)</h3>
<p>If you grant permission, we may read resting heart rate, HRV, and sleep duration. This data is used only to personalise your training recommendations and is not shared with third parties.</p>
<h2>3. How We Use Your Information</h2>
<table><thead><tr><th>Purpose</th><th>Legal basis</th></tr></thead><tbody>
<tr><td>Providing and personalising the Service</td><td>Performance of contract</td></tr>
<tr><td>Processing your subscription via Apple's In-App Purchase</td><td>Performance of contract</td></tr>
<tr><td>Sending training reminders and personal record alerts</td><td>Consent</td></tr>
<tr><td>Detecting and fixing errors</td><td>Legitimate interests</td></tr>
<tr><td>Improving the app based on usage patterns</td><td>Legitimate interests</td></tr>
<tr><td>Communicating with you about your account</td><td>Performance of contract</td></tr>
<tr><td>Complying with legal obligations</td><td>Legal obligation</td></tr>
</tbody></table>
<p>We do not sell your personal data. We do not use your data for advertising.</p>
<h2>4. Third-Party Services</h2>
<table><thead><tr><th>Service</th><th>Purpose</th><th>Data shared</th></tr></thead><tbody>
<tr><td><strong>RevenueCat</strong></td><td>Subscription billing and entitlement management</td><td>Your App Store receipt; no personally identifying information</td></tr>
<tr><td><strong>Sentry</strong></td><td>Error monitoring and crash reporting</td><td>Device info and app state at time of error</td></tr>
<tr><td><strong>Expo</strong></td><td>Delivering push notifications</td><td>Your device push token</td></tr>
<tr><td><strong>Fly.io</strong></td><td>Hosting the Formai API and database</td><td>All data stored in our database</td></tr>
<tr><td><strong>AWS S3-compatible storage</strong></td><td>Storing physique photos and media assets</td><td>Physique photos encrypted at rest</td></tr>
<tr><td><strong>OpenAI</strong></td><td>AI analysis of physique photos if you use this feature</td><td>The photo you submit for that check-in only</td></tr>
</tbody></table>
<h2>5. Data Storage and Security</h2>
<p>Your data is stored on servers located in the European Union. We use industry-standard encryption in transit and at rest. Passwords are hashed using bcrypt and cannot be recovered or read by us.</p>
<h2>6. How Long We Keep Your Data</h2>
<p>We retain your data for as long as your account is active. If you delete your account, your profile, workout history, and all personal data are permanently deleted from our database within 30 days, and physique photos are deleted from storage immediately.</p>
<h2>7. Your Rights</h2>
<ul>
<li><strong>Access</strong> the personal data we hold about you</li>
<li><strong>Correct</strong> inaccurate data</li>
<li><strong>Delete</strong> your account and associated data</li>
<li><strong>Export</strong> your workout data</li>
<li><strong>Withdraw consent</strong> for optional processing</li>
</ul>
<p>To exercise these rights, contact us at alecpringle@outlook.com. To delete your account, go to Settings - Account - Delete Account in the app.</p>
<h2>8. Children</h2>
<p>The Service is not directed at children under 16. We do not knowingly collect personal data from anyone under 16.</p>
<h2>9. Changes to This Policy</h2>
<p>We may update this policy from time to time. If we make material changes, we will notify you via the app or by email at least 14 days before the changes take effect.</p>
<h2>10. Contact</h2>
<p><strong>Email:</strong> alecpringle@outlook.com<br><strong>Website:</strong> getformai.com/support</p>
<p>As a UK-based company, our lead supervisory authority is the <strong>Information Commissioner's Office (ICO)</strong>. You have the right to lodge a complaint with the ICO at <a href="https://ico.org.uk">ico.org.uk</a> or by calling 0303 123 1113.</p>
<p>If you are resident in the European Union, you may also lodge a complaint with your national data protection authority.</p>`;

const TERMS_HTML = `
<h1>Terms of Service</h1>
<p class="effective">Effective date: 15th May 2026</p>
<p>These Terms of Service ("Terms") govern your use of the Formai mobile application and website at getformai.com (together, the "Service"), operated by Engle Consulting Limited ("Formai", "we", "us", or "our").</p>
<p>By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.</p>
<h2>1. Eligibility</h2><p>You must be at least 16 years old to use the Service. The Service is intended for personal, non-commercial fitness training use.</p>
<h2>2. Your Account</h2><p>You are responsible for maintaining the security of your account credentials. If you suspect unauthorised access, contact us immediately at alecpringle@outlook.com.</p>
<h2>3. Subscription and Billing</h2>
<h3>Free trial</h3><p>New accounts receive a <strong>14-day free trial</strong>. If you were referred by an existing user with a valid referral code, your trial is extended to <strong>21 days</strong>.</p>
<h3>Subscription</h3><p>After your trial period, continued access requires a paid subscription. Pricing and billing intervals are displayed in the app before purchase.</p>
<h3>Billing through Apple</h3><ul><li>You authorise Apple to charge your Apple ID payment method on a recurring basis.</li><li>Your subscription renews unless cancelled at least 24 hours before the current billing period ends.</li><li>You can manage and cancel via iPhone Settings - [Your Name] - Subscriptions - Formai.</li></ul>
<p><strong>We do not process payment information directly.</strong> Billing disputes and refund requests must be directed to Apple.</p>
<h3>Refunds</h3><p>Refund requests are handled by Apple under their standard App Store refund policy. To request a refund, visit <a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a>.</p>
<h3>Price changes</h3><p>We reserve the right to change subscription pricing and will provide at least 30 days' notice of any price increase.</p>
<h2>4. Referral Programme</h2><p>You may share your referral link to invite new users. Referral rewards may be granted when a referred user becomes a paying subscriber. Abuse of the referral programme may result in account termination.</p>
<h2>5. Acceptable Use</h2><ul><li>Do not use the Service for unlawful purposes.</li><li>Do not reverse-engineer or extract source code.</li><li>Do not disrupt the Service or its servers.</li><li>Do not create multiple accounts to abuse the free trial.</li><li>Do not scrape data or build a competing product.</li></ul>
<h2>6. Your Content</h2><p>You retain ownership of your fitness data and optional physique photos. By submitting Your Content, you grant Formai a limited licence to store and process it solely to provide the Service.</p>
<h2>7. Health and Safety Disclaimer</h2><p><strong>The Service provides training programming and fitness guidance. It is not a substitute for professional medical advice, diagnosis, or treatment.</strong></p><p>Train within your limits. Stop any exercise that causes pain or discomfort.</p>
<h2>8. Intellectual Property</h2><p>The Service, including its design, code, content, and branding, is owned by Formai. Your account data and workout logs belong to you.</p>
<h2>9. Termination</h2><p>We may suspend or terminate your account if you violate these Terms or engage in fraudulent activity. You may close your account at any time via Settings - Account - Delete Account.</p>
<h2>10. Limitation of Liability</h2><p>To the maximum extent permitted by law, Formai shall not be liable for indirect, incidental, special, consequential, or punitive damages. Nothing limits liability for death or personal injury caused by negligence, fraud, or any liability that cannot be excluded by law.</p>
<h2>11. Disclaimer of Warranties</h2><p>The Service is provided "as is" and "as available" without warranties of any kind.</p>
<h2>12. Governing Law and Dispute Resolution</h2><p>These Terms are governed by the laws of England and Wales.</p>
<h3>Informal resolution first</h3><p>Before raising any formal dispute, you agree to contact us and give us 30 days to attempt an informal resolution.</p>
<h3>Binding arbitration</h3><p>If a dispute cannot be resolved informally, it shall be finally settled by binding arbitration under the UNCITRAL Arbitration Rules, as administered by the London Court of International Arbitration (LCIA).</p><ul><li>Conducted in English</li><li>Seated in London, England</li><li>Decided by a sole arbitrator</li></ul>
<h3>Exceptions</h3><p>Nothing prevents either party from seeking urgent injunctive or other equitable relief from a court.</p>
<h3>Consumer rights</h3><p>If you are a consumer resident in the United Kingdom or European Union, nothing affects your statutory rights. EU consumers may use the European Commission's Online Dispute Resolution platform at <a href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</a>.</p>
<h3>No class actions</h3><p>To the extent permitted by law, disputes must be brought on an individual basis and not as part of a class, consolidated, or representative action.</p>
<h2>13. Changes to These Terms</h2><p>We may update these Terms from time to time and will notify you of material changes via the app or email.</p>
<h2>14. Contact</h2><p><strong>Email:</strong> alecpringle@outlook.com<br><strong>Website:</strong> getformai.com/support</p>`;

let cachedQrSvg = null;
const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Formai",
  operatingSystem: "iOS",
  applicationCategory: "HealthApplication",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "GBP",
    description: "14-day free trial",
  },
  url: "https://getformai.com",
};

async function getQrSvg() {
  if (cachedQrSvg) return cachedQrSvg;
  const url = process.env.APP_STORE_URL || "https://getformai.com/download";
  try {
    cachedQrSvg = await QRCode.toString(url, {
      type: "svg",
      width: 200,
      color: { dark: "#F1F5F9", light: "#0F172A" },
    });
  } catch {
    cachedQrSvg = "";
  }
  return cachedQrSvg;
}

function sendHtml(res, title, body, css) {
  res.setHeader("Content-Type", "text/html; charset=utf-8").send(wrapPage(title, body, css));
}

function homeHandler(_req, res) {
  const appStoreUrl = escapeHtml(process.env.APP_STORE_URL ?? "#");
  const body = `
<section class="hero">
  <img src="/images/formai_hero@2x.png" alt="Formai app on iPhone" class="hero-img">
  <h1>Train with your data,<br>not your guesswork.</h1>
  <p>Formai builds personalised strength and conditioning programs that adapt to your performance - every session.</p>
  <a href="${appStoreUrl}" class="cta-btn">Download on App Store</a>
  <p class="trial-note">14-day free trial - no payment required</p>
</section>
<div class="container">
  <section class="who-section"><h2>Built for serious athletes</h2><div class="two-col"><div><h3>Hyrox athletes</h3><ul><li>Station-specific conditioning blocks</li><li>Race-day simulation workouts</li><li>Pace and time-to-complete progression</li></ul></div><div><h3>Strength athletes</h3><ul><li>Auto-regulating load progression</li><li>Programmes built around your equipment</li><li>Adapts based on your results each session</li></ul></div></div></section>
  <section class="how-section"><h2>How it works</h2><div class="steps"><div class="step"><div class="step-num">1</div><h3>Complete your assessment</h3><p>Tell us your goals, experience, equipment, and schedule. Takes 5 minutes.</p></div><div class="step"><div class="step-num">2</div><h3>Get your programme</h3><p>Formai generates a personalised programme built around your life and training goals.</p></div><div class="step"><div class="step-num">3</div><h3>It adapts as you improve</h3><p>Every session you log sharpens the engine. Loads, reps, and intensity update automatically.</p></div></div></section>
  <section class="features-section"><h2>What sets Formai apart</h2><div class="feature-grid"><div class="feature-card"><h3>Personalised progression</h3><p>Loads and reps adjust based on your actual performance.</p></div><div class="feature-card"><h3>Hyrox-ready conditioning</h3><p>Station-by-station programming with pace and time-to-complete tracking.</p></div><div class="feature-card"><h3>Physique tracking</h3><p>Optional AI-assisted progress check-ins with week-on-week comparisons.</p></div><div class="feature-card"><h3>Coach-quality cues</h3><p>Technique guidance and form cues for every exercise.</p></div></div></section>
</div>
<section class="email-capture-strip">
  <div class="container">
    <h2>Stay in the loop.</h2>
    <p>Training tips and app updates, straight to your inbox.</p>
    <form method="POST" action="/signup" class="strip-form">
      <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
      <button type="submit" class="cta-btn">Sign me up</button>
    </form>
  </div>
</section>
<section class="bottom-cta"><h2>Ready to train smarter?</h2><a href="${appStoreUrl}" class="cta-btn">Download on App Store</a><p class="trial-note">14-day free trial - no credit card required</p></section>`;
  sendHtml(res, "Home", body, {
    description: "Personalised strength and Hyrox training programs that adapt to your performance - every session.",
    canonical: "/",
    extraCss: HOME_CSS,
    jsonLd: softwareAppSchema,
  });
}

async function downloadHandler(_req, res) {
  const qrSvg = await getQrSvg();
  const appStoreUrl = escapeHtml(process.env.APP_STORE_URL ?? "#");
  const body = `<div class="download-page"><img src="/images/formai_icon.svg" alt="Formai" class="download-icon"><h1>Get Formai</h1><p class="tagline">Train with your data, not your guesswork.</p>${qrSvg ? `<div class="qr-wrap">${qrSvg}</div><p class="scan-label">Scan to download on iPhone</p>` : ""}<a href="${appStoreUrl}" class="cta-btn">Download on App Store</a><p class="trial-note">14-day free trial - no payment required</p></div>`;
  sendHtml(res, "Download", body, {
    description: "Download Formai on the App Store. Start your free 14-day trial - no credit card required.",
    canonical: "/download",
    extraCss: DOWNLOAD_CSS,
    jsonLd: softwareAppSchema,
  });
}

function privacyHandler(_req, res) {
  sendHtml(res, "Privacy Policy", `<div class="container-narrow legal-page">${PRIVACY_HTML}</div>`, {
    description: "Formai Privacy Policy - how we collect, use, and protect your data.",
    canonical: "/privacy",
    extraCss: LEGAL_CSS,
  });
}

function termsHandler(_req, res) {
  sendHtml(res, "Terms of Service", `<div class="container-narrow legal-page">${TERMS_HTML}</div>`, {
    description: "Formai Terms of Service - subscription, billing, referral programme, and governing law.",
    canonical: "/terms",
    extraCss: LEGAL_CSS,
  });
}

function supportHandler(_req, res) {
  const supportEmail = escapeHtml(process.env.SUPPORT_EMAIL ?? "support@getformai.com");
  const body = `<div class="container-narrow support-page">
  <h1>Support</h1><p class="intro">Get answers to common questions, or contact us directly.</p><h2>Frequently asked questions</h2>
  <div class="faq-item"><p class="faq-q">How do I cancel my subscription?</p><p class="faq-a">Subscriptions are managed through Apple. Go to iPhone Settings - [Your Name] - Subscriptions - Formai, then tap Cancel Subscription.</p></div>
  <div class="faq-item"><p class="faq-q">Can I use Formai without a subscription?</p><p class="faq-a">Yes - new accounts include a 14-day free trial with full access to all features.</p></div>
  <div class="faq-item"><p class="faq-q">How do I delete my account and data?</p><p class="faq-a">Go to Settings - Account - Delete Account in the app.</p></div>
  <div class="faq-item"><p class="faq-q">The app isn't connecting - what do I do?</p><p class="faq-a">Try closing and reopening the app. If errors continue, contact us at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p></div>
  <div class="faq-item"><p class="faq-q">How do I update my training schedule or equipment?</p><p class="faq-a">Go to Settings - Recalibrate in the app.</p></div>
  <div class="faq-item"><p class="faq-q">What is Hyrox and does Formai support it?</p><p class="faq-a">Hyrox combines running and functional workout stations. Formai has native support for Hyrox conditioning.</p></div>
  <div class="faq-item"><p class="faq-q">How does the programme adapt to my performance?</p><p class="faq-a">After each session, Formai analyses your logged sets, reps, and weights against your target ranges.</p></div>
  <div class="contact-section"><h2>Contact us</h2><p>Can't find what you're looking for? We're happy to help.</p><p>Email: <a href="mailto:${supportEmail}">${supportEmail}</a></p><p>We aim to respond within 2 business days.</p></div>
</div>`;
  sendHtml(res, "Support", body, {
    description: "Formai support and FAQ - get help with your subscription, account, and training programme.",
    canonical: "/support",
    extraCss: SUPPORT_CSS,
  });
}

marketingRouter.get("/", homeHandler);
marketingRouter.get("/download", downloadHandler);
marketingRouter.get("/privacy", privacyHandler);
marketingRouter.get("/terms", termsHandler);
marketingRouter.get("/support", supportHandler);
