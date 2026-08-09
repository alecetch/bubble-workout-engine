import express from "express";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "./referralLanding.js";
import { gatePage, wrapPage } from "../views/pageChrome.js";
import { pool } from "../db.js";
import { insertEmailSignupAndNotify } from "./websiteEnhancements.js";

export const marketingRouter = express.Router();

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const TESTIMONIALS_FILE = join(__dirname, "../../content/testimonials.json");
const PRESS_MENTIONS_FILE = join(__dirname, "../../content/press-mentions.json");

const TESTIMONIAL_CARD_CSS = `
.testimonial-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 18px; min-height: 100%; }
.testimonial-card blockquote { color: #CBD5E1; font-size: 15px; line-height: 1.65; }
.testimonial-person { display: flex; align-items: center; gap: 12px; margin-top: auto; }
.testimonial-avatar { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 50%; color: #0F172A; font-weight: 800; flex: 0 0 auto; }
.testimonial-name { font-weight: 700; color: #F1F5F9; }
.testimonial-handle { color: #94A3B8; font-size: 13px; }
`;

const HOME_CSS = `
.hero { text-align: center; padding: 64px 24px 48px; }
.hero-img { margin: 0 auto 40px; width: 220px; }
.hero h1 { font-size: clamp(28px, 6vw, 52px); font-weight: 800; line-height: 1.15; letter-spacing: 0; margin-bottom: 16px; }
.hero p { color: #94A3B8; font-size: 18px; max-width: 520px; margin: 0 auto 32px; }
.who-section { padding: 64px 0; border-top: 1px solid #1E293B; }
.who-section h2, .how-section h2, .features-section h2, .testimonials-strip h2, .bottom-cta h2 { font-size: 28px; font-weight: 700; margin-bottom: 32px; text-align: center; }
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
.testimonials-strip { padding: 64px 0; border-top: 1px solid #1E293B; }
.testimonials-intro { color: #94A3B8; text-align: center; max-width: 520px; margin: -18px auto 32px; }
.strip-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 24px; }
.strip-link { display: block; color: #22D3EE; font-weight: 700; text-align: center; }
.email-capture-strip { padding: 64px 24px; border-top: 1px solid #1E293B; text-align: center; }
.email-capture-strip h2 { font-size: 26px; font-weight: 700; margin-bottom: 10px; }
.email-capture-strip p { color: #94A3B8; margin-bottom: 24px; }
.strip-form { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.strip-form input[type=email] { background: #1E293B; border: 1px solid #334155; border-radius: 999px; padding: 12px 20px; color: #F1F5F9; font-size: 15px; min-width: 240px; outline: none; }
.strip-form input[type=email]:focus { border-color: #22D3EE; }
.bottom-cta { padding: 80px 24px; text-align: center; border-top: 1px solid #1E293B; }
.bottom-cta h2 { margin-bottom: 24px; }
${TESTIMONIAL_CARD_CSS}
@media (max-width: 760px) { .strip-grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .two-col, .steps, .feature-grid { grid-template-columns: 1fr; } }
`;

const TESTIMONIALS_CSS = `
.testimonials-page { padding: 64px 0 80px; }
.testimonials-hero { text-align: center; margin-bottom: 48px; }
.testimonials-hero h1 { font-size: clamp(30px, 6vw, 48px); font-weight: 800; line-height: 1.15; margin-bottom: 16px; }
.testimonials-hero p { color: #94A3B8; font-size: 18px; max-width: 620px; margin: 0 auto; }
.testimonials-rating { display: inline-flex; align-items: center; gap: 8px; margin-top: 24px; background: #1E293B; border: 1px solid #334155; border-radius: 999px; padding: 8px 16px; color: #F8FAFC; font-weight: 700; }
.testimonials-rating span { color: #22D3EE; }
.testimonials-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
.testimonials-cta { margin-top: 56px; text-align: center; border-top: 1px solid #1E293B; padding-top: 48px; }
.testimonials-cta h2 { font-size: 26px; font-weight: 700; margin-bottom: 18px; }
${TESTIMONIAL_CARD_CSS}
@media (max-width: 720px) { .testimonials-grid { grid-template-columns: 1fr; } }
`;

