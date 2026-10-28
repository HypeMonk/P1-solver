import {afterEach,describe,expect,it,vi} from 'vitest';
import {loadData,PUBLIC_FEED_RELAY} from '../src/network';
import {FEED_URL,MARKET_API} from '../src/core';
import {fixtureArchive,fixtureMarket} from './fixture';
import {createFeedRelay} from '../server/feedRelay';

const newer=structuredClone(fixtureArchive);
newer.publishedAt='2026-10-27T13:00:00Z';
newer.days=newer.days.map(d=>({...d,publishedAt:newer.publishedAt,...(d.date==='2026-10-26'?{spend:'10',availableAt:newer.publishedAt}:{})}));
const rawFeed=JSON.stringify({schema_version:1,timezone:'UTC',published_at:newer.publishedAt,days:newer.days.map(d=>({date:d.date,complete:d.complete,available:d.available,total:{spend_usd:d.spend}}))});
function common(url:string){
  if(url.endsWith('/data/archive.json'))return new Response(JSON.stringify(fixtureArchive));
  if(url.endsWith('/data/market.json'))return new Response(JSON.stringify(fixtureMarket));
  if(url===`${MARKET_API}/markets`)return new Response(JSON.stringify({markets:[fixtureMarket]}));
  return null;
}
describe('fresh source acquisition',()=>{
  afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});
  it('manual refresh explicitly asks the hosted relay to bypass its normal cache',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-27T14:00:00Z'));vi.stubEnv('VITE_STATIC_ONLY','false');vi.stubEnv('BASE_URL','/');
    const urls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return common(url)??new Response(JSON.stringify({archive:newer}));}));
    const result=await loadData(fixtureArchive,true);expect(urls).toContain('/api/data?refresh=1');expect(result.archive.days.find(d=>d.date==='2026-10-26')?.spend).toBe('10');expect(result.liveFeedChecked).toBe(true);
  });
  it('static hosting fetches the current official feed via a fixed token-free public relay',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-27T14:00:00Z'));vi.stubEnv('VITE_STATIC_ONLY','true');vi.stubEnv('BASE_URL','/');
    const calls:{url:string;init:RequestInit}[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{calls.push({url,init});return common(url)??new Response(rawFeed);}));
    const result=await loadData(fixtureArchive);expect(result.liveFeedChecked).toBe(true);expect(result.archive.days.find(d=>d.date==='2026-10-26')?.spend).toBe('10');
    const call=calls.find(c=>c.url===PUBLIC_FEED_RELAY)!;expect(call.url).toContain(FEED_URL);expect(call.init.credentials).toBe('omit');expect(call.init.headers).toBeUndefined();expect(calls.some(c=>c.url.includes('/api/data'))).toBe(false);
  });
  it('an offline source preserves and labels the saved evidence instead of inventing a report',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-27T14:00:00Z'));vi.stubEnv('VITE_STATIC_ONLY','true');vi.stubEnv('BASE_URL','/');
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{const response=common(url);if(response)return response;throw new Error('Offline');}));
    const result=await loadData(fixtureArchive);expect(result.liveFeedChecked).toBe(false);expect(result.archive.publishedAt).toBe(fixtureArchive.publishedAt);expect(result.notices.join(' ')).toContain('Live source refresh failed');
  });
  it('a failed hosted relay can fall back to the fixed public source',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-27T14:00:00Z'));vi.stubEnv('VITE_STATIC_ONLY','false');vi.stubEnv('BASE_URL','/');
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>common(url)??(url.includes('/api/data')?new Response(JSON.stringify({archive:fixtureArchive,warning:'Feed refresh failed'})):new Response(rawFeed))));
    const result=await loadData(fixtureArchive);expect(result.liveFeedChecked).toBe(true);expect(result.archive.publishedAt).toBe(newer.publishedAt);
  });
});
describe('hosted relay manual cache policy',()=>{
  it('caches automatic reads but refreshes a manual read after one minute',async()=>{
    let time=0;const fetch=vi.fn(async()=>fixtureArchive);const relay=createFeedRelay(async()=>fixtureArchive,fetch,()=>time);
    await relay();time=120_000;await relay();expect(fetch).toHaveBeenCalledTimes(1);await relay(true);expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not hammer the official source on repeated button presses',async()=>{
    let time=0;const fetch=vi.fn(async()=>fixtureArchive);const relay=createFeedRelay(async()=>fixtureArchive,fetch,()=>time);
    await relay();time=30_000;await relay(true);expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retains old data and a warning after a failed source read',async()=>{
    const relay=createFeedRelay(async()=>fixtureArchive,async()=>{throw new Error('Source offline');});const result=await relay(true);expect(result.archive).toBe(fixtureArchive);expect(result.warning).toContain('refresh failed');
  });
  it('coalesces simultaneous source reads',async()=>{
    let resolve!:(a:typeof fixtureArchive)=>void;const fetch=vi.fn(()=>new Promise<typeof fixtureArchive>(r=>{resolve=r;}));const relay=createFeedRelay(async()=>fixtureArchive,fetch);
    const first=relay(true),second=relay(true);await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));resolve(fixtureArchive);await Promise.all([first,second]);expect(fetch).toHaveBeenCalledTimes(1);
  });
});
