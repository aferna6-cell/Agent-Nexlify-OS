import type { StreamedTraceStep } from "@/types/agent";

const ICON: Record<StreamedTraceStep["status"], string> = {
  completed: "✓",
  skipped_no_data: "○",
  fallback: "◐",
  work: "•",
};

const COLOR: Record<StreamedTraceStep["status"], string> = {
  completed: "text-emerald-600",
  skipped_no_data: "text-muted-foreground",
  fallback: "text-amber-600",
  work: "text-accent",
};

/**
 * Honest reasoning trace. A "skipped_no_data" step renders as a hollow marker
 * with the real reason — never a green check over empty data.
 */
export function TraceView({ steps }: { steps: StreamedTraceStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="space-y-1 rounded-md border border-border bg-muted/40 p-3 text-xs">
      {steps.map((s, i) => (
        <li key={i} className="ao-fade-in flex gap-2">
          <span className={COLOR[s.status]}>{ICON[s.status]}</span>
          <span className="text-foreground">{s.description}</span>
        </li>
      ))}
    </ol>
  );
}
