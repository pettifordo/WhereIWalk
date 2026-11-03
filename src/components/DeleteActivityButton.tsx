"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteActivityButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="danger"
      disabled={busy}
      onClick={async () => {
        if (!confirm(`Delete "${name}"? Its trail progress will be removed too.`)) return;
        setBusy(true);
        const res = await fetch(`/api/activities/${id}`, { method: "DELETE" });
        setBusy(false);
        if (res.ok) router.refresh();
        else alert("Couldn't delete that activity.");
      }}
    >
      Delete
    </button>
  );
}
