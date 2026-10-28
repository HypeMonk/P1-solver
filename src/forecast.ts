import { type Archive, type Market, type SpendDay, DAY, dateKey, usable, sumMoney, bucketFor, outcomeLabel, formatMoney, targetDates, fingerprint } from './core';

const mean = (xs: number[]) => xs.reduce((a,b) => a+b, 0) / xs.length;
const median = (xs: number[]) => quantile([...xs].sort((a,b) => a-b), .5);
const quantile = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor((xs.length - 1) * p))];
const values = (rows: SpendDay[]) => rows.map(r => Number(r.spend));
export const METHODS = ['Recent week', 'Recent three days', 'Smoothed level', 'Weekday pattern'] as const;
export type Method = typeof METHODS[number];
export function predictDay(rows: SpendDay[], date: string, method: Method): number {
  const v = values(rows);
  if (!v.length) throw new Error('No completed history');
  if (method === 'Recent week') return mean(v.slice(-7));
  if (method === 'Recent three days') return mean(v.slice(-3));
  if (method === 'Smoothed level') return v.reduce((level,x) => .4*x + .6*level, v[0]);
  const weekday = new Date(date).getUTCDay();
  const matches = rows.filter(r => new Date(r.date).getUTCDay() === weekday).slice(-4);
  const seasonal = matches.length ? mean(values(matches)) : mean(v.slice(-7));
  // Shrink sparse weekday estimates toward the recent level.
  return .5 * seasonal + .5 * mean(v.slice(-7));
}

export interface Forecast {
  status: 'forecast' | 'observed' | 'insufficient';
  publishedAt: string; evidenceId: string; trainingDays: number;
  knownTotal: string; completed: number; targetDays: number;
  missing: string[]; point: number | null; low: number | null; high: number | null;
  recommendation: string | null; stale: boolean; closed: boolean;
  warnings: string[]; reason: string;
  scenarios: { method: Method; total: number; outcome: string; weight: number; weeklyMae: number | null; folds: number }[];
  rangeShares: { id: string; share: number }[];
  daily: { date: string; observed: string | null; estimated: number | null }[];
}

export function weeklyBacktest(rows: SpendDay[], lead: number) {
  return METHODS.map(method => {
    const errors: number[] = [];
    for (let i = 7; i + lead + 7 <= rows.length; i++) {
      const origin = Date.parse(rows[i].date) + 12*3600_000;
      const past = rows.slice(0,i).filter(r => Date.parse(r.availableAt ?? r.publishedAt) <= origin);
      if (past.length < 7) continue;
      const test = rows.slice(i + lead, i + lead + 7);
      if (Date.parse(test[0].date) - Date.parse(past.at(-1)!.date) !== (lead+1)*DAY || test.some((r,j) => r.date !== dateKey(Date.parse(test[0].date)+j*DAY))) continue;
      const predicted = test.reduce((sum,r) => sum+predictDay(past,r.date,method),0);
      errors.push(Math.abs(predicted - Number(sumMoney(test.map(r => r.spend!)))));
    }
    return { method, folds: errors.length, mae: errors.length ? mean(errors) : null };
  });
}

