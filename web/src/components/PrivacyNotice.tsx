import styles from "./PrivacyNotice.module.css";

interface PrivacyNoticeProps {
  text?: string;
}

export function PrivacyNotice({ text }: PrivacyNoticeProps) {
  return (
    <div className={styles.notice}>
      <span className={styles.icon}>🔒</span>
      <span>
        {text ??
          "Your data is private and secure. We'll only use it to generate your personalised performance analysis."}
      </span>
    </div>
  );
}
