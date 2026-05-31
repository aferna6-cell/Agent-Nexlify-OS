/**
 * Channel formatting helpers (rule 3).
 *
 * Plain-text channels (sms/post/widget_reply) must contain no markdown. Agents
 * compose plain text directly; `finishBody` is a belt-and-braces strip before a
 * draft on a plain-text channel is returned, and `findMarkdown` is used by tests
 * to assert the rule holds.
 */

import { PLAIN_TEXT_CHANNELS, type AgentChannel } from "./_schema.js";

export function isPlainTextChannel(channel: AgentChannel): boolean {
  return PLAIN_TEXT_CHANNELS.has(channel);
}

const MARKDOWN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /(^|\s)#{1,6}\s/m, reason: "markdown heading (#)" },
  { pattern: /\*\*[^*]+\*\*/, reason: "bold (**)" },
  { pattern: /\*[^*\n]+\*/, reason: "emphasis / bullet asterisk (*)" },
  { pattern: /(^|\n)\s*[-*+]\s+\S/, reason: "markdown bullet list" },
  { pattern: /\[[^\]]+\]\([^)]+\)/, reason: "markdown link [text](url)" },
  { pattern: /`[^`]+`/, reason: "inline code (`)" },
];

export function findMarkdown(body: string): string[] {
  const out: string[] = [];
  for (const { pattern, reason } of MARKDOWN_PATTERNS) {
    if (pattern.test(body)) out.push(reason);
  }
  return out;
}

export function stripMarkdown(body: string): string {
  return body
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/(^|\n)#{1,6}\s+/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(^|\n)\s*>\s+/g, "$1")
    .replace(/(^|\n)\s*[-*+]\s+/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

/** Finalises a body for its channel: strips markdown on plain-text channels. */
export function finishBody(channel: AgentChannel, body: string): string {
  const trimmed = body.trim();
  return isPlainTextChannel(channel) ? stripMarkdown(trimmed) : trimmed;
}

export function money(amount: number): string {
  const whole = Math.round(amount * 100) / 100;
  const hasCents = whole % 1 !== 0;
  return `$${whole.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
