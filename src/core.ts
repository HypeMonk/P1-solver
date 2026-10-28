import Decimal from 'decimal.js';
import { parse as parseLossless } from 'lossless-json';
import { z } from 'zod';

const Money = Decimal.clone({ precision: 120 });

export const MARKET_ID = 'aipipe-weekly-cost-2026-11-02-v2';
export const FEED_URL = 'https://stats.aipipe.org/usage.json';
export const MARKET_API = 'https://tds-network-games.sanand.workers.dev/prediction-market/api';
export const ASSIGNMENT_URL = 'https://exam.sanand.workers.dev/tds-2026-09-p1';
export const DAY = 86_400_000;
export const dateKey = (time: number) => new Date(time).toISOString().slice(0, 10);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => Number.isFinite(Date.parse(s)) && dateKey(Date.parse(s)) === s);
const timestamp = z.string().refine(s => /(?:Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s)), 'A timezone-qualified timestamp is required');
const money = z.string().max(80).refine(s => /^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(s) && new Money(s).isFinite() && new Money(s).gte(0) && new Money(s).lte(1e12) && new Money(s).decimalPlaces() <= 80, 'Invalid spending value');
export const DaySchema = z.object({ date: isoDate, spend: money.nullable(), complete: z.boolean(), available: z.boolean(), publishedAt: timestamp, availableAt: timestamp.optional(), source: z.string().max(500).url().refine(s => s.startsWith('https://')) });
export type SpendDay = z.infer<typeof DaySchema>;
export const ArchiveSchema = z.object({
  version: z.literal(1), publishedAt: timestamp, collectedAt: timestamp,
  days: z.array(DaySchema).max(5000),
  revisions: z.array(z.object({ date: isoDate, before: money.nullable(), after: money.nullable(), publishedAt: timestamp })).max(1000),
  sources: z.array(z.string().max(500).url().refine(s => s.startsWith('https://'))).max(100),
});
export type Archive = z.infer<typeof ArchiveSchema>;
export const MarketSchema = z.object({
  id: z.string(), title: z.string(),
  outcomes: z.array(z.object({ id: z.string(), label: z.string() })).min(2).max(100),
  trading: z.object({ opensAt: timestamp, closesAt: timestamp }),
  observation: z.object({ window: z.object({ startDate: isoDate, endDate: isoDate }) }),
  settlement: z.object({ numericRanges: z.array(z.object({ outcomeId: z.string(), min: z.number().nonnegative(), max: z.number().positive().optional() })) }),
});
export type Market = z.infer<typeof MarketSchema>;

export function validateMarket(input: unknown): Market {
  const market = MarketSchema.parse(input);
  if (market.id !== MARKET_ID) throw new Error('This is a different market. Do not submit this Q1 forecast to it.');
  const { startDate, endDate } = market.observation.window;
  if (startDate !== '2026-11-02' || endDate !== '2026-11-09') throw new Error('The target dates changed. The solver needs a rules review.');
  if (Date.parse(market.trading.opensAt) >= Date.parse(market.trading.closesAt)) throw new Error('Invalid market window');
  const ranges = market.settlement.numericRanges;
  const ids = market.outcomes.map(o => o.id);
  if (new Set(ids).size !== ids.length || ranges.length !== ids.length || new Set(ranges.map(r => r.outcomeId)).size !== ids.length) throw new Error('Duplicate or missing market outcomes');
  ranges.forEach((range, i) => {
    if (!ids.includes(range.outcomeId) || range.min !== (i ? ranges[i - 1].max : 0) || (range.max !== undefined && range.max <= range.min) || (i < ranges.length - 1 && range.max === undefined)) throw new Error('Market ranges must be ordered and contiguous');
  });
  if (ranges.at(-1)?.max !== undefined) throw new Error('The highest range must be open-ended');
  return market;
}

export function parseFeed(text: string, now = Date.now(), source = FEED_URL): Archive {
  if (text.length > 2_000_000) throw new Error('Feed is too large');
  const data = parseLossless(text) as Record<string, unknown>;
  if (data?.timezone !== 'UTC' || String(data.schema_version) !== '1') throw new Error('Unsupported feed schema or timezone. Rules need review.');
  const publishedAt = timestamp.parse(data?.published_at);
  if (Date.parse(publishedAt) > now + 300_000) throw new Error('Report timestamp is in the future');
  if (!Array.isArray(data.days) || !data.days.length || data.days.length > 400) throw new Error('The report has no valid daily rows');
  const seen = new Set<string>();
  const days: SpendDay[] = data.days.map((raw: Record<string, any>) => {
    const date = isoDate.parse(raw.date);
    if (seen.has(date)) throw new Error(`Duplicate date: ${date}`);
    seen.add(date);
    const complete = z.boolean().parse(raw.complete);
    const available = z.boolean().parse(raw.available);
    if (complete && date >= dateKey(Date.parse(publishedAt))) throw new Error(`A completed UTC day cannot be today or in the future: ${date}`);
    const spend = raw.total?.spend_usd == null ? null : money.parse(String(raw.total.spend_usd));
    if (complete && available && spend === null) throw new Error(`Completed day ${date} has no spending total`);
    return { date, complete, available, spend, publishedAt, availableAt: publishedAt, source };
  });
  return { version: 1, publishedAt, collectedAt: new Date(now).toISOString(), days, revisions: [], sources: [source] };
}

