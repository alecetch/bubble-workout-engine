import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./SecondaryButton.module.css";

interface SecondaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  fullWidth?: boolean;
}

export function SecondaryButton({
  children,
  fullWidth,
  className,
  ...rest
}: SecondaryButtonProps) {
  const cls = [
    styles.btn,
    fullWidth ? styles.fullWidth : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button {...rest} className={cls}>
      {children}
    </button>
  );
}