export function forecast(archive: Archive, market: Market, now = Date.now()): Forecast {
  const dates = targetDates(market);
  const byDate = new Map(archive.days.map(d => [d.date,d]));
  const training = archive.days.filter(d => usable(d) && d.date < dateKey(now)).sort((a,b) => a.date.localeCompare(b.date));
  const known = dates.map(d => byDate.get(d)).filter((d): d is SpendDay => !!d && usable(d) && d.date < dateKey(now));
  const knownMap = new Map(known.map(d => [d.date,d.spend!]));
  const missing = dates.filter(d => !knownMap.has(d));
  const knownTotal = sumMoney([...knownMap.values()]);
  const stale = now - Date.parse(archive.publishedAt) > 12*3600_000;
  const closed = now >= Date.parse(market.trading.closesAt);
  const warnings: string[] = [];
  if (stale) warnings.push('The latest source report is over 12 hours old. Saving is blocked until fresh evidence is available.');
  if (closed) warnings.push('The prediction deadline has passed. The remaining task is collecting your official result code.');
  if (archive.revisions.length) warnings.push(`${archive.revisions.length} completed-day revision(s) recorded. Latest report values take precedence.`);
  const elapsedMissing = missing.filter(d => d < dateKey(now));
  if (elapsedMissing.length) warnings.push(`Completed target-day reports are missing for ${elapsedMissing.join(', ')}. These days are estimated, never counted as zero.`);
  const base: Forecast = { status: 'insufficient', publishedAt: archive.publishedAt, evidenceId: fingerprint(archive), trainingDays: training.length,
    knownTotal, completed: known.length, targetDays: dates.length, missing, point: null, low: null, high: null, recommendation: null,
    stale, closed, warnings, reason: '', scenarios: [], rangeShares: [], daily: dates.map(date => ({ date, observed: knownMap.get(date) ?? null, estimated: null })) };
  if (!missing.length) {
    const recommendation = bucketFor(knownTotal, market);
    return { ...base, status: 'observed', point: Number(knownTotal), low: Number(knownTotal), high: Number(knownTotal), recommendation,
      rangeShares: market.outcomes.map(o => ({ id:o.id, share:o.id === recommendation ? 1 : 0 })),
      reason: `The report published ${archive.publishedAt} contains all seven completed UTC daily totals for 2–8 November. Their unrounded sum is $${knownTotal}, in ${outcomeLabel(recommendation,market)}. This is the observed total; the instructor's settlement remains authoritative.` };
  }
  if (training.length < 3) {
    warnings.push('At least three completed daily observations are needed for even a provisional forecast.');
    return base;
  }
  if (training.length < 21) warnings.push('History is short and usage can change sharply. Scenario shares are not calibrated probabilities or guarantees.');
  const gaps = training.slice(1).filter((d,i) => Date.parse(d.date)-Date.parse(training[i].date) !== DAY);
  if (gaps.length) warnings.push('Historical dates have gaps. Backtests only use contiguous target weeks.');
  const lead = Math.max(0, Math.round((Date.parse(missing[0])-Date.parse(training.at(-1)!.date))/DAY)-1);
  const scores = weeklyBacktest(training, lead);
  const enoughBacktests = scores.every(s => s.folds >= 3);
  if (!enoughBacktests) warnings.push('Too few horizon-matched weekly backtests to select a proven model. The four models receive equal weight.');
  const inverse = scores.map(s => enoughBacktests ? 1/Math.max(s.mae!,1) : 1);
  const weightSum = inverse.reduce((a,b) => a+b,0);
  const scenarios = METHODS.map((method,i) => {
    const total = Number(knownTotal)+missing.reduce((sum,date) => sum+predictDay(training,date,method),0);
    return { method, total, outcome: bucketFor(total,market), weight: inverse[i]/weightSum, weeklyMae: scores[i].mae, folds:scores[i].folds };
  });
  let seed = parseInt(fingerprint(archive),16) || 1;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296; };
  const recent = values(training.slice(-14));
  const center = mean(recent);
  const residuals = recent.map(v => v-center);
  const samples: number[] = [];
  const shares = new Map(market.outcomes.map(o => [o.id,0]));
  for (let i = 0; i < 6000; i++) {
    const choice = random(); let cumulative=0;
    const model = scenarios.find(s => { cumulative+=s.weight; return choice<cumulative; }) ?? scenarios.at(-1)!;
    let offset = Math.floor(random()*residuals.length);
    // Blocks retain some adjacent-day dependence; the shared shock exposes level uncertainty.
    const shock = Math.exp((random()-.5)*.6);
    let total = Number(knownTotal);
    for (let j=0;j<missing.length;j++) {
      if (j%3 === 0) offset=Math.floor(random()*residuals.length);
      total += Math.max(0,predictDay(training,missing[j],model.method)*shock+residuals[(offset+j%3)%residuals.length]);
    }
    samples.push(total);
    const bucket = bucketFor(total,market); shares.set(bucket,shares.get(bucket)!+1);
  }
  samples.sort((a,b) => a-b);
  const rangeShares = market.outcomes.map(o => ({ id:o.id,share:shares.get(o.id)!/samples.length }));
  const recommendation = [...rangeShares].sort((a,b) => b.share-a.share)[0].id;
  const point = median(samples);
  const daily = base.daily.map(d => ({ ...d, estimated:d.observed === null ? scenarios.reduce((sum,s) => sum+s.weight*predictDay(training,d.date,s.method),0) : null }));
  const reportTime = archive.publishedAt.slice(0,16).replace('T',' ')+' UTC';
  const basis = known.length
    ? `${known.length} completed target days have cost $${knownTotal}. I have estimated the remaining ${missing.length} days rather than treating them as zero.`
    : `The latest ${Math.min(training.length,7)} completed days averaged ${formatMoney(mean(values(training.slice(-7))))} per day. The target week has not been observed yet.`;
  const reason = `I predict ${outcomeLabel(recommendation,market)} for AI Pipe's total spending on 2–8 November (UTC). ${basis} Using the report from ${reportTime}, the estimated weekly total is about ${formatMoney(point)}. Future usage may change, so I will reconsider this range when new completed daily reports arrive.`;
  return { ...base, status:'forecast', point, low:quantile(samples,.05), high:quantile(samples,.95), recommendation, scenarios,rangeShares,daily,reason };
}

export function evidenceForReview(f: Forecast, archive: Archive, market: Market) {
  return { market:{ id:market.id, target:market.observation.window, deadline:market.trading.closesAt, outcomes:market.outcomes },
    forecast:f, observations:archive.days.filter(usable).slice(-90).map(d => ({ date:d.date, spend_usd:d.spend, source:d.source, publishedAt:d.publishedAt })),
    limitations:['Future costs cannot be verified before observation.', 'No browsing or external tools are supplied to the reviewer.', 'Simulation shares are uncalibrated.', 'The official backend alone determines marks and signed receipts.'] };
}
