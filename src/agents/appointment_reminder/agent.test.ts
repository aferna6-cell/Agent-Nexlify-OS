import { describe, expect, it } from "vitest";
import { appointmentReminder } from "./agent.js";
import { examples } from "./examples.js";
import { fullContext, runFromAsk } from "../_testkit.js";
import { findMarkdown } from "../_format.js";
import type { AppointmentData } from "../../types/agent.js";

function tomorrowAppointment(): AppointmentData {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  t.setHours(10, 30, 0, 0);
  return { id: "a1", customerName: "Mike Johnson", service: "tire rotation", scheduledFor: t.toISOString(), status: "scheduled", reviewRequested: false };
}

function nextWeekAppointment(): AppointmentData {
  const t = new Date();
  t.setDate(t.getDate() + 7);
  t.setHours(10, 30, 0, 0);
  return { id: "a2", customerName: "Sara Lee", service: "oil change", scheduledFor: t.toISOString(), status: "scheduled", reviewRequested: false };
}

describe("appointment_reminder", () => {
  it("drafts a plain-text SMS reminder for an appointment scheduled tomorrow", async () => {
    const { output } = await runFromAsk(appointmentReminder, "Send reminders for tomorrow's appointments.", fullContext({ appointments: [tomorrowAppointment()] }));
    expect(output.draft).toBeDefined();
    expect(output.draft!.channel).toBe("sms");
    expect(findMarkdown(output.draft!.body)).toEqual([]);
    expect(output.draft!.body).toContain("Mike Johnson");
    expect(output.draft!.body).toContain("reminder");
    expect(output.draft!.body).toContain("tomorrow");
    expect(output.draft!.body).toContain("appointment");
  });

  it("produces no draft when there are no appointments tomorrow", async () => {
    const { output } = await runFromAsk(appointmentReminder, "Send reminders for tomorrow's appointments.", fullContext());
    expect(output.draft).toBeUndefined();
    expect(output.noDraftReason).toBe("no appointments tomorrow");
    expect(output.orchestratorNotes.some((n) => /no appointments.*tomorrow/i.test(n))).toBe(true);
  });

  it("ignores appointments not scheduled for tomorrow (date filter works)", async () => {
    const { output } = await runFromAsk(appointmentReminder, "Send reminders for tomorrow's appointments.", fullContext({ appointments: [nextWeekAppointment()] }));
    expect(output.draft).toBeUndefined();
    expect(output.noDraftReason).toBe("no appointments tomorrow");
  });

  it("each example produces a draft containing its expected excerpt", async () => {
    for (const ex of examples) {
      const { output } = await runFromAsk(appointmentReminder, ex.owner_ask, fullContext({ appointments: [tomorrowAppointment()] }));
      expect(output.draft, ex.owner_ask).toBeDefined();
      expect(output.draft!.body).toContain(ex.expected_output_excerpt);
    }
  });
});
