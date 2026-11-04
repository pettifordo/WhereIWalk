"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteRouteButton({ id, name, redirectTo }: { id: number; name: string; redirectTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="danger"
      disabled={busy}
      onClick={async () => {
        if (!confirm(`Delete the route "${name}"? Your walks are kept; only the route goes.`)) return;
        setBusy(true);
        const res = await fetch(`/api/routes/${id}`, { method: "DELETE" });
        setBusy(false);
        if (!res.ok) return alert("Couldn't delete that route.");
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      }}
    >
      Delete
    </button>
  );
}
