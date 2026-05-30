"use client";

import { Button } from "@/components/ui/button";

export interface DraftData {
  id: string;
  title: string;
  body: string;
  channel: string;
  requiresApproval: boolean;
  status?: "pending" | "approved" | "rejected";
}

export function DraftPanel({
  draft,
  onApprove,
  onReject,
  onClose,
}: {
  draft: DraftData | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onClose: () => void;
}) {
  if (!draft) return null;
  const decided = draft.status === "approved" || draft.status === "rejected";

  return (
    <div className="ao-slide-in flex h-full w-96 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Draft review</div>
          <div className="text-xs text-muted-foreground">
            {draft.channel}
            {draft.requiresApproval ? " · requires approval" : ""}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          ✕
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        <div className="mb-2 text-sm font-medium">{draft.title}</div>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground">
          {draft.body}
        </pre>
      </div>

      <div className="border-t border-border p-3">
        {decided ? (
          <div className="text-center text-sm text-muted-foreground">
            {draft.status === "approved" ? "Approved" : "Rejected"}
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="accent" className="flex-1" onClick={() => onApprove(draft.id)}>
              Approve
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => onReject(draft.id)}>
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
