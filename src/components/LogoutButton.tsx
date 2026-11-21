"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

/** Ends our session, then the single sign-on session at nexusIdentity. */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { url } = await api<{ url: string }>("/api/auth/logout", { method: "POST" });
          window.location.href = url;
        } catch {
          router.push("/login");
        }
      }}
    >
      Abmelden
    </button>
  );
}
