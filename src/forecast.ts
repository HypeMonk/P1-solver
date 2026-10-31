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
  validation: { matchedWeeks: number; remainingDays: number; uncertainty: 'historical-errors' | 'stress-scenarios' | 'observed' };
  scenarios: { method: Method; total: number; outcome: string; weight: number; remainingMae: number | null; folds: number }[];
  rangeShares: { id: string; share: number }[];
  daily: { date: string; observed: string | null; estimated: number | null }[];
}

export interface BacktestScore {
  method: Method; folds: number; mae: number | null;
  errors: { origin: string; dates: string[]; predicted: number; actual: number; error: number; dailyErrors: number[] }[];
}
const availableBy = (row: SpendDay, time: number) => usable(row) && row.date < dateKey(time) && Date.parse(row.availableAt ?? row.publishedAt) <= time;

export function remainingBacktest(rows: SpendDay[], missing: string[], now: number): BacktestScore[] {
  const history = rows.filter(row => availableBy(row,now)).sort((a,b) => a.date.localeCompare(b.date));
  const scores: BacktestScore[] = METHODS.map(method => ({ method, folds: 0, mae: null, errors: [] }));
  if (!history.length || !missing.length) return scores;
  const byDate = new Map(history.map(row => [row.date,row]));
  const latest = Date.parse(history.at(-1)!.date);
  const earliest = Date.parse(history[0].date);
  // Weekly shifts preserve weekdays and the missing-day mask without overlapping targets.
  for (let shift = 7*DAY; latest-shift >= earliest+6*DAY && scores[0].folds < 12; shift += 7*DAY) {
    const origin = now-shift;
    const dates = missing.map(date => dateKey(Date.parse(date)-shift));
    const targetSet = new Set(dates);
    const test = dates.map(date => byDate.get(date));
    if (test.some(row => !row)) continue;
    const lastTrainingDate = dateKey(latest-shift);
    const past = history.filter(row => row.date <= lastTrainingDate && !targetSet.has(row.date) && availableBy(row,origin));
    if (past.length < 7 || past.at(-1)!.date !== lastTrainingDate) continue;
    const actual = Number(sumMoney(test.map(row => row!.spend!)));
    for (const score of scores) {
      const daily = dates.map(date => predictDay(past,date,score.method));
      const predicted = daily.reduce((sum,value) => sum+value,0);
      score.errors.push({ origin: new Date(origin).toISOString(), dates, predicted, actual, error: actual-predicted,
        dailyErrors: test.map((row,i) => Number(row!.spend)-daily[i]) });
    }
    scores.forEach(score => score.folds++);
  }
  return scores.map(score => ({ ...score, mae: score.folds ? mean(score.errors.map(fold => Math.abs(fold.error))) : null }));
}

export function weeklyBacktest(rows: SpendDay[], lead: number) {
  const last = [...rows].sort((a,b) => a.date.localeCompare(b.date)).at(-1);
  if (!last) return METHODS.map(method => ({ method, folds: 0, mae: null }));
  const latest = Date.parse(last.date);
  const dates = Array.from({length:7},(_,i) => dateKey(latest+(lead+i+1)*DAY));
  return remainingBacktest(rows,dates,latest+DAY+12*3600_000).map(({method,folds,mae}) => ({method,folds,mae}));
}

function forecastIdentity(training: SpendDay[], missing: string[], knownTotal: string, scores: BacktestScore[], market: Market) {
  const text = JSON.stringify({ version: 'remaining-days-v1', market, training: training.map(row => [row.date,row.spend,row.availableAt ?? row.publishedAt]), missing, knownTotal,
    errors: scores.map(score => [score.method,score.errors.map(fold => [fold.dates,fold.error])]) });
  let hash = 2166136261;
  for (const c of text) hash = Math.imul(hash ^ c.charCodeAt(0),16777619);
  return (hash >>> 0).toString(16);
}