const LANDING_CSS = `
.landing-hero { text-align: center; padding: 72px 24px 56px; }
.landing-hero h1 { font-size: clamp(28px, 7vw, 52px); font-weight: 800; line-height: 1.1; margin-bottom: 16px; }
.landing-hero .subhead { color: #94A3B8; font-size: clamp(16px, 2.5vw, 20px); max-width: 600px; margin: 0 auto 32px; line-height: 1.6; }
.landing-why { max-width: 700px; margin: 0 auto 64px; padding: 0 24px; }
.landing-why h2 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
.landing-why p { color: #94A3B8; line-height: 1.7; }
.landing-icons { display: flex; justify-content: center; gap: 40px; margin-top: 32px; flex-wrap: wrap; }
.landing-icon-item { text-align: center; max-width: 140px; }
.landing-icon-item .icon { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: #22D3EE; color: #0F172A; font-weight: 800; margin-bottom: 8px; }
.landing-icon-item .label { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.landing-icon-item .sublabel { color: #64748B; font-size: 12px; }
.landing-features { max-width: 800px; margin: 0 auto 64px; padding: 0 24px; }
.landing-features h2 { font-size: 22px; font-weight: 700; margin-bottom: 32px; text-align: center; }
.feature-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
.feature-card { background: #1E293B; border: 1px solid #334155; border-radius: 16px; padding: 24px; }
.feature-card h3 { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
.feature-card p { color: #94A3B8; font-size: 14px; line-height: 1.6; }
.landing-testimonial { max-width: 640px; margin: 0 auto 64px; padding: 0 24px; }
.landing-testimonial blockquote { background: #1E293B; border-left: 4px solid #22D3EE; border-radius: 0 12px 12px 0; padding: 24px 28px; color: #CBD5E1; font-size: 16px; line-height: 1.7; font-style: italic; margin: 0 0 12px; }
.landing-testimonial .attribution { color: #64748B; font-size: 13px; padding-left: 4px; }
.landing-faq { max-width: 680px; margin: 0 auto 64px; padding: 0 24px; }
.landing-faq h2 { font-size: 22px; font-weight: 700; margin-bottom: 24px; }
.faq-item { border-top: 1px solid #1E293B; padding: 18px 0; }
.faq-item:last-child { border-bottom: 1px solid #1E293B; }
.faq-q { font-weight: 600; margin-bottom: 8px; }
.faq-a { color: #94A3B8; font-size: 14px; line-height: 1.6; }
.landing-cta { text-align: center; padding: 0 24px 80px; }
.email-capture-strip { padding: 56px 24px; border-top: 1px solid #1E293B; text-align: center; }
.email-capture-strip h2 { font-size: 22px; font-weight: 700; margin-bottom: 10px; }
.email-capture-strip p { color: #94A3B8; margin-bottom: 24px; }
.strip-form { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.strip-form input[type=email] { background: #1E293B; border: 1px solid #334155; border-radius: 999px; padding: 12px 20px; color: #F1F5F9; font-size: 15px; min-width: 240px; outline: none; }
.strip-form input[type=email]:focus { border-color: #22D3EE; }
@media (max-width: 600px) { .feature-grid { grid-template-columns: 1fr; } .landing-icons { gap: 24px; } }
`;

const PRESS_CSS = `
.press-page { padding: 64px 0 80px; }
.press-hero { margin-bottom: 56px; padding: 0 24px; }
.press-hero h1 { font-size: clamp(28px, 6vw, 44px); font-weight: 800; margin-bottom: 12px; }
.press-hero p { color: #94A3B8; font-size: 18px; max-width: 600px; }
.press-contact-line { margin-top: 16px; font-size: 15px; }
.press-contact-line a { color: #22D3EE; }
.press-section { max-width: 760px; margin: 0 auto 56px; padding: 0 24px; }
.press-section h2 { font-size: 22px; font-weight: 700; margin-bottom: 20px; }
.press-about p { color: #94A3B8; line-height: 1.75; margin-bottom: 14px; }
.facts-list { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.facts-list li { background: #1E293B; border-radius: 10px; padding: 14px 18px; font-size: 14px; }
.facts-list li strong { color: #F1F5F9; display: block; margin-bottom: 2px; }
.facts-list li span { color: #94A3B8; }
.asset-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
.asset-card { background: #1E293B; border: 1px solid #334155; border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
.asset-preview { background: #0F172A; border-radius: 8px; padding: 12px; display: flex; align-items: center; justify-content: center; width: 100%; min-height: 80px; }
.asset-preview img { max-width: 160px; max-height: 60px; object-fit: contain; }
.asset-name { font-weight: 600; font-size: 14px; }
.asset-download { color: #22D3EE; font-size: 13px; font-weight: 600; text-decoration: none; }
.asset-download:hover { text-decoration: underline; }
.brand-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.brand-table th { text-align: left; color: #64748B; font-weight: 500; padding: 8px 0; border-bottom: 1px solid #1E293B; }
.brand-table td { padding: 10px 0; border-bottom: 1px solid #1E293B; color: #94A3B8; }
.brand-table td:first-child { color: #F1F5F9; font-weight: 500; width: 40%; }
.colour-chip { display: inline-block; width: 14px; height: 14px; border-radius: 3px; vertical-align: middle; margin-right: 6px; border: 1px solid #334155; }
.brand-dos { list-style: none; padding: 0; }
.brand-dos li { font-size: 14px; padding: 6px 0; color: #94A3B8; }
.brand-dos li::before { margin-right: 8px; font-weight: 700; }
.brand-dos li.do::before { content: "+"; color: #22D3EE; }
.brand-dos li.dont::before { content: "x"; color: #F87171; }
.press-mentions-grid { display: flex; flex-direction: column; gap: 16px; }
.mention-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
.mention-pub { font-weight: 700; font-size: 14px; margin-bottom: 6px; }
.mention-headline a { color: #F1F5F9; font-size: 16px; font-weight: 600; text-decoration: none; }
.mention-headline a:hover { color: #22D3EE; }
.mention-date { color: #64748B; font-size: 12px; margin-top: 6px; }
.mention-placeholder { background: #1E293B; border: 1px dashed #334155; border-radius: 12px; padding: 28px; text-align: center; color: #64748B; font-size: 14px; }
@media (max-width: 600px) { .asset-grid { grid-template-columns: 1fr; } .facts-list { grid-template-columns: 1fr; } }
`;

