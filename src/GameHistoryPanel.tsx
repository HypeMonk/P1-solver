import { useState } from 'react';
import type { Market } from './core';
import { type GameState,personalHistory,crowdPrediction } from './gameHistory';

export function GameHistoryPanel({state,studentId,market,busy,onRefresh}:{state:GameState;studentId:string;market:Market;busy:boolean;onRefresh:()=>void}){
  const [limit,setLimit]=useState(20);
  const {predictions,recognized}=personalHistory(state,studentId,market);
  const crowd=crowdPrediction(state,market);
  return <section className="section saved-history">
    <div className="section-heading"><div><h3>Your saved predictions</h3><p className="fine">Read from the official game for the connected student. Source-report updates are hidden.</p></div><button className="secondary" disabled={busy} onClick={onRefresh}>{busy?'Loading…':'Refresh my history'}</button></div>
    {predictions.length?<div className="table-wrap"><table><thead><tr><th>Saved at</th><th>Your range</th><th>Your reason</th></tr></thead><tbody>{predictions.slice(0,limit).map(p=><tr key={p.id}><td>{p.at?new Date(p.at).toLocaleString():'Time not provided'}<small>{p.kind}</small></td><th>{p.choice}</th><td>{p.reason}</td></tr>)}</tbody></table></div>:<p>{recognized?'No personal predictions were found in the returned records. If you just saved one, refresh this history or check My answers in the official game.':'The response did not include a recognized personal-history list. Check My answers in the official game; this does not prove you have never saved a prediction.'}</p>}
    {predictions.length>limit&&<button className="secondary" onClick={()=>setLimit(n=>n+20)}>Show more saved predictions</button>}
    {crowd&&<details><summary>What does the group currently favor?</summary><p>The game currently favors <strong>{crowd.label}</strong> at a displayed market weight of {(crowd.share*100).toFixed(0)}%. This is based on market prices; it is not the percentage of students who chose that range or proof that it will win.</p><p>Our solver uses spending reports instead. Either forecast can be wrong. Your token only opens your own private history and whatever the game makes visible to your account.</p></details>}
    <p className="fine">Viewing or refreshing history does not save a prediction or spend credits.</p>
  </section>;
}
