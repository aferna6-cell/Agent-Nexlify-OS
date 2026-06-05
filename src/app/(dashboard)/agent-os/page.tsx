import { OrchestratorChat } from "@/components/chat/orchestrator-chat";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AgentOsPage() {
  const userId = await getCurrentUserId();
  return <OrchestratorChat storageKey={userId ?? "demo"} />;
}