const DOWNLOAD_CSS = `
.download-page { text-align: center; padding: 80px 24px; }
.download-icon { width: 100px; height: 100px; margin: 0 auto 24px; }
.download-page h1 { font-size: 36px; font-weight: 800; margin-bottom: 12px; }
.download-page .tagline { color: #94A3B8; font-size: 18px; max-width: 520px; margin: 0 auto 28px; }
.download-success, .download-error { max-width: 520px; margin: 0 auto 24px; border-radius: 10px; padding: 12px 16px; font-size: 14px; }
.download-success { background: rgba(34, 211, 238, 0.12); border: 1px solid rgba(34, 211, 238, 0.35); color: #A5F3FC; }
.download-error { background: rgba(248, 113, 113, 0.12); border: 1px solid rgba(248, 113, 113, 0.35); color: #FCA5A5; }
.strip-form { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.strip-form input[type=email] { background: #1E293B; border: 1px solid #334155; border-radius: 999px; padding: 12px 20px; color: #F1F5F9; font-size: 15px; min-width: 260px; outline: none; }
.strip-form input[type=email]:focus { border-color: #22D3EE; }
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
<p>This Privacy Policy explains how Forma ("we", "us", or "our") collects, uses, and protects your personal information when you use the Forma mobile application and website at getforma.fit (together, the "Service").</p>
<p>By using the Service, you agree to the collection and use of information as described in this policy.</p>
<h2>1. Who We Are</h2>
<p>Forma is operated by Engle Consulting Limited, a company registered in England and Wales. If you have any questions about this policy, contact us at alecpringle@outlook.com.</p>
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
<tr><td><strong>Fly.io</strong></td><td>Hosting the Forma API and database</td><td>All data stored in our database</td></tr>
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
<p><strong>Email:</strong> alecpringle@outlook.com<br><strong>Website:</strong> getforma.fit/support</p>
<p>As a UK-based company, our lead supervisory authority is the <strong>Information Commissioner's Office (ICO)</strong>. You have the right to lodge a complaint with the ICO at <a href="https://ico.org.uk">ico.org.uk</a> or by calling 0303 123 1113.</p>
<p>If you are resident in the European Union, you may also lodge a complaint with your national data protection authority.</p>`;

const TERMS_HTML = `
<h1>Terms of Service</h1>
<p class="effective">Effective date: 15th May 2026</p>
<p>These Terms of Service ("Terms") govern your use of the Forma mobile application and website at getforma.fit (together, the "Service"), operated by Engle Consulting Limited ("Forma", "we", "us", or "our").</p>
<p>By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.</p>
<h2>1. Eligibility</h2><p>You must be at least 16 years old to use the Service. The Service is intended for personal, non-commercial fitness training use.</p>
<h2>2. Your Account</h2><p>You are responsible for maintaining the security of your account credentials. If you suspect unauthorised access, contact us immediately at alecpringle@outlook.com.</p>
<h2>3. Subscription and Billing</h2>
<h3>Launch access</h3><p>Access terms, trial availability, and referral rewards will be displayed before purchase once the app is available.</p>
<h3>Subscription</h3><p>After your trial period, continued access requires a paid subscription. Pricing and billing intervals are displayed in the app before purchase.</p>
<h3>Billing through Apple</h3><ul><li>You authorise Apple to charge your Apple ID payment method on a recurring basis.</li><li>Your subscription renews unless cancelled at least 24 hours before the current billing period ends.</li><li>You can manage and cancel via iPhone Settings - [Your Name] - Subscriptions - Forma.</li></ul>
<p><strong>We do not process payment information directly.</strong> Billing disputes and refund requests must be directed to Apple.</p>
<h3>Refunds</h3><p>Refund requests are handled by Apple under their standard App Store refund policy. To request a refund, visit <a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a>.</p>
<h3>Price changes</h3><p>We reserve the right to change subscription pricing and will provide at least 30 days' notice of any price increase.</p>
<h2>4. Referral Programme</h2><p>You may share your referral link to invite new users. Referral rewards may be granted when a referred user becomes a paying subscriber. Abuse of the referral programme may result in account termination.</p>
<h2>5. Acceptable Use</h2><ul><li>Do not use the Service for unlawful purposes.</li><li>Do not reverse-engineer or extract source code.</li><li>Do not disrupt the Service or its servers.</li><li>Do not create multiple accounts to abuse the free trial.</li><li>Do not scrape data or build a competing product.</li></ul>
<h2>6. Your Content</h2><p>You retain ownership of your fitness data and optional physique photos. By submitting Your Content, you grant Forma a limited licence to store and process it solely to provide the Service.</p>
<h2>7. Health and Safety Disclaimer</h2><p><strong>The Service provides training programming and fitness guidance. It is not a substitute for professional medical advice, diagnosis, or treatment.</strong></p><p>Train within your limits. Stop any exercise that causes pain or discomfort.</p>
<h2>8. Intellectual Property</h2><p>The Service, including its design, code, content, and branding, is owned by Forma. Your account data and workout logs belong to you.</p>
<h2>9. Termination</h2><p>We may suspend or terminate your account if you violate these Terms or engage in fraudulent activity. You may close your account at any time via Settings - Account - Delete Account.</p>
<h2>10. Limitation of Liability</h2><p>To the maximum extent permitted by law, Forma shall not be liable for indirect, incidental, special, consequential, or punitive damages. Nothing limits liability for death or personal injury caused by negligence, fraud, or any liability that cannot be excluded by law.</p>
<h2>11. Disclaimer of Warranties</h2><p>The Service is provided "as is" and "as available" without warranties of any kind.</p>
<h2>12. Governing Law and Dispute Resolution</h2><p>These Terms are governed by the laws of England and Wales.</p>
<h3>Informal resolution first</h3><p>Before raising any formal dispute, you agree to contact us and give us 30 days to attempt an informal resolution.</p>
<h3>Binding arbitration</h3><p>If a dispute cannot be resolved informally, it shall be finally settled by binding arbitration under the UNCITRAL Arbitration Rules, as administered by the London Court of International Arbitration (LCIA).</p><ul><li>Conducted in English</li><li>Seated in London, England</li><li>Decided by a sole arbitrator</li></ul>
<h3>Exceptions</h3><p>Nothing prevents either party from seeking urgent injunctive or other equitable relief from a court.</p>
<h3>Consumer rights</h3><p>If you are a consumer resident in the United Kingdom or European Union, nothing affects your statutory rights. EU consumers may use the European Commission's Online Dispute Resolution platform at <a href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</a>.</p>
<h3>No class actions</h3><p>To the extent permitted by law, disputes must be brought on an individual basis and not as part of a class, consolidated, or representative action.</p>
<h2>13. Changes to These Terms</h2><p>We may update these Terms from time to time and will notify you of material changes via the app or email.</p>
<h2>14. Contact</h2><p><strong>Email:</strong> alecpringle@outlook.com<br><strong>Website:</strong> getforma.fit/support</p>`;

