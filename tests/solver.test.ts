import { describe,it,expect,vi,afterEach } from 'vitest';
import { fixtureArchive, fixtureMarket } from './fixture';
import { type Archive, type SpendDay, DAY, FEED_URL, parseFeed, validateArchive, validateMarket, mergeArchives, bucketFor, sumMoney, targetDates, validateReason, dateKey, fingerprint } from '../src/core';
import { forecast, weeklyBacktest, predictDay } from '../src/forecast';
import { MarketClient, reflectionPayload, extractLaunchToken } from '../src/network';
import { parseReview, providerUrl } from '../src/llm';

const market=validateMarket(fixtureMarket);
const now=Date.parse('2026-10-27T14:00:00Z');
const official=validateArchive(fixtureArchive,now);
function row(date:string,spend:string,extra:Partial<SpendDay>={}):SpendDay{return {date,spend,complete:true,available:true,publishedAt:dateKey(Date.parse(date)+DAY)+'T00:01:00Z',availableAt:dateKey(Date.parse(date)+DAY)+'T00:01:00Z',source:FEED_URL,...extra};}
function archive(days:SpendDay[],publishedAt='2026-10-27T12:00:08.009Z'):Archive{return {version:1,publishedAt,collectedAt:publishedAt,days,revisions:[],sources:[FEED_URL]};}
function feed(days:unknown[],published_at='2026-10-27T12:00:00Z'){return JSON.stringify({schema_version:1,timezone:'UTC',published_at,days});}
const raw=(date='2026-10-26',spend_usd:unknown=2)=>({date,complete:true,available:true,total:{spend_usd}});

