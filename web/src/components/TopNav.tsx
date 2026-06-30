import { Link } from "react-router-dom";
import formaLogoUrl from "../assets/forma-logo.png";
import styles from "./TopNav.module.css";

export function TopNav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        <Link to="/hyrox-calculator" className={styles.logo}>
          <img className={styles.logoMark} src={formaLogoUrl} alt="Forma" />
          <div>
            <div className={styles.logoText}>Forma</div>
            <div className={styles.logoSub}>Performance Engineer</div>
          </div>
        </Link>
        <div className={styles.links}>
          <Link to="/hyrox-calculator/sample-report" className={styles.link}>
            Sample Report
          </Link>
        </div>
      </div>
    </nav>
  );
}
