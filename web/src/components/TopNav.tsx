import { Link } from "react-router-dom";
import { BRAND } from "../config/brand";
import styles from "./TopNav.module.css";

export function TopNav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        <Link to="/hyrox-calculator" className={styles.logo}>
          <img
            className={styles.logoMasthead}
            src={BRAND.lockupSrc}
            alt={BRAND.name}
          />
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
