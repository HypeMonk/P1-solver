import { describe,it,expect } from 'vitest';
import { type Archive,type SpendDay,DAY,dateKey,FEED_URL,validateArchive,validateMarket } from '../src/core';
import { forecast,remainingBacktest } from '../src/forecast';
import { fixtureArchive,fixtureMarket } from './fixture';

const market=validateMarket(fixtureMarket);
const target=Date.parse('2026-11-02');
function history(value:(i:number,weekday:number)=>number,known=0,publicationHour=0):Archive {
  const now=target+known*DAY+13*3600_000;
  const start=target-126*DAY;
  const days:SpendDay[]=Array.from({length:133},(_,i)=>{
    const time=start+i*DAY;
    const publishedAt=new Date(time+DAY+publicationHour*3600_000+8_009).toISOString();
    return { date:dateKey(time),spend:String(value(i,new Date(time).getUTCDay())),complete:true,available:true,publishedAt,availableAt:publishedAt,source:FEED_URL };
  }).filter(row=>Date.parse(row.availableAt!)<=now);
  const publishedAt=new Date(now).toISOString();
  return validateArchive({version:1,publishedAt,collectedAt:publishedAt,days,revisions:[],sources:[FEED_URL]},now);
}
const sunday=(_:number,weekday:number)=>weekday===0?70:0;

