"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TraceView } from "@/components/reasoning-trace/trace-view";
import { DraftPanel, type DraftData } from "@/components/draft-panel/draft-panel";
import type { StreamedTraceStep } from "@/types/agent";

interface AssistantMessage {
  role: "assistant";
  agentId?: string;
  confidence?: number;
  steps: StreamedTraceStep[];
  notes: string[];
  draftId?: string;
  noDraftReason?: string;
}
interface OwnerMessage {
  role: "owner";
  text: string;
}
type Message = OwnerMessage | AssistantMessage;

interface Task {
  runId: string;
  draftId?: string;
  title: string;
  status: "pending" | "approved" | "rejected" | "no_draft";
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
  const assistantIdx = useRef(-1);

  function updateAssistant(fn: (m: AssistantMessage) => AssistantMessage) {
    setMessages((prev) => {
      const next = [...prev];
      const i = assistantIdx.current;
      if (i >= 0 && next[i]?.role === "assistant") next[i] = fn(next[i] as AssistantMessage);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ask = input.trim();
    if (!ask || busy) return;
    setInput("");
    setBusy(true);

    setMessages((prev) => {
      const next: Message[] = [
        ...prev,
        { role: "owner", text: ask },
        { role: "assistant", steps: [], notes: [] },
      ];
      assistantIdx.current = next.length - 1;
      return next;
    });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ask }),
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
          const payload = JSON.parse(data);
          if (event === "step") {
            updateAssistant((m) => ({ ...m, steps: [...m.steps, payload as StreamedTraceStep] }));
          } else if (event === "routed") {
            updateAssistant((m) => ({ ...m, agentId: payload.agentId, confidence: payload.confidence }));
          } else if (event === "notes") {
            updateAssistant((m) => ({ ...m, notes: payload.notes }));
          } else if (event === "draft") {
            const draft = payload as DraftData;
            updateAssistant((m) => ({ ...m, draftId: draft.id }));
            setActiveDraft({ ...draft, status: "pending" });
            setTasks((t) => [{ runId: draft.id, draftId: draft.id, title: draft.title, status: "pending" }, ...t]);
          } else if (event === "no_draft") {
            updateAssistant((m) => ({ ...m, noDraftReason: payload.reason }));
          } else if (event === "error") {
            updateAssistant((m) => ({ ...m, notes: [...m.notes, `Error: ${payload.message}`] }));
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      updateAssistant((m) => ({ ...m, notes: [...m.notes, `Error: ${message}`] }));
    } finally {
      setBusy(false);
    }
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

  return (
    <div className="flex h-full">
      {/* Left rail — task list */}
      <div className="flex w-64 flex-col border-r border-border bg-background">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Tasks</div>
        <div className="flex-1 overflow-auto p-2">
          {tasks.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground">
              No tasks yet. Ask the orchestrator something below.
            </div>
          ) : (
            <ul className="space-y-1">
              {tasks.map((task) => (
                <li key={task.runId}>
                  <button
                    className="w-full rounded-md px-2 py-2 text-left text-xs hover:bg-muted"
                    onClick={() => {
                      if (task.draftId) {
                        void fetch(`/api/drafts/${task.draftId}`)
                          .then((r) => r.json())
                          .then((d) => setActiveDraft(d));
                      }
                    }}
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
            <div className="mx-auto max-w-lg pt-10 text-center text-sm text-muted-foreground">
              Talk to your AI. Try <span className="font-medium">&ldquo;hello&rdquo;</span> to see the
              loop: route → run → reasoning trace → draft.
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "owner" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-lg rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} className="max-w-lg space-y-2">
                {m.agentId && (
                  <div className="text-xs text-muted-foreground">
                    Routed to <span className="font-medium">{m.agentId}</span>
                    {typeof m.confidence === "number" ? ` · ${Math.round(m.confidence * 100)}%` : ""}
                  </div>
                )}
                <TraceView steps={m.steps} />
                {m.notes.map((n, j) => (
                  <div key={j} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {n}
                  </div>
                ))}
                {m.noDraftReason && (
                  <div className="rounded-md bg-muted px-3 py-2 text-xs">No draft — {m.noDraftReason}</div>
                )}
                {m.draftId && (
                  <button
                    className="text-xs text-accent underline"
                    onClick={() => {
                      void fetch(`/api/drafts/${m.draftId}`)
                        .then((r) => r.json())
                        .then((d) => setActiveDraft(d));
                    }}
                  >
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

      {/* Right — draft slide-out */}
      <DraftPanel
        draft={activeDraft}
        onApprove={(id) => decide(id, "approve")}
        onReject={(id) => decide(id, "reject")}
        onClose={() => setActiveDraft(null)}
      />
    </div>
  );
}