export function validateArchive(value: unknown, now = Date.now()): Archive {
  const a = ArchiveSchema.parse(value);
  const times = [a.publishedAt, ...a.days.flatMap(d => [d.publishedAt, d.availableAt ?? d.publishedAt])];
  if (times.some(t => Date.parse(t) > now + 300_000)) throw new Error('Archive contains future reports');
  if (new Set(a.days.map(d => d.date)).size !== a.days.length) throw new Error('Archive contains duplicate days');
  if (a.days.some(d => Date.parse(d.availableAt ?? d.publishedAt) > Date.parse(d.publishedAt) || Date.parse(d.publishedAt) > Date.parse(a.publishedAt) || (d.complete && d.date >= dateKey(Date.parse(d.publishedAt))) || (d.complete && d.available && d.spend === null))) throw new Error('Archive day conflicts with its report timestamp or total');
  return a;
}

export function mergeArchives(previous: Archive | null, incoming: Archive): Archive {
  if (!previous) return incoming;
  const days = new Map(previous.days.map(d => [d.date, d]));
  const revisions = [...previous.revisions];
  for (const next of incoming.days) {
    const old = days.get(next.date);
    if (old && Date.parse(old.publishedAt) > Date.parse(next.publishedAt)) continue;
    if (old && old.publishedAt === next.publishedAt) {
      if (old.spend !== next.spend || old.complete !== next.complete || old.available !== next.available) throw new Error(`Conflicting data for ${next.date} at the same report timestamp`);
      continue;
    }
    if (old?.complete && old.available && (old.spend !== next.spend || !next.available || !next.complete)) revisions.push({ date: next.date, before: old.spend, after: next.available && next.complete ? next.spend : null, publishedAt: next.publishedAt });
    const unchanged = old && old.spend === next.spend && old.complete === next.complete && old.available === next.available;
    days.set(next.date, { ...next, availableAt: unchanged ? (old.availableAt ?? old.publishedAt) : (next.availableAt ?? next.publishedAt) });
  }
  return { version: 1, publishedAt: Date.parse(incoming.publishedAt) > Date.parse(previous.publishedAt) ? incoming.publishedAt : previous.publishedAt,
    collectedAt: incoming.collectedAt, days: [...days.values()].sort((a,b) => a.date.localeCompare(b.date)),
    revisions: revisions.slice(-1000), sources: [...new Set([...previous.sources, ...incoming.sources])].slice(-100) };
}

export function targetDates(market: Market): string[] {
  const dates = [];
  for (let t = Date.parse(market.observation.window.startDate); t < Date.parse(market.observation.window.endDate); t += DAY) dates.push(dateKey(t));
  return dates;
}
export const usable = (d: SpendDay) => d.complete && d.available && d.spend !== null;
export const sumMoney = (values: string[]) => values.reduce((sum, v) => sum.plus(v), new Money(0)).toString();
export function bucketFor(value: string | number, market: Market): string {
  const n = new Money(value);
  const range = market.settlement.numericRanges.find(r => n.gte(r.min) && (r.max === undefined || n.lt(r.max)));
  if (!range) throw new Error('The forecast is outside the market ranges');
  return range.outcomeId;
}
export const outcomeLabel = (id: string, market: Market) => market.outcomes.find(o => o.id === id)?.label ?? id;
export const formatMoney = (value: string | number, digits = 2) => `$${new Money(value).toFixed(digits)}`;
export function validateReason(reason: string) {
  const s = reason.trim();
  if (s.length < 15 || s.length > 1000 || s.split(/\s+/).length < 3) throw new Error('Use 15–1,000 characters and at least three words for your explanation.');
  return s;
}
export function fingerprint(a: Archive): string {
  const text = a.days.filter(usable).map(d => `${d.date}:${d.spend}`).sort().join('|');
  let hash = 2166136261;
  for (const c of text) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