describe('source validation and exact money',()=>{
  it('preserves long JSON decimals before numeric conversion',()=>{
    const text='{"schema_version":1,"timezone":"UTC","published_at":"2026-10-27T12:00:00Z","days":[{"date":"2026-10-26","complete":true,"available":true,"total":{"spend_usd":49.9999999999999999999}}]}';
    const a=parseFeed(text,now);expect(a.days[0].spend).toBe('49.9999999999999999999');expect(bucketFor(a.days[0].spend!,market)).toBe('2000-5000c');
  });
  it('adds decimal quantities without binary drift',()=>expect(sumMoney(['0.1','0.2'])).toBe('0.3'));
  it('does not round long observed totals into a higher bucket',()=>{const total=sumMoney(['49.9999999999999999999','0']);expect(total).toBe('49.9999999999999999999');expect(bucketFor(total,market)).toBe('2000-5000c');});
  it('rejects an unsupported feed timezone',()=>expect(()=>parseFeed(JSON.stringify({schema_version:1,timezone:'Asia/Kolkata',published_at:'2026-10-27T12:00:00Z',days:[raw()]}),now)).toThrow(/timezone/));
  for(const [value,id] of [['0','0-1c'],['0.01','1-2c'],['49.999999999','2000-5000c'],['50','5000-10000c'],['99.999999999','5000-10000c'],['100','10000-20000c'],['1000','100000-plus-c']])it(`maps exact boundary ${value}`,()=>expect(bucketFor(value,market)).toBe(id));
  it('rejects negative amounts',()=>expect(()=>parseFeed(feed([raw(undefined,-1)]),now)).toThrow());
  it('rejects nonnumeric strings',()=>expect(()=>parseFeed(feed([raw(undefined,'NaN')]),now)).toThrow());
  it('accepts a genuine completed zero',()=>expect(parseFeed(feed([raw(undefined,0)]),now).days[0].spend).toBe('0'));
  it('rejects completed rows with missing totals',()=>expect(()=>parseFeed(feed([{...raw(),total:null}]),now)).toThrow());
  it('retains unknown unavailable rows as null',()=>expect(parseFeed(feed([{...raw(),available:false,total:null}]),now).days[0].spend).toBeNull());
  it('rejects a completed current UTC day',()=>expect(()=>parseFeed(feed([raw('2026-10-27')]),now)).toThrow(/completed UTC/));
  it('rejects invalid calendar dates',()=>expect(()=>parseFeed(feed([raw('2026-02-30')]),now)).toThrow());
  it('rejects duplicates',()=>expect(()=>parseFeed(feed([raw(),raw()]),now)).toThrow(/Duplicate/));
  it('rejects future reports',()=>expect(()=>parseFeed(feed([raw()],'2026-10-28T00:00:00Z'),now)).toThrow(/future/));
  it('rejects timezone-less publication times',()=>expect(()=>parseFeed(feed([raw()],'2026-10-27T12:00:00'),now)).toThrow());
  it('rejects invalid archive completeness',()=>expect(()=>validateArchive(archive([row('2026-10-26','2',{spend:null})]),now)).toThrow());
  it('rejects a different market',()=>expect(()=>validateMarket({...market,id:'another-market'})).toThrow(/different market/));
  it('rejects changed target dates',()=>expect(()=>validateMarket({...market,observation:{window:{startDate:'2026-11-03',endDate:'2026-11-10'}}})).toThrow(/target dates/));
  it('rejects overlapping intervals',()=>{const copy=structuredClone(market);copy.settlement.numericRanges[1].min=0;expect(()=>validateMarket(copy)).toThrow();});
  it('enumerates seven UTC target days',()=>expect(targetDates(market)).toEqual(['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']));
});
describe('archive merge',()=>{
  it('preserves days that fall out of the rolling feed',()=>expect(mergeArchives(archive([row('2026-10-15','1')]),archive([row('2026-10-26','2')])).days).toHaveLength(2));
  it('uses newer revisions and records them',()=>{const a=row('2026-10-25','2');const b={...a,spend:'3',publishedAt:'2026-10-27T12:00:00Z'};const merged=mergeArchives(archive([a]),archive([b]));expect(merged.days[0].spend).toBe('3');expect(merged.revisions).toHaveLength(1);});
  it('does not roll back newer data',()=>{const a=row('2026-10-25','3',{publishedAt:'2026-10-27T12:00:00Z'});expect(mergeArchives(archive([a]),archive([row('2026-10-25','2')])).days[0].spend).toBe('3');});
  it('rejects contradictory reports at one timestamp',()=>{const a=row('2026-10-25','2');expect(()=>mergeArchives(archive([a]),archive([{...a,spend:'3'}]))).toThrow(/Conflicting/);});
  it('records a completed-day withdrawal instead of silently retaining it',()=>{const a=row('2026-10-25','2');const merged=mergeArchives(archive([a]),archive([{...a,available:false,publishedAt:'2026-10-27T12:00:00Z'}]));expect(merged.days[0].available).toBe(false);expect(merged.revisions[0].after).toBeNull();});
  it('keeps first availability for unchanged values',()=>{const a=row('2026-10-25','2');expect(mergeArchives(archive([a]),archive([{...a,publishedAt:'2026-10-27T12:00:00Z',availableAt:'2026-10-27T12:00:00Z'}])).days[0].availableAt).toBe(a.availableAt);});
  it('does not change the evidence fingerprint for republishing identical totals',()=>expect(fingerprint(archive([row('2026-10-25','2')]))).toBe(fingerprint(archive([row('2026-10-25','2',{publishedAt:'2026-10-27T12:00:00Z'})]))));
});
describe('forecast behavior',()=>{
  it('is deterministic, finite, and transparently provisional',()=>{const a=forecast(official,market,now),b=forecast(official,market,now);expect(a).toEqual(b);expect(a.status).toBe('forecast');expect(a.point).toBeGreaterThan(0);expect(a.low).toBeGreaterThanOrEqual(0);expect(a.low!).toBeLessThanOrEqual(a.point!);expect(a.high!).toBeGreaterThanOrEqual(a.point!);expect(a.rangeShares.reduce((s,r)=>s+r.share,0)).toBeCloseTo(1);expect(a.scenarios.every(s=>s.weight===.25)).toBe(true);});
  it('excludes incomplete spending from history',()=>{const a=forecast(official,market,now);const copy=structuredClone(official);copy.days.find(d=>!d.complete&&d.date==='2026-10-27')!.spend='999999';expect(forecast(copy,market,now).point).toBe(a.point);});
  it('does not invent a result without enough evidence',()=>expect(forecast(archive([row('2026-10-25','5')]),market,now).recommendation).toBeNull());
  it('flags stale evidence at twelve hours',()=>expect(forecast(official,market,Date.parse(official.publishedAt)+12*3600_000+1).stale).toBe(true));
  it('closes at the exact UTC deadline',()=>expect(forecast(official,market,Date.parse(market.trading.closesAt)).closed).toBe(true));
  it('uses exact observed totals with all seven days',()=>{const days=targetDates(market).map(d=>row(d,'0.1'));const f=forecast(archive(days,'2026-11-09T00:01:00Z'),market,Date.parse('2026-11-09T02:00:00Z'));expect(f.status).toBe('observed');expect(f.knownTotal).toBe('0.7');expect(f.recommendation).toBe('50-100c');});
  it('keeps missing target days unknown',()=>{const days=[row('2026-11-02','50'),row('2026-11-03','5'),row('2026-11-04','5')];const f=forecast(archive(days,'2026-11-06T01:00:00Z'),market,Date.parse('2026-11-06T02:00:00Z'));expect(f.knownTotal).toBe('60');expect(f.missing).toHaveLength(4);expect(f.point!).toBeGreaterThanOrEqual(60);expect(f.warnings.join(' ')).toContain('2026-11-05');});
  it('handles all-zero history without NaN',()=>{const rows=Array.from({length:10},(_,i)=>row(dateKey(Date.parse('2026-10-15')+i*DAY),'0'));const f=forecast(archive(rows),market,now);expect(f.point).toBe(0);expect(f.recommendation).toBe('0-1c');});
  it('uses observation availability in horizon-matched backtests',()=>{const rows=Array.from({length:40},(_,i)=>row(dateKey(Date.parse('2026-09-01')+i*DAY),'10'));expect(weeklyBacktest(rows,0)[0].folds).toBeGreaterThan(0);const late=rows.map(r=>({...r,availableAt:'2026-12-01T00:00:00Z'}));expect(weeklyBacktest(late,0)[0].folds).toBe(0);});
  it('does not learn from later rows in a daily baseline',()=>expect(predictDay([row('2026-10-25','10')],'2026-11-02','Recent week')).toBe(10));
});
describe('LLM response checks',()=>{
  const good={verdict:'uncertain',suggestedOutcome:'5000-10000c',explanation:'I expect this range based on the completed daily reports, while future spending remains uncertain.',concerns:['Short history'],evidenceDates:['2026-10-26'],changeTrigger:'New completed reports shift the estimate.'};
  it('accepts a structured review citing available evidence',()=>expect(parseReview(JSON.stringify(good),official,market).verdict).toBe('uncertain'));
  it('rejects imaginary outcomes',()=>expect(()=>parseReview(JSON.stringify({...good,suggestedOutcome:'full-marks'}),official,market)).toThrow());
  it('rejects invented observation dates',()=>expect(()=>parseReview(JSON.stringify({...good,evidenceDates:['2026-11-05']}),official,market)).toThrow());
  it('rejects an empty evidence citation list',()=>expect(()=>parseReview(JSON.stringify({...good,evidenceDates:[]}),official,market)).toThrow());
  it('rejects non-JSON output',()=>expect(()=>parseReview('Certainly!',official,market)).toThrow());
  it('requires HTTPS for a custom provider',()=>expect(()=>providerUrl({provider:'compatible',endpoint:'http://example.com/v1',key:'x',model:'x',fallback:false})).toThrow());
  it('rejects embedded URL credentials',()=>expect(()=>providerUrl({provider:'compatible',endpoint:'https://user:secret@example.com/v1',key:'x',model:'x',fallback:false})).toThrow());
});
describe('account actions and retries',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('extracts an official launch link without retaining the URL',()=>expect(extractLaunchToken('https://tds-network-games.sanand.workers.dev/prediction-market/#market=x&launch_token=abc')).toBe('abc'));
  it('rejects a lookalike launch host',()=>expect(()=>extractLaunchToken('https://other.example/#launch_token=abc')).toThrow());
  it('creates exactly one selected range and no trading fields',()=>{const p=reflectionPayload(market,'5000-10000c','I used the completed daily reports.','abcdefgh');expect(p.probabilities.reduce<number>((a,b)=>a+b,0)).toBe(1);expect(p).not.toHaveProperty('credits');expect(p.choicePublic).toBe(false);expect(p.explanationPublic).toBe(false);});
  it('validates explanation bounds',()=>{expect(()=>validateReason('too short')).toThrow();expect(()=>validateReason('a '.repeat(501))).toThrow();expect(validateReason('I used completed daily totals.')).toBeTruthy();});
  it('reuses the idempotency key after an ambiguous transport failure',async()=>{
    const requests:any[]=[];let saves=0;
    vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
      if(url.endsWith('/session'))return new Response(JSON.stringify({token:'session-secret',student_id:'student@example.test'}));
      requests.push(JSON.parse(init.body as string));if(saves++===0)throw new Error('Network interrupted');return new Response('{}');
    }));
    const client=new MarketClient();await client.connect('entry-secret');
    await expect(client.save(market,'5000-10000c','I used completed daily reports.',now)).rejects.toThrow();
    await client.save(market,'5000-10000c','I used completed daily reports.',now);
    expect(requests[0].idempotency_key).toBe(requests[1].idempotency_key);
  });
  it('clears sessions rejected by the server',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/session')?new Response(JSON.stringify({token:'secret',student_id:'student@example.test'})):new Response(JSON.stringify({error:'invalid_session',message:'Reconnect'}),{status:401})));
    const client=new MarketClient();await client.connect('fresh');await expect(client.receipt()).rejects.toThrow();expect(client.studentId).toBe('');
  });
  it('never sends a prediction after closure',async()=>{
    const fn=vi.fn(async()=>new Response(JSON.stringify({token:'secret',student_id:'student@example.test'})));vi.stubGlobal('fetch',fn);const client=new MarketClient();await client.connect('fresh');await expect(client.save(market,'5000-10000c','I used completed daily reports.',Date.parse(market.trading.closesAt))).rejects.toThrow(/window/);expect(fn).toHaveBeenCalledTimes(1);
  });
  it('rejects practice identities',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({token:'x',student_id:'practice:test'}))));await expect(new MarketClient().connect('fresh')).rejects.toThrow(/verified/);});
});
