"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { INDUSTRY_CLUSTERS } from "@/lib/industries";

/**
 * 2-step industry picker (v2 Decision 3): pick a cluster, then a specific type.
 * Saves to the business profile and continues to Agent OS.
 */
export function IndustryPicker({
  initialCluster,
  initialType,
}: {
  initialCluster?: string;
  initialType?: string;
}) {
  const router = useRouter();
  const [cluster, setCluster] = useState<string>(initialCluster ?? "");
  const [type, setType] = useState<string>(initialType ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = INDUSTRY_CLUSTERS.find((c) => c.id === cluster);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/industry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cluster, businessType: type }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/agent-os");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Step 1 — cluster */}
      <div>
        <div className="mb-2 text-sm font-medium">1. What kind of business do you run?</div>
        <div className="grid grid-cols-2 gap-2">
          {INDUSTRY_CLUSTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCluster(c.id);
                setType("");
              }}
              className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                cluster === c.id ? "border-accent bg-accent/10 font-medium" : "border-border hover:bg-muted"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2 — specific type */}
      {selected && (
        <div className="ao-fade-in">
          <div className="mb-2 text-sm font-medium">2. More specifically?</div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Choose your business type…</option>
            {selected.types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}

      <Button variant="accent" className="w-full" disabled={!cluster || !type || saving} onClick={save}>
        {saving ? "Saving…" : "Continue to Agent OS"}
      </Button>
    </div>
  );
}
