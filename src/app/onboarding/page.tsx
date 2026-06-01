import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IndustryPicker } from "@/components/onboarding/industry-picker";

export const dynamic = "force-dynamic";

/**
 * Industry onboarding (v2 Decision 3). Shown so the owner can pick their cluster
 * + specific business type, which loads the vertical pack and tunes agent copy.
 */
export default async function OnboardingPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/");
  const profile = await db.businessProfile.findUnique({ where: { userId } });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Set up Agent OS</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tell us your industry so your AI employees speak your trade.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Your industry</CardTitle>
        </CardHeader>
        <CardContent>
          <IndustryPicker
            initialCluster={profile?.industryCluster ?? undefined}
            initialType={profile?.businessType ?? undefined}
          />
        </CardContent>
      </Card>
    </main>
  );
}
