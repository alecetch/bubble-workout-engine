import { useEffect, useState } from "react";
import { trackEvent } from "../utils/api";
import styles from "./SharePackCard.module.css";

interface SharePackCardProps {
  submissionId: string;
  prefillEmail?: string;
}

interface SharePackResponse {
  downloadUrl: string;
  shareUrl: string;
  caption: string;
  slideCount: number;
  expiresAt?: string;
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export function SharePackCard({ submissionId, prefillEmail = "" }: SharePackCardProps) {
  const [pack, setPack] = useState<SharePackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [email, setEmail] = useState(prefillEmail);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  async function loadPack() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`${BASE_URL}/api/hyrox/share-pack/${encodeURIComponent(submissionId)}`, { method: "POST" });
      if (!res.ok) throw new Error("share_pack_failed");
      const body = await res.json() as SharePackResponse;
      setPack(body);
      trackEvent("instagram_pack_generated", { submissionId });
    } catch {
      setError(true);
      setPack(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  async function copyCaption() {
    if (!pack?.caption) return;
    await navigator.clipboard?.writeText(pack.caption);
    setCopied(true);
    trackEvent("instagram_caption_copied", { submissionId });
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function sendEmail() {
    setEmailStatus("sending");
    try {
      const res = await fetch(`${BASE_URL}/api/hyrox/share-pack/${encodeURIComponent(submissionId)}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("email_failed");
      setEmailStatus("sent");
      trackEvent("instagram_pack_email_sent", { submissionId });
    } catch {
      setEmailStatus("error");
    }
  }

  async function showQrCode() {
    setQrLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/hyrox/share-pack/${encodeURIComponent(submissionId)}/qr`);
      if (!res.ok) throw new Error("qr_failed");
      setQrSvg(await res.text());
      trackEvent("instagram_pack_qr_opened", { submissionId });
    } finally {
      setQrLoading(false);
    }
  }

  return (
    <section className={styles.card} aria-label="Instagram share pack">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Instagram Pack</div>
          <h2 className={styles.title}>Share your HYROX analysis</h2>
          <p className={styles.copy}>Download six numbered carousel slides plus a ready-to-post caption.</p>
        </div>
      </div>

      {loading && <div className={styles.status}>Preparing your Instagram pack...</div>}

      {error && !loading && (
        <div>
          <div className={styles.error}>We couldn't prepare your pack.</div>
          <button className={styles.button} type="button" onClick={() => void loadPack()}>Retry</button>
        </div>
      )}

      {pack && !loading && !error && (
        <>
          <div className={styles.actions}>
            <a
              className={styles.download}
              href={pack.downloadUrl}
              download
              onClick={() => trackEvent("instagram_pack_downloaded", { submissionId })}
            >
              Download Instagram Pack
            </a>
            <button className={styles.button} type="button" onClick={() => void copyCaption()}>
              {copied ? "Copied" : "Copy caption"}
            </button>
            <button className={styles.button} type="button" onClick={() => setSendOpen((value) => !value)}>
              Send to phone
            </button>
          </div>

          {sendOpen && (
            <div className={styles.panel}>
              <div className={styles.emailRow}>
                <input
                  className={styles.input}
                  type="email"
                  value={email}
                  placeholder="you@example.com"
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailStatus("idle");
                  }}
                  aria-label="Email address for Instagram pack"
                />
                <button className={styles.button} type="button" onClick={() => void sendEmail()} disabled={emailStatus === "sending"}>
                  {emailStatus === "sending" ? "Sending..." : "Email me the pack"}
                </button>
              </div>
              {emailStatus === "sent" && <div className={styles.message}>Sent. Check your inbox on your phone.</div>}
              {emailStatus === "error" && <div className={styles.error}>We couldn't send the email. Try again.</div>}
              <button className={styles.button} type="button" onClick={() => void showQrCode()} disabled={qrLoading}>
                {qrLoading ? "Loading QR..." : "Show QR code"}
              </button>
              {qrSvg && (
                <div
                  className={styles.qrBox}
                  aria-label="Share pack QR code"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