const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Forma",
  operatingSystem: "iOS",
  applicationCategory: "HealthApplication",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "GBP",
    description: "Coming soon",
  },
  url: "https://getforma.fit",
};

const AVATAR_COLOURS = ["#22D3EE", "#A7F3D0", "#FDE68A", "#FCA5A5", "#C4B5FD", "#F9A8D4", "#93C5FD", "#FDBA74"];

function readTestimonials() {
  try {
    return JSON.parse(readFileSync(TESTIMONIALS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function readPressMentions() {
  try {
    return JSON.parse(readFileSync(PRESS_MENTIONS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function avatarColour(index) {
  return AVATAR_COLOURS[index % AVATAR_COLOURS.length];
}

function testimonialCardHtml(testimonial, index = 0) {
  const quote = escapeHtml(testimonial.quote ?? "");
  const name = escapeHtml(testimonial.name ?? "");
  const handle = escapeHtml(testimonial.handle ?? "");
  const avatar = escapeHtml(testimonial.avatar_initial ?? name.slice(0, 1) ?? "?");
  return `<article class="testimonial-card">
  <blockquote>"${quote}"</blockquote>
  <div class="testimonial-person">
    <span class="testimonial-avatar" style="background:${avatarColour(index)};">${avatar}</span>
    <div><p class="testimonial-name">${name}</p><p class="testimonial-handle">${handle}</p></div>
  </div>
</article>`;
}

function sendHtml(res, title, body, css) {
  res.setHeader("Content-Type", "text/html; charset=utf-8").send(wrapPage(title, body, css));
}

function emailCaptureStripHtml() {
  return `
<section class="email-capture-strip">
  <div class="container">
    <h2>Stay in the loop.</h2>
    <p>Training tips and app updates, straight to your inbox.</p>
    <form method="POST" action="/signup" class="strip-form">
      <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
      <button type="submit" class="cta-btn">Sign me up</button>
    </form>
  </div>
</section>`;
}

function homeHandler(_req, res) {
  const featuredTestimonials = readTestimonials().slice(0, 3);
  const testimonialStripCards = featuredTestimonials.length ? featuredTestimonials.map(testimonialCardHtml).join("") : "";
  const testimonialsStripHtml = featuredTestimonials.length
    ? `<section class="testimonials-strip"><h2>What athletes are saying</h2><p class="testimonials-intro">Hyrox competitors and serious lifters already training with Forma.</p><div class="strip-grid">${testimonialStripCards}</div><a href="/testimonials" class="strip-link">See all reviews -&gt;</a></section>`
    : "";
  const body = `
<section class="hero">
  <img src="/images/forma_masthead.png" alt="Forma" class="hero-img">
  <h1>Train with your data,<br>not your guesswork.</h1>
  <p>Forma builds personalised strength and conditioning programs that adapt to your performance - every session.</p>
  <a href="/hyrox-calculator" class="cta-btn">Try the free HYROX calculator</a>
  <p class="trial-note"><a href="/download">The Forma app is coming soon</a></p>
</section>
<div class="container">
  <section class="who-section"><h2>Built for serious athletes</h2><div class="two-col"><div><h3>Hyrox athletes</h3><ul><li>Station-specific conditioning blocks</li><li>Race-day simulation workouts</li><li>Pace and time-to-complete progression</li></ul></div><div><h3>Strength athletes</h3><ul><li>Auto-regulating load progression</li><li>Programmes built around your equipment</li><li>Adapts based on your results each session</li></ul></div></div></section>
  <section class="how-section"><h2>How it works</h2><div class="steps"><div class="step"><div class="step-num">1</div><h3>Complete your assessment</h3><p>Tell us your goals, experience, equipment, and schedule. Takes 5 minutes.</p></div><div class="step"><div class="step-num">2</div><h3>Get your programme</h3><p>Forma generates a personalised programme built around your life and training goals.</p></div><div class="step"><div class="step-num">3</div><h3>It adapts as you improve</h3><p>Every session you log sharpens the engine. Loads, reps, and intensity update automatically.</p></div></div></section>
  ${testimonialsStripHtml}
  <section class="features-section"><h2>What sets Forma apart</h2><div class="feature-grid"><div class="feature-card"><h3>Personalised progression</h3><p>Loads and reps adjust based on your actual performance.</p></div><div class="feature-card"><h3>Hyrox-ready conditioning</h3><p>Station-by-station programming with pace and time-to-complete tracking.</p></div><div class="feature-card"><h3>Physique tracking</h3><p>Optional AI-assisted progress check-ins with week-on-week comparisons.</p></div><div class="feature-card"><h3>Coach-quality cues</h3><p>Technique guidance and form cues for every exercise.</p></div></div></section>
</div>
${emailCaptureStripHtml()}
<section class="bottom-cta"><h2>Ready to train smarter?</h2><a href="/hyrox-calculator" class="cta-btn">Try the free HYROX calculator</a><p class="trial-note"><a href="/download">Get launch updates for the app</a></p></section>`;
  sendHtml(res, "Home", body, {
    description: "Personalised strength and Hyrox training programs that adapt to your performance - every session.",
    canonical: "/",
    extraCss: HOME_CSS,
    jsonLd: softwareAppSchema,
  });
}

function testimonialsHandler(_req, res) {
  const testimonials = readTestimonials();
  const rating = process.env.APP_STORE_RATING ? escapeHtml(process.env.APP_STORE_RATING) : "";
  const ratingBadge = rating ? `<div class="rating-badge testimonials-rating"><span>${rating}</span> average App Store rating</div>` : "";
  const cards = testimonials.length
    ? testimonials.map(testimonialCardHtml).join("")
    : "<p style='color:#94A3B8;text-align:center;'>Testimonials coming soon.</p>";
  const body = `<div class="container testimonials-page">
  <section class="testimonials-hero">
    <h1>What Athletes Are Saying</h1>
    <p>Real feedback from people using Forma to prepare for races, rebuild consistency, and train with programmes that respond to their progress.</p>
    ${ratingBadge}
  </section>
  <section class="testimonials-grid">${cards}</section>
  <section class="testimonials-cta"><h2>Ready to train with your data?</h2><a href="/download" class="cta-btn">Get launch updates</a></section>
</div>`;
  sendHtml(res, "What Athletes Are Saying", body, {
    description: "Read Forma testimonials from Hyrox competitors, strength athletes, beginner lifters, and home gym users.",
    canonical: "/testimonials",
    extraCss: TESTIMONIALS_CSS,
  });
}

function landingTestimonialHtml(matchPattern, fallbackText) {
  const testimonials = readTestimonials();
  const testimonial = testimonials.find((entry) => matchPattern.test(entry.handle ?? "")) ?? testimonials[0];
  if (!testimonial) return fallbackText;
  return `<blockquote>${escapeHtml(testimonial.quote ?? "")}</blockquote>
  <div class="attribution">- ${escapeHtml(testimonial.name ?? "")}, ${escapeHtml(testimonial.handle ?? "")}</div>`;
}

function hyroxHandler(_req, res) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Forma",
    operatingSystem: "iOS",
    applicationCategory: "HealthApplication",
    applicationSubCategory: "FitnessApplication",
    description: "AI-powered Hyrox training programs - strength base, conditioning progression, and race-day taper.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "GBP", description: "Coming soon" },
    url: `${process.env.BASE_URL ?? "https://getforma.fit"}/hyrox`,
  };
  const testimonial = landingTestimonialHtml(
    /hyrox/i,
    "<blockquote>The conditioning progression is what sets this apart. My sled push times improved by 15 seconds over 8 weeks. Measurable.</blockquote><div class=\"attribution\">- Dan R., Hyrox qualifier, Northwest</div>",
  );
  const body = `
<section class="landing-hero">
  <div class="container">
    <h1>Your Hyrox race prep,<br>built by AI.</h1>
    <p class="subhead">Forma builds personalised 8-12 week race-prep blocks for Hyrox athletes. Every session adapts to your performance data - no coach required.</p>
    <a href="/download" class="cta-btn">Get launch updates</a>
  </div>
</section>
<section class="landing-why">
  <h2>Why Hyrox training is different</h2>
  <p>Hyrox demands two things at once: a functional strength base and the conditioning to push hard through 8 stations after running a kilometre. Standard strength programs do not develop station-specific pacing, and standard conditioning programs do not build the strength to move a loaded sled when you are already fatigued. Forma builds both, in the right ratio, for your race date.</p>
  <div class="landing-icons">
    <div class="landing-icon-item"><div class="icon">01</div><div class="label">Strength base</div><div class="sublabel">Compound lifts, race-relevant patterns</div></div>
    <div class="landing-icon-item"><div class="icon">02</div><div class="label">Station conditioning</div><div class="sublabel">Sled, ski erg, wall balls, rowing</div></div>
    <div class="landing-icon-item"><div class="icon">03</div><div class="label">Race-day taper</div><div class="sublabel">Peak on the day that matters</div></div>
  </div>
</section>
<section class="landing-features">
  <h2>How Forma handles it</h2>
  <div class="feature-grid">
    <div class="feature-card"><h3>Periodised blocks</h3><p>Base to build to peak. The engine structures your weeks so your strength base and conditioning capacity both peak in the final fortnight before race day.</p></div>
    <div class="feature-card"><h3>Station conditioning</h3><p>Tracks your sled push, ski erg, wall ball, and rowing times separately. Progresses each station at its own rate, not as a single generic conditioning score.</p></div>
    <div class="feature-card"><h3>Hybrid session design</h3><p>Combines functional strength with conditioning in the right ratio for each training phase. Your build phase looks different from your base phase because it should.</p></div>
    <div class="feature-card"><h3>Automatic load adjustment</h3><p>Every session, Forma reads your logged reps and times and sets next week's targets accordingly. You never manually update a spreadsheet.</p></div>
  </div>
</section>
<section class="landing-testimonial">${testimonial}</section>
<section class="landing-faq">
  <h2>Common questions</h2>
  <div class="faq-item"><p class="faq-q">Does Forma work for Hyrox beginners?</p><p class="faq-a">Yes. The onboarding assessment sets starting loads and conditioning volume relative to your current level. A beginner's programme looks different from an experienced competitor's.</p></div>
  <div class="faq-item"><p class="faq-q">How does Forma handle combined Hyrox stations?</p><p class="faq-a">Each station is tracked as its own exercise with its own progression metric. You log each station separately; Forma tracks your times and adjusts targets independently.</p></div>
  <div class="faq-item"><p class="faq-q">Can I follow Forma alongside my running plan?</p><p class="faq-a">Yes. During onboarding you set your available training days. Forma builds around your schedule, leaving your running days free.</p></div>
</section>
<div class="landing-cta"><a href="/download" class="cta-btn">Get launch updates</a></div>
${emailCaptureStripHtml()}`;
  sendHtml(res, "Hyrox Training App - Personalised Race Prep", body, {
    description: "AI-powered Hyrox training programs that build your strength base, develop station-specific conditioning, and taper you into race day. Start your free 14-day trial.",
    canonical: "/hyrox",
    extraCss: LANDING_CSS,
    jsonLd,
  });
}

function strengthHandler(_req, res) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Forma",
    operatingSystem: "iOS",
    applicationCategory: "HealthApplication",
    applicationSubCategory: "FitnessApplication",
    description: "Personalised strength and hypertrophy programs that adjust your load and volume automatically based on what you actually lift.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "GBP", description: "Coming soon" },
    url: `${process.env.BASE_URL ?? "https://getforma.fit"}/strength`,
  };
  const testimonial = landingTestimonialHtml(
    /lifter|powerlifter|strength/i,
    "<blockquote>I've tried six different apps. This is the only one where I feel like the program is actually responding to how my training is going, not just incrementing a spreadsheet.</blockquote><div class=\"attribution\">- James T., Powerlifter, 4 years</div>",
  );
  const body = `
<section class="landing-hero">
  <div class="container">
    <h1>A strength program that<br>gets stronger as you do.</h1>
    <p class="subhead">Forma builds personalised strength and hypertrophy programs and adjusts your load and volume automatically - every session, based on what you actually lifted.</p>
    <a href="/download" class="cta-btn">Get launch updates</a>
  </div>
</section>
<section class="landing-why">
  <h2>Why generic programs stop working</h2>
  <p>Linear periodisation works for beginners. After six months, intermediate lifters need a program that reads actual performance and adjusts accordingly: more weight when you are ahead of target, more volume when load progression has stalled, and a deload when fatigue accumulates. Forma does this automatically, every session.</p>
  <div class="landing-icons">
    <div class="landing-icon-item"><div class="icon">01</div><div class="label">Autoregulated load</div><div class="sublabel">Weight moves when you are ready</div></div>
    <div class="landing-icon-item"><div class="icon">02</div><div class="label">PR tracking</div><div class="sublabel">Every new estimated 1RM logged</div></div>
    <div class="landing-icon-item"><div class="icon">03</div><div class="label">Deload weeks</div><div class="sublabel">Scheduled automatically</div></div>
  </div>
</section>
<section class="landing-features">
  <h2>How Forma handles it</h2>
  <div class="feature-grid">
    <div class="feature-card"><h3>Autoregulated loading</h3><p>Forma targets a rep range, not a fixed weight. Hit the top of the range and load goes up. Fall short and volume is adjusted before load is pushed.</p></div>
    <div class="feature-card"><h3>Strength and hypertrophy modes</h3><p>Choose your goal. Strength mode prioritises heavy compound lifts at lower rep ranges. Hypertrophy mode adds volume and emphasises time-under-tension.</p></div>
    <div class="feature-card"><h3>Personal record tracking</h3><p>Every new estimated 1RM is logged. See your strength curve over time on every exercise and get notified the moment you set a PR.</p></div>
    <div class="feature-card"><h3>Automatic deload weeks</h3><p>The engine monitors accumulated load and performance trends. When a deload is due, it is inserted automatically with lighter loads and lower volume.</p></div>
  </div>
</section>
<section class="landing-testimonial">${testimonial}</section>
<section class="landing-faq">
  <h2>Common questions</h2>
  <div class="faq-item"><p class="faq-q">Does Forma support powerlifting - squat, bench, deadlift?</p><p class="faq-a">Yes. Squat, bench press, and deadlift are first-class exercises in the programme engine. Forma tracks your estimated 1RM on each and structures your programme around them.</p></div>
  <div class="faq-item"><p class="faq-q">Can I specify which days I train?</p><p class="faq-a">Yes. During onboarding you set your available training days and session duration. Forma builds around your schedule.</p></div>
  <div class="faq-item"><p class="faq-q">How does Forma handle a deload week?</p><p class="faq-a">Automatically. The engine monitors accumulated load and performance trends. When a deload is due, loads drop, volume reduces, and movement patterns stay the same.</p></div>
</section>
<div class="landing-cta"><a href="/download" class="cta-btn">Get launch updates</a></div>
${emailCaptureStripHtml()}`;
  sendHtml(res, "Strength Training App - Progressive Programs That Adapt", body, {
    description: "Forma writes personalised strength and hypertrophy programs and adjusts your load and volume automatically based on what you actually lift.",
    canonical: "/strength",
    extraCss: LANDING_CSS,
    jsonLd,
  });
}

function pressHandler(_req, res) {
  const pressEmail = escapeHtml(process.env.PRESS_EMAIL || process.env.SUPPORT_EMAIL || "hello@getforma.fit");
  let imagesDir = [];
  try {
    imagesDir = readdirSync(join(__dirname, "../../public/images"));
  } catch {
    imagesDir = [];
  }

  function assetCard(filename, label, previewSrc = `/images/${filename}`) {
    if (!imagesDir.includes(filename)) return "";
    const src = escapeHtml(`/images/${filename}`);
    const ext = escapeHtml(filename.split(".").pop()?.toUpperCase() ?? "");
    return `<div class="asset-card">
  <div class="asset-preview"><img src="${escapeHtml(previewSrc)}" alt="${escapeHtml(label)}"></div>
  <div class="asset-name">${escapeHtml(label)}</div>
  <a href="${src}" download class="asset-download">Download ${ext}</a>
</div>`;
  }

  const mentions = readPressMentions();
  const mentionsHtml = mentions.length
    ? `<div class="press-mentions-grid">${mentions.map((mention) => `<div class="mention-card">
  <div class="mention-pub">${escapeHtml(mention.publication ?? "")}</div>
  <div class="mention-headline"><a href="${escapeHtml(mention.url ?? "#")}" target="_blank" rel="noopener">${escapeHtml(mention.headline ?? "")}</a></div>
  <div class="mention-date">${escapeHtml(mention.date ?? "")}</div>
</div>`).join("")}</div>`
    : `<div class="mention-placeholder">Be the first to cover Forma. <a href="mailto:${pressEmail}" style="color:#22D3EE;">Get in touch -&gt;</a></div>`;

  const body = `<div class="container press-page">
  <div class="press-hero">
    <h1>Press &amp; Media</h1>
    <p>Everything you need to write about Forma. Logos, screenshots, and background in one place.</p>
    <p class="press-contact-line">Press enquiries: <a href="mailto:${pressEmail}">${pressEmail}</a> - we aim to respond within 2 business days.</p>
  </div>

  <div class="press-section press-about-section">
    <h2>About Forma</h2>
    <div class="press-about">
      <p>Forma is an AI-powered strength and Hyrox training app for iOS. It builds personalised training programmes and adapts every session to the athlete's logged performance, so load, volume, and conditioning targets update automatically based on what they actually did.</p>
      <p>Forma is built for Hyrox competitors preparing for races, strength athletes pursuing progressive overload, and anyone who wants a coach-quality programme without hiring a coach. The app combines race-prep conditioning, structured strength work, and practical progression logic in one place.</p>
      <p>The programme engine is rules-based and grounded in periodisation principles, so athletes can see why loads change instead of trusting a black box. Forma is preparing for launch.</p>
    </div>
  </div>

  <div class="press-section">
    <h2>Key facts</h2>
    <ul class="facts-list">
      <li><strong>Platform</strong><span>iOS (App Store)</span></li>
      <li><strong>Free trial</strong><span>14 days, full access, no card required</span></li>
      <li><strong>Target athlete</strong><span>Hyrox competitors and strength athletes</span></li>
      <li><strong>Subscription</strong><span>Monthly and annual plans</span></li>
      <li><strong>Founded</strong><span>2026</span></li>
      <li><strong>HQ</strong><span>United Kingdom</span></li>
    </ul>
  </div>

  <div class="press-section">
    <h2>Downloadable brand assets</h2>
    <div class="asset-grid">
      ${assetCard("formai_icon.svg", "App icon (SVG)")}
      ${assetCard("formai_wordmark_only@2x.png", "Wordmark (PNG)")}
      ${assetCard("formai_hero@2x.png", "Hero image (PNG)")}
    </div>
  </div>

  <div class="press-section">
    <h2>Brand guidelines</h2>
    <table class="brand-table">
      <tr><th>Brand element</th><th>Usage</th></tr>
      <tr><td><span class="colour-chip" style="background:#0F172A;"></span>#0F172A</td><td>Primary background (dark navy)</td></tr>
      <tr><td><span class="colour-chip" style="background:#22D3EE;"></span>#22D3EE</td><td>Primary accent (cyan)</td></tr>
      <tr><td><span class="colour-chip" style="background:#F1F5F9;"></span>#F1F5F9</td><td>Primary text (off-white)</td></tr>
      <tr><td>System sans-serif</td><td>Typeface (iOS San Francisco / system-ui)</td></tr>
    </table>
    <ul class="brand-dos" style="margin-top:20px;">
      <li class="do">Use the wordmark on a dark background</li>
      <li class="do">Use the SVG icon at any size</li>
      <li class="dont">Modify the logo colours</li>
      <li class="dont">Place the wordmark on a light or busy background</li>
      <li class="dont">Use the logo without clear space (minimum 16px padding around the mark)</li>
    </ul>
  </div>

  <div class="press-section">
    <h2>Press mentions</h2>
    ${mentionsHtml}
  </div>
</div>`;

  sendHtml(res, "Press", body, {
    description: "Press resources for Forma - company background, downloadable brand assets, and press contact.",
    canonical: "/press",
    extraCss: PRESS_CSS,
  });
}

function renderDownloadPage(res, { errorMsg = "", notified = false } = {}) {
  const feedback = notified
    ? `<p class="download-success">You're on the list. We'll email you the moment Forma is available.</p>`
    : `${errorMsg ? `<p class="download-error">${escapeHtml(errorMsg)}</p>` : ""}
  <form method="POST" action="/download/notify" class="strip-form">
    <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
    <button type="submit" class="cta-btn">Notify me</button>
  </form>`;
  const body = `<div class="download-page"><img src="/images/forma_icon.png" alt="Forma" class="download-icon"><h1>Forma is coming soon</h1><p class="tagline">The app is not available yet. Join the launch list and we will let you know when it is ready.</p>${feedback}</div>`;
  sendHtml(res, "Download", body, {
    description: "Forma is coming soon. Join the launch list and we will email you when the app is ready.",
    canonical: "/download",
    extraCss: DOWNLOAD_CSS,
    jsonLd: softwareAppSchema,
  });
}

function downloadHandler(req, res) {
  return renderDownloadPage(res, { notified: req.query?.notified === "1" });
}

export function createDownloadNotifyHandler(db = pool) {
  return async function downloadNotifyHandler(req, res) {
    const raw = (req.body?.email ?? "").toString().trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
    if (!valid) {
      res.status(400);
      return renderDownloadPage(res, { errorMsg: "Please enter a valid email address." });
    }

    await insertEmailSignupAndNotify(raw.toLowerCase(), "download_notify_me", db);
    return res.redirect(302, "/download?notified=1");
  };
}

function privacyHandler(_req, res) {
  sendHtml(res, "Privacy Policy", `<div class="container-narrow legal-page">${PRIVACY_HTML}</div>`, {
    description: "Forma Privacy Policy - how we collect, use, and protect your data.",
    canonical: "/privacy",
    extraCss: LEGAL_CSS,
  });
}

function termsHandler(_req, res) {
  sendHtml(res, "Terms of Service", `<div class="container-narrow legal-page">${TERMS_HTML}</div>`, {
    description: "Forma Terms of Service - subscription, billing, referral programme, and governing law.",
    canonical: "/terms",
    extraCss: LEGAL_CSS,
  });
}

function supportHandler(_req, res) {
  const supportEmail = escapeHtml(process.env.SUPPORT_EMAIL ?? "support@getforma.fit");
  const body = `<div class="container-narrow support-page">
  <h1>Support</h1><p class="intro">Get answers to common questions, or contact us directly.</p><h2>Frequently asked questions</h2>
  <div class="faq-item"><p class="faq-q">How do I cancel my subscription?</p><p class="faq-a">Subscriptions will be managed through your device once Forma is available.</p></div>
  <div class="faq-item"><p class="faq-q">Can I use Forma without a subscription?</p><p class="faq-a">Launch access details will be announced before the app is available.</p></div>
  <div class="faq-item"><p class="faq-q">How do I delete my account and data?</p><p class="faq-a">Go to Settings - Account - Delete Account in the app.</p></div>
  <div class="faq-item"><p class="faq-q">The app isn't connecting - what do I do?</p><p class="faq-a">Try closing and reopening the app. If errors continue, contact us at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p></div>
  <div class="faq-item"><p class="faq-q">How do I update my training schedule or equipment?</p><p class="faq-a">Go to Settings - Recalibrate in the app.</p></div>
  <div class="faq-item"><p class="faq-q">What is Hyrox and does Forma support it?</p><p class="faq-a">Hyrox combines running and functional workout stations. Forma has native support for Hyrox conditioning.</p></div>
  <div class="faq-item"><p class="faq-q">How does the programme adapt to my performance?</p><p class="faq-a">After each session, Forma analyses your logged sets, reps, and weights against your target ranges.</p></div>
  <div class="contact-section"><h2>Contact us</h2><p>Can't find what you're looking for? We're happy to help.</p><p>Email: <a href="mailto:${supportEmail}">${supportEmail}</a></p><p>We aim to respond within 2 business days.</p></div>
</div>`;
  sendHtml(res, "Support", body, {
    description: "Forma support and FAQ - get help with your subscription, account, and training programme.",
    canonical: "/support",
    extraCss: SUPPORT_CSS,
  });
}

marketingRouter.get("/", homeHandler);
marketingRouter.get("/download", downloadHandler);
marketingRouter.post("/download/notify", express.urlencoded({ extended: false }), createDownloadNotifyHandler());
marketingRouter.get("/hyrox", gatePage, hyroxHandler);
marketingRouter.get("/strength", gatePage, strengthHandler);
marketingRouter.get("/testimonials", gatePage, testimonialsHandler);
marketingRouter.get("/press", gatePage, pressHandler);
marketingRouter.get("/privacy", privacyHandler);
marketingRouter.get("/terms", termsHandler);
marketingRouter.get("/support", gatePage, supportHandler);
