import type { Archive, Market } from '../src/core';
import { FEED_URL, MARKET_ID } from '../src/core';

// Fixed test observations must not advance with the scheduled public collector.
const publishedAt='2026-10-27T12:00:08.009Z';
const spending=['0.7682201999999996','0.8238163600000002','1.8324309000000008','2.9453845','0.22610058999999996','1.3671357999999998','3.270882450000001','11.00722815','13.798813450000003','16.46138393','17.65492995','2.19763595'];
export const fixtureArchive:Archive={
  version:1,publishedAt,collectedAt:'2026-10-27T14:00:00Z',revisions:[],sources:[FEED_URL],
  days:[...spending.map((spend,i)=>({date:`2026-10-${15+i}`,spend,complete:true,available:true,publishedAt,availableAt:publishedAt,source:FEED_URL})),
    {date:'2026-10-27',spend:'1.1346277000000005',complete:false,available:true,publishedAt,availableAt:publishedAt,source:FEED_URL}],
};
const ids=['0-1c','1-2c','2-5c','5-10c','10-20c','20-50c','50-100c','100-200c','200-500c','500-1000c','1000-2000c','2000-5000c','5000-10000c','10000-20000c','20000-50000c','50000-100000c','100000-plus-c'];
const edges=[0,.01,.02,.05,.1,.2,.5,1,2,5,10,20,50,100,200,500,1000];
export const fixtureMarket:Market={
  id:MARKET_ID,title:'How much will AI Pipe cost in one week?',
  outcomes:ids.map((id,i)=>({id,label:i===16?'$1,000 or more':`$${edges[i]} to under $${edges[i+1]}`})),
  trading:{opensAt:'2026-10-17T00:00:00Z',closesAt:'2026-11-09T00:00:00Z'},
  observation:{window:{startDate:'2026-11-02',endDate:'2026-11-09'}},
  settlement:{numericRanges:ids.map((outcomeId,i)=>({outcomeId,min:edges[i],...(i<16?{max:edges[i+1]}:{})}))},
};