describe('remaining-day validation',()=>{
  it('does not mistake full-week cancellation for accurate Sunday predictions',()=>{
    const a=history(sunday,6),now=target+6*DAY+13*3600_000;
    const whole=remainingBacktest(a.days,Array.from({length:7},(_,i)=>dateKey(target+7*DAY+i*DAY)),now);
    const remaining=remainingBacktest(a.days,['2026-11-08'],now);
    expect(whole.find(s=>s.method==='Recent week')!.mae).toBeCloseTo(0);
    expect(remaining.find(s=>s.method==='Recent week')!.mae).toBeCloseTo(60);
    expect(remaining.find(s=>s.method==='Weekday pattern')!.mae).toBeCloseTo(30);
    const f=forecast(a,market,now);
    expect(f.validation.uncertainty).toBe('historical-errors');
    expect(f.recommendation).toBe('5000-10000c');
    expect(f.point).toBeCloseTo(70,0);
    expect(f.daily.find(day=>day.date==='2026-11-08')!.estimated).toBeCloseTo(70,8);
    expect(f.scenarios.every(s=>Math.abs(s.total-70)<1e-8)).toBe(true);
  });
  it('preserves the actual weekday mask and uses disjoint target weeks',()=>{
    const a=history(sunday,6),now=target+6*DAY+13*3600_000;
    const scores=remainingBacktest(a.days,['2026-11-06','2026-11-08'],now);
    const dates=scores[0].errors.flatMap(fold=>fold.dates);
    expect(scores[0].folds).toBe(12);
    expect(new Set(dates).size).toBe(dates.length);
    for(const fold of scores[0].errors)expect(fold.dates.map(date=>new Date(date).getUTCDay())).toEqual([5,0]);
    expect(scores.every(score=>score.folds===scores[0].folds)).toBe(true);
  });
  it('does not train on a missing historical day earlier than the last training date',()=>{
    const a=history((_,w)=>w===3?12:3,6),now=target+6*DAY+13*3600_000;
    a.days=a.days.filter(row=>row.date!=='2026-11-04');
    const before=remainingBacktest(a.days,['2026-11-04','2026-11-08'],now);
    const changed=a.days.map(row=>row.date==='2026-10-28'?{...row,spend:'9000'}:row);
    const after=remainingBacktest(changed,['2026-11-04','2026-11-08'],now);
    expect(before[0].errors[0].dates).toEqual(['2026-10-28','2026-11-01']);
    expect(after[0].errors[0].predicted).toBe(before[0].errors[0].predicted);
    expect(after[0].errors[0].actual).not.toBe(before[0].errors[0].actual);
  });
  it('skips missing target observations instead of substituting zero',()=>{
    const a=history(sunday,6),now=target+6*DAY+13*3600_000;
    const before=remainingBacktest(a.days,['2026-11-08'],now);
    const missing=a.days.filter(row=>row.date!=='2026-11-01');
    const after=remainingBacktest(missing,['2026-11-08'],now);
    expect(before[0].errors[0].dates).toEqual(['2026-11-01']);
    expect(after[0].errors.some(fold=>fold.dates.includes('2026-11-01'))).toBe(false);
  });
  it('uses the matching publication cutoff rather than a fixed noon origin',()=>{
    const a=history(()=>10,0,12),now=target+13*3600_000;
    const scores=remainingBacktest(a.days,Array.from({length:7},(_,i)=>dateKey(target+i*DAY)),now);
    expect(scores[0].folds).toBe(12);
    expect(scores[0].mae).toBeCloseTo(0);
  });
  it('excludes training revisions unavailable at a historical origin',()=>{
    const a=history(()=>6,0),now=target+13*3600_000;
    const scores=remainingBacktest(a.days,['2026-11-02'],now);
    const lastTraining=scores[0].errors[0].dates[0];
    const date=dateKey(Date.parse(lastTraining)-DAY);
    const revised=a.days.map(row=>row.date===date?{...row,spend:'999',publishedAt:new Date(now).toISOString(),availableAt:new Date(now).toISOString()}:row);
    const result=remainingBacktest(revised,['2026-11-02'],now);
    expect(result[0].errors.some(fold=>fold.origin===scores[0].errors[0].origin)).toBe(false);
  });
  it('does not let unavailable future observations enter historical forecasts',()=>{
    const a=history(()=>6,0),now=target+13*3600_000;
    const baseline=forecast(a,market,now);
    const publishedAt=new Date(now+DAY).toISOString();
    const later={...a,days:[...a.days,{date:'2026-11-02',spend:'99999',complete:true,available:true,publishedAt,availableAt:publishedAt,source:FEED_URL}]};
    expect(forecast(later,market,now)).toEqual(baseline);
  });
  it('produces historical errors from predictions, not raw weekday variation',()=>{
    const a=history(sunday),f=forecast(a,market,target+13*3600_000);
    expect(f.validation.uncertainty).toBe('historical-errors');
    expect(f.scenarios.find(s=>s.method==='Recent week')!.remainingMae).toBeCloseTo(0);
    expect(f.point!).toBeGreaterThan(68);
    expect(f.point!).toBeLessThan(72);
    expect(f.low!).toBeGreaterThan(40);
    expect(f.high!).toBeLessThan(110);
  });
});

describe('held-out predictable patterns',()=>{
  const patterns:[string,(i:number,weekday:number)=>number,number][]=[
    ['weekday cycle',(_,weekday)=>[22,4,3,5,4,8,6][weekday],52],
    ['rising level',i=>2+i*.08,86.24],
    ['falling level',i=>16-i*.05,66.85],
  ];
  for(const [name,value,total] of patterns)for(const known of [0,1,3,5,6])it(`${name}: ${known} target days known`,()=>{
    const a=history(value,known),now=target+known*DAY+13*3600_000;
    const f=forecast(a,market,now);
    expect(f.validation.uncertainty).toBe('historical-errors');
    expect(Math.abs(f.point!-total)).toBeLessThan(1);
    expect(f.recommendation).toBe('5000-10000c');
    expect(f.low!).toBeLessThanOrEqual(total);expect(f.high!).toBeGreaterThanOrEqual(total);
  });
});

