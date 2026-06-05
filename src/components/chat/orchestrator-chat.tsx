"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TraceView } from "@/components/reasoning-trace/trace-view";
import { DraftPanel, type DraftData } from "@/components/draft-panel/draft-panel";
import type { StreamedTraceStep } from "@/types/agent";

interface AgentOption {
  agentId: string;
  displayName: string;
  confidence: number;
}
interface AssistantMessage {
  role: "assistant";
  ask: string;
  status?: string;
  decisionId?: string;
  classifier?: string;
  agentId?: string;
  displayName?: string;
  confidence?: number;
  alternates: AgentOption[];
  clarifyOptions?: AgentOption[];
  steps: StreamedTraceStep[];
  notes: string[];
  draftId?: string;
  noDraftReason?: string;
  answer?: string;
  decided?: boolean;
}
interface OwnerMessage {
  role: "owner";
  text: string;
}
type Message = OwnerMessage | AssistantMessage;

interface Task {
  id: string;
  draftId?: string;
  title: string;
  status: string;
}

function parseSSE(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const events: { event: string; data: string }[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (data) events.push({ event, data });
  }
  return { events, rest };
}

export function OrchestratorChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeDraft, setActiveDraft] = useState<DraftData | null>(null);
  const idxRef = useRef(-1);

  function patch(fn: (m: AssistantMessage) => AssistantMessage) {
    setMessages((prev) => {
      const next = [...prev];
      const i = idxRef.current;
      if (i >= 0 && next[i]?.role === "assistant") next[i] = fn(next[i] as AssistantMessage);
      return next;
    });
  }

  async function runAsk(ask: string, opts?: { forceAgentId?: string; overrodeDecisionId?: string }) {
    setBusy(true);
    setMessages((prev) => {
      const next: Message[] = [...prev, { role: "assistant", ask, steps: [], notes: [], alternates: [] }];
      idxRef.current = next.length - 1;
      return next;
    });
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ask, ...opts }),
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSSE(buffer);
        buffer = rest;
        for (const { event, data } of events) {
          const p = JSON.parse(data);
          if (event === "step") patch((m) => ({ ...m, steps: [...m.steps, p as StreamedTraceStep] }));
          else if (event === "routed")
            patch((m) => ({
              ...m,
              status: p.status,
              decisionId: p.decisionId,
              classifier: p.classifier,
              agentId: p.agentId,
              displayName: p.displayName,
              confidence: p.confidence,
              alternates: p.alternates ?? [],
            }));
          else if (event === "clarify")
            patch((m) => ({ ...m, status: "needs_clarification", decisionId: p.decisionId, clarifyOptions: p.options ?? [] }));
          else if (event === "notes") patch((m) => ({ ...m, notes: p.notes }));
          else if (event === "draft") {
            const d = p as DraftData;
            patch((m) => ({ ...m, draftId: d.id }));
            setActiveDraft({ ...d, status: "pending" });
            setTasks((t) => [{ id: d.id, draftId: d.id, title: d.title, status: "pending" }, ...t]);
          } else if (event === "answer") patch((m) => ({ ...m, answer: p.text }));
          else if (event === "no_draft") patch((m) => ({ ...m, noDraftReason: p.reason }));
          else if (event === "error") patch((m) => ({ ...m, notes: [...m.notes, `Error: ${p.message}`] }));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      patch((m) => ({ ...m, notes: [...m.notes, `Error: ${message}`] }));
    } finally {
      setBusy(false);
    }
  }

  async function send(ask: string) {
    const trimmed = ask.trim();
    if (!trimmed || busy) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "owner", text: trimmed }]);
    await runAsk(trimmed);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await send(input);
  }

  async function pick(msgIndex: number, ask: string, agentId: string, decisionId?: string) {
    setMessages((prev) => {
      const next = [...prev];
      if (next[msgIndex]?.role === "assistant") next[msgIndex] = { ...(next[msgIndex] as AssistantMessage), decided: true };
      return next;
    });
    await runAsk(ask, { forceAgentId: agentId, overrodeDecisionId: decisionId });
  }

  async function decide(id: string, action: "approve" | "reject") {
    const res = await fetch(`/api/drafts/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) return;
    const status = action === "approve" ? "approved" : "rejected";
    setActiveDraft((d) => (d && d.id === id ? { ...d, status } : d));
    setTasks((t) => t.map((task) => (task.draftId === id ? { ...task, status } : task)));
  }

  function openDraft(draftId: string) {
    void fetch(`/api/drafts/${draftId}`).then((r) => r.json()).then((d) => setActiveDraft(d));
  }

  return (
    <div className="flex h-full">
      {/* Left rail — task list */}
      <div className="flex w-64 flex-col border-r border-border bg-background">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Tasks</div>
        <div className="flex-1 overflow-auto p-2">
          {tasks.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground">No tasks yet.</div>
          ) : (
            <ul className="space-y-1">
              {tasks.map((task) => (
                <li key={task.id}>
                  <button
                    className="w-full rounded-md px-2 py-2 text-left text-xs hover:bg-muted"
                    onClick={() => task.draftId && openDraft(task.draftId)}
                  >
                    <div className="truncate font-medium">{task.title}</div>
                    <div className="text-muted-foreground">{task.status}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Middle — orchestrator chat */}
      <div className="flex flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="mx-auto max-w-lg pt-12 text-center">
              <div className="text-base font-semibold">Run your shop by talking to your AI</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Describe what you need in plain English — the orchestrator picks the right agent, shows
                its work, and drafts it for your approval.
              </p>
              <div className="mt-4 flex flex-col items-stretch gap-2 text-left">
                {[
                  "Mike Johnson called wanting a tire rotation Thursday at 10:30.",
                  "What came in through the widget yesterday?",
                  "Follow up with Sarah Chen on her brake quote.",
                  "Show me my weekly briefing.",
                ].map((s) => (
                  <button
                    key={s}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => void send(s)}
                    disabled={busy}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "owner" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-lg rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="max-w-xl space-y-2">
                {/* Routing decision. V-04: label the routing method clearly —
                    "haiku" = AI routing; "heuristic" = offline/fallback routing. */}
                {m.displayName && (
                  <div className="text-xs text-muted-foreground">
                    I&rsquo;m picking the <span className="font-medium text-foreground">{m.displayName}</span> agent
                    {typeof m.confidence === "number" ? ` (${Math.round(m.confidence * 100)}%` : ""}
                    {m.classifier ? `, ${m.classifier === "haiku" ? "AI routing" : "fallback routing"}` : ""}
                    {typeof m.confidence === "number" ? ")" : ""} — sound right?
                  </div>
                )}
                {/* Pick-another for routed messages */}
                {!m.decided && m.status !== "needs_clarification" && m.alternates.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs text-muted-foreground">pick another:</span>
                    {m.alternates.map((alt) => (
                      <button
                        key={alt.agentId}
                        className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
                        onClick={() => pick(i, m.ask, alt.agentId, m.decisionId)}
                      >
                        {alt.displayName}
                      </button>
                    ))}
                  </div>
                )}
                {/* Clarification: two near-tied options */}
                {!m.decided && m.status === "needs_clarification" && m.clarifyOptions && (
                  <div className="flex flex-wrap gap-2">
                    {m.clarifyOptions.map((opt) => (
                      <Button key={opt.agentId} variant="outline" size="sm" onClick={() => pick(i, m.ask, opt.agentId, m.decisionId)}>
                        {opt.displayName}
                      </Button>
                    ))}
                  </div>
                )}
                <TraceView steps={m.steps} />
                {m.answer && (
                  <div className="ao-fade-in whitespace-pre-wrap rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    {m.answer}
                  </div>
                )}
                {m.notes.map((n, j) => (
                  <div key={j} className="ao-fade-in rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {n}
                  </div>
                ))}
                {m.noDraftReason && (
                  <div className="rounded-md bg-muted px-3 py-2 text-xs">No draft — {m.noDraftReason}</div>
                )}
                {m.draftId && (
                  <button className="text-xs text-accent underline" onClick={() => openDraft(m.draftId!)}>
                    View draft →
                  </button>
                )}
              </div>
            ),
          )}
        </div>

        <form onSubmit={submit} className="border-t border-border p-4">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your AI…"
              className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
              disabled={busy}
            />
            <Button type="submit" variant="accent" disabled={busy}>
              {busy ? "Working…" : "Send"}
            </Button>
          </div>
        </form>
      </div>

      <DraftPanel
        draft={activeDraft}
        onApprove={(id) => decide(id, "approve")}
        onReject={(id) => decide(id, "reject")}
        onClose={() => setActiveDraft(null)}
      />
    </div>
  );
}
