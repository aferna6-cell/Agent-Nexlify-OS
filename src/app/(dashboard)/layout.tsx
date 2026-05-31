import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { demoBypass, DEMO_OWNER_EMAIL } from "@/lib/demo";
import { SignOutButton } from "@/components/dashboard/sign-out-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const bypass = demoBypass();
  if (!session?.user && !bypass) redirect("/");
  const email = session?.user?.email ?? DEMO_OWNER_EMAIL;

  return (
    <div className="flex h-screen bg-muted">
      {/* App sidebar — Agent OS is the only nav item. */}
      <aside className="flex w-56 flex-col border-r border-border bg-background">
        <div className="px-4 py-4">
          <div className="text-base font-semibold tracking-tight">Agent OS</div>
          <div className="text-xs text-muted-foreground">
            {email}
          </div>
        </div>
        <nav className="flex-1 px-2">
          <div className="rounded-md bg-muted px-3 py-2 text-sm font-medium">Agent OS</div>
        </nav>
        <div className="border-t border-border p-2">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
