"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const [email, setEmail] = useState("maya@sunsetauto.com");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await signIn("nodemailer", { email, redirect: false });
    setLoading(false);
    setSent(true);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@business.com"
        className="w-full rounded-md border border-border px-3 py-2 text-sm"
      />
      <Button type="submit" variant="accent" className="w-full" disabled={loading}>
        {loading ? "Sending…" : "Send magic link"}
      </Button>
      {sent && (
        <p className="text-xs text-muted-foreground">
          Magic link sent. In the demo (no SMTP), the link is printed to the{" "}
          <span className="font-medium">server console</span> — open it to sign in.
        </p>
      )}
    </form>
  );
}
