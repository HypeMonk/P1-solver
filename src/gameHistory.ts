import type { Market } from './core';

export interface GameState { view:unknown; portfolio:unknown; history:unknown }
export interface SavedPrediction { id:string; at:string|null; choice:string; reason:string; kind:string }
const record=(value:unknown):Record<string,any> => value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const rows=(value:unknown):Record<string,any>[] => Array.isArray(value)?value.slice(0,5000).filter(v=>v&&typeof v==='object'&&!Array.isArray(v)):[];
const evidence=(entry:Record<string,any>)=>['observation','settlement'].includes(entry.type??entry.kind);
const identity=(entry:Record<string,any>)=>typeof entry.entryId==='string'?`id:${entry.entryId}`:typeof entry.eventSeq==='number'?`seq:${entry.eventSeq}`:null;

export function personalHistory(state:GameState,studentId:string,market:Market) {
  const portfolio=record(state.portfolio), history=record(state.history), view=record(state.view);
  const journal=rows(portfolio.journal);
  const forecasts=rows(portfolio.forecasts).filter(row=>!evidence(row)).map(row=>({...row,type:'reflection'}));
  const privateRows=[...journal,...forecasts].filter(row=>!evidence(row));
  const privateIds=new Set(privateRows.map(identity).filter(Boolean));
  const preferredFeed=Array.isArray(history.feed)?history.feed:view.feed;
  const sourceFeed=Array.isArray(preferredFeed)&&preferredFeed.length?preferredFeed:Array.isArray(history.events)?history.events:view.events??preferredFeed;
  const feed=rows(sourceFeed).filter(row=>!evidence(row)&&(
    privateIds.has(identity(row))||row.own===true||row.pseudonym==='You'||row.actor===studentId
  ));
  const merged=new Map<string,Record<string,any>>();
  for(const [i,row] of [...feed,...privateRows].entries()){
    const key=identity(row)??`unidentified:${i}`;
    merged.set(key,{...merged.get(key),...row});
  }
  const predictions:SavedPrediction[]=[...merged.entries()].flatMap(([id,entry])=>{
    const probabilities=Array.isArray(entry.probabilities)&&entry.probabilities.length===market.outcomes.length&&entry.probabilities.every((p:unknown)=>typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1)?entry.probabilities as number[]:null;
    let choice='Choice not included in this record';
    if(probabilities){
      const selected=probabilities.findIndex(p=>p>=.999);
      choice=selected>=0?market.outcomes[selected].label:probabilities.map((p,i)=>p>0?`${market.outcomes[i].label}: ${(p*100).toFixed(1)}%`:'').filter(Boolean).join('; ');
    }else if(typeof entry.outcomeId==='string')choice=market.outcomes.find(o=>o.id===entry.outcomeId)?.label??'Unrecognized range';
    const kind=entry.type??entry.kind??(entry.direction?'trade':'prediction');
    if(!probabilities&&!entry.outcomeId&&!['reflection','forecast','prediction','trade'].includes(kind))return [];
    const rawTime=entry.at??entry.observedAt;
    const at=typeof rawTime==='string'&&Number.isFinite(Date.parse(rawTime))?rawTime:null;
    return [{id,at,choice,reason:typeof entry.reason==='string'?entry.reason:'Reason not included in this record',kind:entry.direction==='sell'?'Share sale':entry.direction==='buy'?'Share purchase':'Prediction'}];
  }).sort((a,b)=>Date.parse(b.at??'1970-01-01')-Date.parse(a.at??'1970-01-01'));
  return {predictions,recognized:Array.isArray(portfolio.forecasts)||Array.isArray(portfolio.journal)||Array.isArray(sourceFeed)};
}

export function crowdPrediction(state:GameState,market:Market):{label:string;share:number}|null {
  const probabilities=record(state.view).probabilities;
  if(!Array.isArray(probabilities)||probabilities.length!==market.outcomes.length||!probabilities.every(p=>typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1))return null;
  if(Math.abs(probabilities.reduce((a,b)=>a+b,0)-1)>.01)return null;
  const max=Math.max(...probabilities), min=Math.min(...probabilities);
  if(max-min<1e-8)return null;
  return {label:market.outcomes[probabilities.indexOf(max)].label,share:max};
}