describe('forecast safeguards and sparse-history fallback',()=>{
  it('preserves the audited real-data estimate when matching history is too short',()=>{
    const a=structuredClone(fixtureArchive);
    a.days=a.days.filter(row=>row.complete);
    const additions=['2.5484218000000007','3.6028603500000003','9.002830099999999','2.4784502699999997'];
    for(const [i,spend] of additions.entries()){
      const date=`2026-10-${27+i}`,publishedAt=new Date(Date.parse(date)+DAY+60_000).toISOString();
      a.days.push({date,spend,complete:true,available:true,publishedAt,availableAt:publishedAt,source:FEED_URL});
    }
    a.publishedAt='2026-10-31T12:00:07.470Z';a.collectedAt=a.publishedAt;
    const f=forecast(validateArchive(a,Date.parse('2026-10-31T14:00:00Z')),market,Date.parse('2026-10-31T14:00:00Z'));
    expect(f.point).toBeCloseTo(41.45283740179171,10);
    expect(f.recommendation).toBe('2000-5000c');
    expect(f.validation).toEqual({matchedWeeks:0,remainingDays:7,uncertainty:'stress-scenarios'});
    expect(f.scenarios.every(s=>s.weight===.25)).toBe(true);
    expect(f.warnings.join(' ')).toContain('provisional stress scenarios');
  });
  it('keeps an exact known subtotal below a bucket boundary in partial forecasts',()=>{
    const a=history(()=>0,6),now=target+6*DAY+13*3600_000;
    a.days.find(row=>row.date==='2026-11-02')!.spend='49.9999999999999999999';
    const f=forecast(a,market,now);
    expect(f.knownTotal).toBe('49.9999999999999999999');
    expect(f.rangeShares.find(r=>r.id==='2000-5000c')!.share).toBeGreaterThan(.1);
    expect(f.scenarios.find(s=>s.method==='Recent three days')!.outcome).toBe('2000-5000c');
  });
  it('updates forecast identity when availability changes relevant backtests',()=>{
    const a=history((i)=>2+i*.08),now=target+13*3600_000;
    const before=forecast(a,market,now);
    const publishedAt=new Date(now).toISOString();
    const late={...a,days:a.days.map(row=>({...row,publishedAt,availableAt:publishedAt}))};
    const after=forecast(late,market,now);
    expect(after.evidenceId).not.toBe(before.evidenceId);
    expect(before.validation.uncertainty).toBe('historical-errors');
    expect(after.validation.uncertainty).toBe('stress-scenarios');
  });
  it('does not change the numerical forecast for identical completed reports republished later',()=>{
    const a=history(()=>6),now=target+13*3600_000;
    const before=forecast(a,market,now);
    const republished={...a,publishedAt:new Date(now+60000).toISOString(),days:a.days.map(row=>({...row,publishedAt:new Date(now+60000).toISOString()}))};
    const after=forecast(republished,market,now);
    expect(after.point).toBe(before.point);expect(after.evidenceId).toBe(before.evidenceId);
    expect(after.rangeShares).toEqual(before.rangeShares);
  });
  it('invalidates the forecast identity when the official ranges change',()=>{
    const a=history(()=>6),now=target+13*3600_000;
    const before=forecast(a,market,now);
    const changed=structuredClone(market);
    changed.settlement.numericRanges.find(r=>r.outcomeId==='2000-5000c')!.max=40;
    changed.settlement.numericRanges.find(r=>r.outcomeId==='5000-10000c')!.min=40;
    const after=forecast(a,validateMarket(changed),now);
    expect(after.point).toBe(before.point);
    expect(after.recommendation).not.toBe(before.recommendation);
    expect(after.evidenceId).not.toBe(before.evidenceId);
  });
  it('keeps the observed exact result path separate from simulations',()=>{
    const a=history(()=>.1,7),now=target+7*DAY+13*3600_000;
    const f=forecast(a,market,now);
    expect(f.status).toBe('observed');expect(f.knownTotal).toBe('0.7');
    expect(f.validation.uncertainty).toBe('observed');expect(f.recommendation).toBe('50-100c');
  });
});
