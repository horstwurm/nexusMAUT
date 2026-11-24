import Link from "next/link";

// Bottom bar on every page: © and the links to the Impressum and the privacy policy.
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} nexusMAUT · Marketing Automation der nexus-Apps</span>
      <nav aria-label="Rechtliches">
        <Link href="/impressum">Impressum</Link>
        <Link href="/impressum#datenschutz">Datenschutz</Link>
      </nav>
    </footer>
  );
}