export function forecast(archive: Archive, market: Market, now = Date.now()): Forecast {
  const dates = targetDates(market);
  const byDate = new Map(archive.days.map(d => [d.date,d]));
  const training = archive.days.filter(d => availableBy(d,now)).sort((a,b) => a.date.localeCompare(b.date));
  const known = dates.map(d => byDate.get(d)).filter((d): d is SpendDay => !!d && availableBy(d,now));
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
  const base: Forecast = { status: 'insufficient', publishedAt: archive.publishedAt, evidenceId: forecastIdentity(training,missing,knownTotal,[],market), trainingDays: training.length,
    knownTotal, completed: known.length, targetDays: dates.length, missing, point: null, low: null, high: null, recommendation: null,
    stale, closed, warnings, reason: '', scenarios: [], rangeShares: [], validation: { matchedWeeks: 0, remainingDays: missing.length, uncertainty: missing.length ? 'stress-scenarios' : 'observed' },
    daily: dates.map(date => ({ date, observed: knownMap.get(date) ?? null, estimated: null })) };
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
  const scores = remainingBacktest(training,missing,now);
  const enoughBacktests = scores.every(s => s.folds >= 3);
  if (!enoughBacktests) warnings.push('Too few matching past weeks to rank the methods or estimate their errors reliably. The four models receive equal weight; uncertainty uses provisional stress scenarios.');
  const inverse = scores.map(s => enoughBacktests ? 1/Math.max(s.mae!,1) : 1);
  const weightSum = inverse.reduce((a,b) => a+b,0);
  const estimates = METHODS.map(method => missing.map(date => predictDay(training,date,method)));
  const remainingTotals = estimates.map(days => days.reduce((sum,value) => sum+value,0));
  const adjustedEstimates = estimates.map((days,i) => days.map((value,j) => Math.max(0,value+(enoughBacktests ? mean(scores[i].errors.map(fold => fold.dailyErrors[j])) : 0))));
  const scenarios = METHODS.map((method,i) => {
    const correction = enoughBacktests ? mean(scores[i].errors.map(fold => fold.error)) : 0;
    const total = sumMoney([knownTotal,String(Math.max(0,remainingTotals[i]+correction))]);
    return { method, total: Number(total), outcome: bucketFor(total,market), weight: inverse[i]/weightSum, remainingMae: scores[i].mae, folds:scores[i].folds };
  });
  base.evidenceId = forecastIdentity(training,missing,knownTotal,scores,market);
  base.validation = { matchedWeeks: scores[0].folds, remainingDays: missing.length, uncertainty: enoughBacktests ? 'historical-errors' : 'stress-scenarios' };
  let seed = parseInt(fingerprint({...archive,days:training}),16) || 1;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296; };
  const recent = values(training.slice(-14));
  const center = mean(recent);
  const residuals = recent.map(v => v-center);
  const samples: number[] = [];
  const shares = new Map(market.outcomes.map(o => [o.id,0]));
  for (let i = 0; i < 6000; i++) {
    const choice = random(); let cumulative=0;
    const model = scenarios.find(s => { cumulative+=s.weight; return choice<cumulative; }) ?? scenarios.at(-1)!;
    const modelIndex = scenarios.indexOf(model);
    const errors = scores[modelIndex].errors;
    let offset = Math.floor(random()*(enoughBacktests ? errors.length : residuals.length));
    const shock = Math.exp((random()-.5)*.6);
    let remaining = 0;
    if (enoughBacktests) {
      remaining = Math.max(0,remainingTotals[modelIndex]*shock+errors[offset].error);
    } else {
      // With little matching history, retain the broad, explicitly heuristic stress scenarios.
      for (let j=0;j<missing.length;j++) {
        if (j%3 === 0) offset=Math.floor(random()*residuals.length);
        remaining += Math.max(0,estimates[modelIndex][j]*shock+residuals[(offset+j%3)%residuals.length]);
      }
    }
    const total = sumMoney([knownTotal,String(remaining)]);
    samples.push(Number(total));
    const bucket = bucketFor(total,market); shares.set(bucket,shares.get(bucket)!+1);
  }
  samples.sort((a,b) => a-b);
  const rangeShares = market.outcomes.map(o => ({ id:o.id,share:shares.get(o.id)!/samples.length }));
  const recommendation = [...rangeShares].sort((a,b) => b.share-a.share)[0].id;
  const point = median(samples);
  const daily = base.daily.map(d => ({ ...d, estimated:d.observed === null ? scenarios.reduce((sum,s,i) => sum+s.weight*adjustedEstimates[i][missing.indexOf(d.date)],0) : null }));
  const reportTime = archive.publishedAt.slice(0,16).replace('T',' ')+' UTC';
  const basis = known.length
    ? `${known.length} completed target ${known.length===1?'day has':'days have'} cost $${knownTotal}. I have estimated the remaining ${missing.length} ${missing.length===1?'day':'days'} rather than treating them as zero.`
    : `The latest ${Math.min(training.length,7)} completed days averaged ${formatMoney(mean(values(training.slice(-7))))} per day. The target week has not been observed yet.`;
  const reason = `I predict ${outcomeLabel(recommendation,market)} for AI Pipe's total spending on 2–8 November (UTC). ${basis} Using the report from ${reportTime}, the estimated weekly total is about ${formatMoney(point)}. Future usage may change, so I will reconsider this range when new completed daily reports arrive.`;
  return { ...base, status:'forecast', point, low:quantile(samples,.05), high:quantile(samples,.95), recommendation, scenarios,rangeShares,daily,reason };
}

export function evidenceForReview(f: Forecast, archive: Archive, market: Market) {
  return { market:{ id:market.id, target:market.observation.window, deadline:market.trading.closesAt, outcomes:market.outcomes },
    forecast:f, observations:archive.days.filter(usable).slice(-90).map(d => ({ date:d.date, spend_usd:d.spend, source:d.source, publishedAt:d.publishedAt })),
    limitations:['Future costs cannot be verified before observation.', 'No browsing or external tools are supplied to the reviewer.', 'Simulation shares are uncalibrated.', 'The official backend alone determines marks and signed receipts.'] };
}
