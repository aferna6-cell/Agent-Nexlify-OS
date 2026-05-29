/**
 * Wishlist capture.
 *
 * When the orchestrator's classifier returns low confidence on all agents, the
 * verbatim request is captured here with the considered-agents list, the owner's
 * vertical, and a frequency count. This doubles as product-research signal:
 * aggregate by vertical + frequency to prioritise new agents from real demand.
 */

export interface WishlistEntry {
  request: string;
  vertical?: string;
  consideredAgents: string[];
  count: number;
  firstSeen: string;
  lastSeen: string;
}

export class Wishlist {
  private readonly entries = new Map<string, WishlistEntry>();

  capture(request: string, consideredAgents: string[], vertical?: string): WishlistEntry {
    const key = request.trim().toLowerCase();
    const now = new Date().toISOString();
    const existing = this.entries.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
      for (const a of consideredAgents) {
        if (!existing.consideredAgents.includes(a)) existing.consideredAgents.push(a);
      }
      return existing;
    }
    const entry: WishlistEntry = {
      request: request.trim(),
      vertical,
      consideredAgents: [...consideredAgents],
      count: 1,
      firstSeen: now,
      lastSeen: now,
    };
    this.entries.set(key, entry);
    return entry;
  }

  all(): WishlistEntry[] {
    return [...this.entries.values()].sort((a, b) => b.count - a.count);
  }

  /** Top requests for a vertical — the internal prioritization signal. */
  topByVertical(vertical: string, limit = 10): WishlistEntry[] {
    return this.all()
      .filter((e) => e.vertical === vertical)
      .slice(0, limit);
  }
}
