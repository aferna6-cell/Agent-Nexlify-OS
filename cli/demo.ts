#!/usr/bin/env tsx
/**
 * Agent OS demo CLI.
 *
 * Usage:
 *   npm run demo                 # run the scripted showcase
 *   npm run demo -- "your ask"   # route a single ask against the sample business
 *
 * The demo uses Sunset Mobile Detailing as the business and a populated shared
 * context, so drafts contain real profile data, traces reflect what actually
 * loaded, and SMS drafts are plain text.
 */

import { createAgentOS } from "../src/index.js";
import { sampleContext } from "../src/context/sampleData.js";
import { renderTrace } from "../src/trace/trace.js";
import type { OrchestrationResult } from "../src/orchestrator/orchestrator.js";

const DIVIDER = "─".repeat(72);

function show(ask: string, res: OrchestrationResult): void {
  console.log(`\n${DIVIDER}`);
  console.log(`OWNER: ${ask}`);
  console.log(`${DIVIDER}`);
  console.log(`status: ${res.status}${res.chosen ? `  →  ${res.chosen}` : ""}`);

  console.log("\norchestrator chat:");
  for (const m of res.messages) console.log(`  ${m}`);

  if (res.result?.trace?.length) {
    console.log("\nreasoning trace:");
    console.log(renderTrace(res.result.trace));
  }

  const draft = res.result?.draft;
  if (draft) {
    console.log(`\ndraft  [channel: ${draft.channel}${draft.requiresApproval ? " · requires approval" : ""}]`);
    console.log(`  title: ${draft.title}`);
    console.log("  body:");
    for (const line of draft.body.split("\n")) console.log(`    ${line}`);
  } else {
    console.log("\n(no draft)");
  }
}

const SHOWCASE: string[] = [
  "A new lead asked through the widget: 'Do you guys handle hybrids? I have a 2018 Prius and the battery feels weak.' Draft a response.",
  "Text Maria to offer her Thursday at 2pm for a consultation.",
  "Draft a quote for Mike Johnson — full brake job, parts $620, labor $480, terms net 15.",
  "Follow up with Dana on the $2,400 full repaint quote — she hasn't booked.",
  "Email blast for $59 spring detail special, ends May 31. Keep it short.",
  "Ask Maria for a Google review after her interior detail.",
  "A customer wrote: 'I'm furious — my car came back with a scratch on the door.' Help me respond.",
  "Run my weekly briefing.",
  "What marketing agents do you have?",
  "Write me a list of ideas to get more weekend bookings.",
];

function main(): void {
  const { orchestrator } = createAgentOS();
  const arg = process.argv.slice(2).join(" ").trim();

  if (arg) {
    const ctx = sampleContext();
    show(arg, orchestrator.handle(arg, ctx));
    return;
  }

  console.log("Agent OS — scripted showcase (business: Sunset Mobile Detailing)\n");
  for (const ask of SHOWCASE) {
    // Fresh context per ask keeps the demo deterministic.
    show(ask, orchestrator.handle(ask, sampleContext()));
  }
  console.log(`\n${DIVIDER}`);
  console.log("Wishlist captured during this session:");
  for (const w of orchestrator.wishlist.all()) {
    console.log(`  • "${w.request}" (×${w.count}, considered: ${w.consideredAgents.join(", ") || "none"})`);
  }
}

main();
