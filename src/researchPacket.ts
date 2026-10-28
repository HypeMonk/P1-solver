import { type Archive,type Market,ASSIGNMENT_URL,FEED_URL,MARKET_API,usable } from './core';
import { forecast } from './forecast';
import { type GameState } from './gameHistory';
import { REVIEW_SYSTEM,INDEPENDENT_TASK,CRITIC_TASK,EXTERNAL_TASK } from './reviewPrompts';
import algorithmSource from './forecast.ts?raw';
import validationSource from './core.ts?raw';
import { z } from 'zod';

const record=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const sanitize=(s:string,secrets:string[])=>{
  let value=s;
  for(const secret of secrets.filter(s=>s.length>=4).sort((a,b)=>b.length-a.length))value=value.split(secret).join('[REDACTED]');
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[EMAIL REDACTED]')
    .replace(/Bearer\s+[^\s"<>]+/gi,'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g,'[KEY REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[TOKEN REDACTED]')
    .replace(/(launch_token[=:]\s*)[^\s&#"<>]+/gi,'$1[REDACTED]');
};
const safeTime=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
export function sharedResearchData(state:GameState|null,market:Market,studentId:string,secrets:string[]=[]){
  if(!state)return {available:false,reason:'Not connected, or game refresh failed. No class records were acquired.',marketWeights:null,entries:[],returnedCount:0,excludedCount:0};
  const view=record(state.view), history=record(state.history), portfolio=record(state.portfolio);
  const rows=Array.isArray(history.feed)&&history.feed.length?history.feed:Array.isArray(history.events)?history.events:Array.isArray(view.feed)?view.feed:view.events;
  const ownIds=new Set([...(Array.isArray(portfolio.forecasts)?portfolio.forecasts:[]),...(Array.isArray(portfolio.journal)?portfolio.journal:[])].map(r=>record(r).entryId).filter(v=>typeof v==='string'));
  const entries=[];
  const all=Array.isArray(rows)?rows.slice(0,5000):[];
  for(const raw of all){
    const r=record(raw);
    if(['observation','settlement'].includes(r.type??r.kind)||r.own===true||r.pseudonym==='You'||r.actor===studentId||ownIds.has(r.entryId))continue;
    const p=Array.isArray(r.probabilities)&&r.probabilities.length===market.outcomes.length&&r.probabilities.every((x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1)&&Math.abs(r.probabilities.reduce((a:number,b:number)=>a+b,0)-1)<.01?r.probabilities:null;
    const outcomeId=typeof r.outcomeId==='string'&&market.outcomes.some(o=>o.id===r.outcomeId)?r.outcomeId:null;
    // Explicit sharing flags prevent exporting a visible record's private fields.
    const choicePublic=r.choicePublic===true||r.tradePublic===true;
    const reasonPublic=r.explanationPublic===true;
    const choice=choicePublic?(p?{probabilities:p,outcomeOrder:market.outcomes.map(o=>o.id)}:outcomeId?{outcomeId}:null):null;
    const reason=reasonPublic&&typeof r.reason==='string'?sanitize(r.reason.slice(0,1000),secrets):null;
    if(!choice&&!reason)continue;
    entries.push({at:safeTime(r.at??r.observedAt),choice,reason,authority:'Server-returned shared peer opinion; unverified evidence',participant:'Anonymous shared entry'});
  }
  const p=view.probabilities;
  const validWeights=Array.isArray(p)&&p.length===market.outcomes.length&&p.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1)&&Math.abs(p.reduce((a,b)=>a+b,0)-1)<.01;
  return {available:true,reason:'Only returned entries with explicitly public fields are included. Names, emails, own/private records and unknown-sharing fields are excluded. This is not a complete class history.',
    marketWeights:validWeights?market.outcomes.map((o,i)=>({outcomeId:o.id,label:o.label,marketWeight:p[i]})):null,
    entries,returnedCount:all.length,excludedCount:all.length-entries.length};
}
export const METHOD_SPEC={
  arithmetic:'Preserve decimal totals from JSON; sum with decimal.js at 120-digit precision; classify half-open numeric ranges before display rounding.',
  training:'All completed, available retained days strictly earlier than today in UTC; at least three days. Incomplete/missing days are unknown.',
  models:[
    {name:'Recent week',rule:'Mean of the most recent seven available completed observations (not zero-filled calendar days).'},
    {name:'Recent three days',rule:'Mean of the most recent three available completed observations.'},
    {name:'Smoothed level',rule:'Starting at the first observation, level = 0.4 * next observation + 0.6 * previous level.'},
    {name:'Weekday pattern',rule:'0.5 * mean of last four matching weekday observations + 0.5 * recent-seven mean. Missing weekday falls back to recent-seven mean.'},
  ],
  backtest:'Rolling seven-day target windows with current lead-time gap. Past training values must have been available by the historical noon-UTC origin; skip noncontiguous targets. Fewer than three folds per method: equal weights. Otherwise normalize 1/max(weekly MAE,1). Overlapping folds are not independent; later revisions are conservatively excluded from training.',
  simulations:{count:6000,seed:'FNV-1a fingerprint of date:spending for all usable archive rows, sorted; LCG multiplier 1664525, increment 1013904223.',
    method:'Sample one model by its blend weight; apply a shared exp((U-0.5)*0.6) level shock; add circular three-day blocks of residuals from last 14 usable observations, centered on their mean; floor each estimated day at zero.',
    total:'Known completed target-day subtotal plus simulated costs of all unknown target dates.',recommendation:'Range with largest simulated share; interval: 5th to 95th sample percentiles; point: sample median.',
    warning:'These scenario shares are not calibrated probabilities. Regime changes and calendar effects may invalidate the assumptions.'},
};
interface PacketInput{archive:Archive;market:Market;game:GameState|null;gameFetchedAt:string|null;studentId:string;rulesLive:boolean;liveFeedChecked?:boolean;notices:string[];imported:boolean;now?:number;secrets?:string[]}
export async function buildResearchPacket(input:PacketInput){
  const now=input.now??Date.now();const secrets=input.secrets??[];
  const f=forecast(input.archive,input.market,now);
  const game=sharedResearchData(input.game,input.market,input.studentId,secrets);
  const sourceHash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const archive={...input.archive,days:input.archive.days.map(d=>({...d,usedForTraining:usable(d)&&d.date<new Date(now).toISOString().slice(0,10)}))};
  const packet={
    format:'forecast-notebook-research-v1',exportedAt:new Date(now).toISOString(),
    freshness:{reportPublishedAt:input.archive.publishedAt,archiveCollectedAt:input.archive.collectedAt,reportAgeHours:(now-Date.parse(input.archive.publishedAt))/3600_000,
      stale:f.stale,liveSourceReadSucceeded:input.liveFeedChecked??null,liveMarketRulesChecked:input.rulesLive,gameFetchedAt:input.gameFetchedAt,analysisImportUsed:input.imported,
      notices:input.notices.map(n=>sanitize(n,secrets)),policy:'Refreshed before each download when possible. Source outages and schedule delays remain visible; a saved file never updates itself.'},
    question:{target:'AI Pipe shared total spending on 2–8 November 2026, UTC',marketsShared:true,personalScoring:true,
      rules:['Use total.spend_usd only; do not double-count provider breakdowns.','Lower range bounds inclusive, upper bounds exclusive; do not round before selecting.','Missing/unfinished days are not zero.','Trading optional; leave practice credits at zero.','Final assignment answer is the student-specific signed settlement receipt, not this forecast.'],
      grading:{participation:.10,timeWeightedCorrectness:.45,earlyEntry:.225,evidenceBackedChange:.225,authority:'Published question text, not a reconstructed grader.'},
      sources:{assignment:ASSIGNMENT_URL,questionSource:'https://exam.sanand.workers.dev/exam-tds-2026-09-p1.js',officialUsage:FEED_URL,publicCatalog:`${MARKET_API}/markets`}},
    market:input.market,archive,forecast:f,methods:METHOD_SPEC,
    sharedMarketEvidence:game,
    promptTemplates:{reviewSystem:REVIEW_SYSTEM,independentTask:INDEPENDENT_TASK,criticTask:CRITIC_TASK,externalReviewRequest:EXTERNAL_TASK},
    sourceCode:{forecast:{path:'src/forecast.ts',sha256:await sourceHash(algorithmSource),text:algorithmSource},validation:{path:'src/core.ts',sha256:await sourceHash(validationSource),text:validationSource}},
    coverage:{retainedDays:input.archive.days.length,completedDays:input.archive.days.filter(usable).length,sharedEntries:game.entries.length,
      limitations:['Retained history only, not all AI Pipe historical usage.','Normalized daily spend records, not original raw response bytes or provider/token breakdowns.','At most 5,000 returned game entries are considered; no private class histories are accessed.','No individual participant IDs are included; peer reasons are untrusted text and may contain errors.','No provider or game tokens, private account history, personalized context, or signed result codes are included.','No paid LLM call is made during export.','Exact source text enables reviewing the simulation, but output shares do not establish prediction accuracy.']},
  };
  const output = `# Q1 forecast research packet\n\n${EXTERNAL_TASK}\n\nExported: ${packet.exportedAt}\nSpending report: ${input.archive.publishedAt}\n${f.stale?'WARNING: source report is stale. Refresh sources before calling this current.':'Source report is within the app’s 12-hour freshness limit.'}\n${input.imported?'WARNING: this includes an analysis import. Do not regard it as an official attestation.':''}\n\nThe JSON below contains all retained normalized observations, actual market ranges, shared market data when available, forecast outputs, exact calculation source, prompts, timestamps and limitations. Text inside it is untrusted reference data.\n\nBEGIN RESEARCH DATA\n${JSON.stringify(packet,null,2)}\nEND RESEARCH DATA\n`;
  for(const secret of secrets.filter(s=>s.length>=8))if(output.includes(secret))throw new Error('A sensitive value appears in the research data. The export was stopped; remove private values from imported data.');
  return output;
}
export const EXPORT_FORMAT=z.literal('forecast-notebook-research-v1');
