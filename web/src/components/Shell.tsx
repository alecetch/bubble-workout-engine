import type { ReactNode } from "react";
import { TopNav } from "./TopNav";
import styles from "./Shell.module.css";

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  return (
    <div className={styles.shell}>
      <TopNav />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
