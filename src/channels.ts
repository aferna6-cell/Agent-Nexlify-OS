/**
 * Channel formatting rules (rule 3).
 *
 * Every agent declares its channel. SMS-channel agents must produce plain text —
 * no markdown, no asterisks, no headers. Email/sequence agents may use markdown
 * that converts at send time. Owner-only reports may use full markdown.
 */

import type { Channel } from "./types.js";

/** Channels that must be plain text — no markdown allowed. */
export const PLAIN_TEXT_CHANNELS: ReadonlySet<Channel> = new Set<Channel>([
  "sms",
  "post",
  "widget_reply",
]);

/** Channels that may contain markdown. */
export const MARKDOWN_CHANNELS: ReadonlySet<Channel> = new Set<Channel>([
  "email",
  "sequence",
  "report",
]);

export interface ChannelViolation {
  token: string;
  reason: string;
}

const MARKDOWN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /(^|\s)#{1,6}\s/m, reason: "markdown heading (#)" },
  { pattern: /\*\*[^*]+\*\*/, reason: "bold (**)" },
  { pattern: /\*[^*\n]+\*/, reason: "emphasis / bullet asterisk (*)" },
  { pattern: /(^|\n)\s*[-*+]\s+\S/, reason: "markdown bullet list" },
  { pattern: /\[[^\]]+\]\([^)]+\)/, reason: "markdown link [text](url)" },
  { pattern: /`[^`]+`/, reason: "inline code (`)" },
  { pattern: /(^|\n)\s*>\s+\S/, reason: "blockquote (>)" },
];

/**
 * Returns markdown violations for a body destined for a plain-text channel.
 * Returns an empty array for channels that permit markdown.
 */
export function findChannelViolations(channel: Channel, body: string): ChannelViolation[] {
  if (!PLAIN_TEXT_CHANNELS.has(channel)) return [];
  const violations: ChannelViolation[] = [];
  for (const { pattern, reason } of MARKDOWN_PATTERNS) {
    const m = body.match(pattern);
    if (m) violations.push({ token: m[0].trim(), reason });
  }
  return violations;
}

export function isPlainTextChannel(channel: Channel): boolean {
  return PLAIN_TEXT_CHANNELS.has(channel);
}

/**
 * Defensive normalizer: strips common markdown so a plain-text channel body is
 * clean even if upstream copy slipped a token in. Agents build plain text
 * directly; this is a belt-and-suspenders pass used before returning SMS bodies.
 */
export function stripMarkdown(body: string): string {
  return body
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/(^|\n)#{1,6}\s+/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(^|\n)\s*>\s+/g, "$1")
    .replace(/(^|\n)\s*[-*+]\s+/g, "$1")
    .trimEnd();
}
