/**
 * Feature-flag seam.
 *
 * Agent OS ships behind a single production flag, `feature_agent_os`. The
 * standalone build resolves flags from env (so the demo is always on); the
 * production merge calls `setFeatureFlagProvider()` once with an implementation
 * backed by the real flag service (LaunchDarkly / Statsig / DB cohort table),
 * letting the rollout expand the cohort gradually without code changes.
 *
 * Rollout plan (see docs/INTEGRATION.md §Feature flags):
 *   1. `feature_agent_os` OFF for everyone; internal staff allow-list only.
 *   2. 1% cohort, then 5% / 25% / 50% as routing accuracy and cost hold.
 *   3. 100%, then the flag is retired and Agent OS becomes the default surface.
 *
 * Sub-flags let pieces roll out independently of the umbrella flag:
 *   - `feature_agent_os_autosend`     — allow agents to send without approval.
 *   - `feature_agent_os_lead_triage`  — event-triggered Lead Triage.
 *   - `feature_agent_os_appt_reminder`— scheduled Appointment Reminder.
 */

export type FeatureFlag =
  | "feature_agent_os"
  | "feature_agent_os_autosend"
  | "feature_agent_os_lead_triage"
  | "feature_agent_os_appt_reminder";

export interface FlagContext {
  /** The owner/user the flag is evaluated for (cohort bucketing key). */
  userId?: string;
  businessProfileId?: string;
}

export interface FeatureFlagProvider {
  isEnabled(flag: FeatureFlag, ctx?: FlagContext): Promise<boolean>;
}

/**
 * Standalone provider: flags come from env. `feature_agent_os` defaults ON so
 * the standalone app and demo work out of the box; the rest default OFF (the
 * standalone build has no real send / no event triggers). Set
 * `FLAG_<UPPER_SNAKE>=true|false` to override, e.g. FLAG_FEATURE_AGENT_OS=false.
 */
export class EnvFeatureFlagProvider implements FeatureFlagProvider {
  private readonly defaults: Record<FeatureFlag, boolean> = {
    feature_agent_os: true,
    feature_agent_os_autosend: false,
    feature_agent_os_lead_triage: false,
    feature_agent_os_appt_reminder: false,
  };

  async isEnabled(flag: FeatureFlag): Promise<boolean> {
    const env = process.env[`FLAG_${flag.toUpperCase()}`];
    if (env === "true") return true;
    if (env === "false") return false;
    return this.defaults[flag];
  }
}

let provider: FeatureFlagProvider = new EnvFeatureFlagProvider();

/** Production merge calls this once at startup to back flags with its service. */
export function setFeatureFlagProvider(p: FeatureFlagProvider): void {
  provider = p;
}

export function isFeatureEnabled(flag: FeatureFlag, ctx?: FlagContext): Promise<boolean> {
  return provider.isEnabled(flag, ctx);
}
