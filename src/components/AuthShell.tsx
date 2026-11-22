import type { ReactNode } from "react";

/** Card of the login pages (login, registration, password links). */
export function AuthShell({ sub, children, foot }: { sub: string; children: ReactNode; foot?: ReactNode }) {
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <div className="brand" style={{ justifyContent: "center", marginBottom: 10 }}>
            <span className="brand-mark">m</span>
            <span>nexusMAUT</span>
          </div>
          <div className="sub">{sub}</div>
        </div>
        {children}
        {foot && <p className="auth-foot">{foot}</p>}
      </div>
    </main>
  );
}
