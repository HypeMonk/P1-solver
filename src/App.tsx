import { useEffect, useRef, useState } from 'react';
import { type Archive, type Market, ASSIGNMENT_URL, FEED_URL, MARKET_ID, outcomeLabel, formatMoney, validateArchive, validateMarket, mergeArchives, validateReason, fingerprint } from './core';
import { forecast, type Forecast } from './forecast';
import { loadData, MarketClient } from './network';
import { type LlmSettings, type ReviewPair, reviewForecast, settingsFor } from './llm';
import { Guide } from './Guide';
import { PredictionSteps } from './PredictionSteps';
import { ReviewPanel } from './ReviewPanel';
import { type GameState } from './gameHistory';
import { GameHistoryPanel } from './GameHistoryPanel';
import { buildResearchPacket } from './researchPacket';

const tabs=['Forecast','Evidence','AI review','My account','Simple guide'] as const;
type Tab=typeof tabs[number];
const tabLabels:Record<Tab,string>={Forecast:'My prediction',Evidence:'Advanced data','AI review':'Improve reason','My account':'Save to game','Simple guide':'How to play'};
const primaryTabs:Tab[]=['Forecast','AI review','My account','Simple guide'];
const tabIds=['forecast','evidence','ai-review','my-account','simple-guide'];
const initialTab=()=>tabs[Math.max(0,tabIds.indexOf(location.hash.slice(1)))];
const message=(e:unknown)=>e instanceof Error?e.message:'Something went wrong. Try again.';

export default function App(){
  const [tab,setTab]=useState<Tab>(initialTab);
  const [archive,setArchive]=useState<Archive|null>(null);
  const [market,setMarket]=useState<Market|null>(null);
  const [result,setResult]=useState<Forecast|null>(null);
  const [notices,setNotices]=useState<string[]>([]);
  const [configLive,setConfigLive]=useState(false);
  const [liveFeedChecked,setLiveFeedChecked]=useState(true);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('Loading the published evidence…');
  const [error,setError]=useState('');
  const [watch,setWatch]=useState(true);
  const [theme,setTheme]=useState('system');
  const archiveRef=useRef<Archive|null>(null);
  const loading=useRef(false);
  const importedData=useRef(false);
  const [outcome,setOutcome]=useState('');
  const [reason,setReason]=useState('');
  const [draftEvidence,setDraftEvidence]=useState('');
  const draftRef=useRef('');
  const draftMode=useRef<'solver'|'edited'|'ai'>('solver');
  const [entry,setEntry]=useState('');
  const [student,setStudent]=useState('');
  const [accountBusy,setAccountBusy]=useState(false);
  const [history,setHistory]=useState<GameState|null>(null);
  const [historyFetchedAt,setHistoryFetchedAt]=useState<string|null>(null);
  const [exportBusy,setExportBusy]=useState(false);
  const [receipt,setReceipt]=useState('');
  const [confirmation,setConfirmation]=useState(false);
  const [lastSaved,setLastSaved]=useState('');
  const client=useRef(new MarketClient());
  const [settings,setSettings]=useState<LlmSettings>(()=>settingsFor('aipipe'));
  const [context,setContext]=useState('');
  const [consent,setConsent]=useState(false);
  const [reviewBusy,setReviewBusy]=useState(false);
  const [review,setReview]=useState<ReviewPair|null>(null);
  const reviewAbort=useRef<AbortController|null>(null);

  function navigate(next:Tab){setTab(next);location.hash=tabIds[tabs.indexOf(next)];setConfirmation(false);}
  function draft(f:Forecast){ if(f.recommendation){draftMode.current='solver';setOutcome(f.recommendation);setReason(f.reason);setDraftEvidence(f.evidenceId);draftRef.current=f.evidenceId;setConfirmation(false);} }
  function editOutcome(value:string){draftMode.current='edited';setOutcome(value);setConfirmation(false);}
  function editReason(value:string){draftMode.current='edited';setReason(value);setConfirmation(false);}
  function applyData(a:Archive,m:Market){
    const f=forecast(a,m);archiveRef.current=a;setArchive(a);setMarket(m);setResult(f);
    if(!draftRef.current||(draftMode.current==='solver'&&f.evidenceId!==draftRef.current))draft(f);
    return f;
  }
  async function refresh(forceRefresh=false){
    if(loading.current)return;loading.current=true;setBusy(true);setError('');
    try{
      const data=await loadData(archiveRef.current,forceRefresh);
      applyData(data.archive,data.market);setNotices(data.notices);setConfigLive(data.configLive&&!importedData.current);setLiveFeedChecked(data.liveFeedChecked);
      setStatus(`${data.liveFeedChecked?'Source checked':'Live source unavailable; using saved evidence'} at ${new Date().toLocaleTimeString()}. Report published: ${new Date(data.archive.publishedAt).toLocaleString()}.`);
      return data;
    }catch(e){setError(message(e));setStatus('Could not refresh. Any visible results retain their original report timestamp.');setConfigLive(false);setLiveFeedChecked(false);}
    finally{loading.current=false;setBusy(false);}
  }
  useEffect(()=>{void refresh();const change=()=>setTab(initialTab());window.addEventListener('hashchange',change);return()=>{window.removeEventListener('hashchange',change);reviewAbort.current?.abort();};},[]);
  useEffect(()=>{
    if(!watch)return;
    const id=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},10*60_000);
    const visible=()=>{if(document.visibilityState==='visible')void refresh();};
    document.addEventListener('visibilitychange',visible);
    return()=>{clearInterval(id);document.removeEventListener('visibilitychange',visible);};
  },[watch]);
  useEffect(()=>{const id=setInterval(()=>{if(archiveRef.current&&market)setResult(forecast(archiveRef.current,market));},60_000);return()=>clearInterval(id);},[market]);
  function changeSettings(patch:Partial<LlmSettings>){setSettings(s=>({...s,...patch}));setConsent(false);}
  async function copy(text:string){try{await navigator.clipboard.writeText(text);setStatus('Copied.');}catch{setError('Clipboard access was blocked. Select and copy the text manually.');}}
  async function connect(){
    setAccountBusy(true);setError('');setConfirmation(false);setStudent('');setHistory(null);setHistoryFetchedAt(null);setReceipt('');setLastSaved('');
    try{const id=await client.current.connect(entry);setEntry('');setStudent(id);const state=await client.current.state();setHistory(state);setHistoryFetchedAt(new Date().toISOString());setStatus(`Connected as ${id}. Check this identity before saving.`);}
    catch(e){client.current.disconnect();setStudent('');setError(message(e));}
    finally{setAccountBusy(false);}
  }
  async function refreshHistory(){
    setAccountBusy(true);setError('');
    try{const state=await client.current.state();setHistory(state);setHistoryFetchedAt(new Date().toISOString());setStatus('Your saved predictions were refreshed from the game. Nothing was submitted.');}
    catch(e){setError(message(e));if(!client.current.studentId){setStudent('');setHistory(null);setHistoryFetchedAt(null);}}
    finally{setAccountBusy(false);}
  }
  function disconnect(){client.current.disconnect();setStudent('');setEntry('');setHistory(null);setHistoryFetchedAt(null);setReceipt('');setConfirmation(false);setLastSaved('');setStatus('Course session cleared from this page. Saved market predictions remain on the official service.');}
  const draftStale=!!result&&draftEvidence!==result.evidenceId;
  const encoded=JSON.stringify({outcome,reason,evidence:draftEvidence});
  const canSave=!!(student&&result&&market&&outcome&&!result.stale&&!result.closed&&configLive&&!draftStale&&!accountBusy&&!exportBusy&&lastSaved!==encoded);
  async function save(){
    if(!canSave||!market||!archive)return;
    setAccountBusy(true);setError('');
    try{
      validateReason(reason);
      const fresh=forecast(archive,market);
      if(fresh.stale||fresh.closed||fresh.evidenceId!==draftEvidence)throw new Error('The evidence or deadline changed. Refresh and review again.');
      const state=await client.current.state();
      if(state.view.settled)throw new Error('The market is already settled.');
      if(JSON.stringify(validateMarket(state.view.config))!==JSON.stringify(market))throw new Error('Market rules changed. Refresh the forecast before saving.');
      await client.current.save(market,outcome,reason);
      setLastSaved(encoded);setConfirmation(false);
      setStatus('The official market accepted your zero-credit prediction.');
      try{const updated=await client.current.state();setHistory(updated);setHistoryFetchedAt(new Date().toISOString());setStatus('The official market accepted your prediction and account history was refreshed. Inspect your history below.');}
      catch{setError('The save was accepted, but history could not be refreshed. Check My answers on the official market before retrying.');}
    }catch(e){setError(message(e));if(!client.current.studentId)setStudent('');}
    finally{setAccountBusy(false);}
  }
  async function getReceipt(){setAccountBusy(true);setError('');try{const r=await client.current.receipt();setReceipt(r.token);setStatus('Official result code retrieved. Paste it into Q1, then Check and Save.');}catch(e){setError(message(e));if(!client.current.studentId)setStudent('');}finally{setAccountBusy(false);}}
  async function runReview(){
    if(!consent||!result||!archive||!market)return;
    setReviewBusy(true);setReview(null);setError('');reviewAbort.current=new AbortController();
    const timeout=setTimeout(()=>reviewAbort.current?.abort(),360_000);
    try{const r=await reviewForecast(settings,result,archive,market,context,setStatus,reviewAbort.current.signal);setReview(r);setStatus('Two review perspectives are ready. Neither is proof of future accuracy.');}
    catch(e){setError(message(e));}
    finally{clearTimeout(timeout);setReviewBusy(false);setConsent(false);}
  }
  function useAiDraft(){
    if(!review||!result||review.evidenceId!==result.evidenceId)return;
    draftMode.current='ai';
    setOutcome(review.critic.suggestedOutcome);setReason(review.critic.explanation);setDraftEvidence(result.evidenceId);draftRef.current=result.evidenceId;setConfirmation(false);navigate('Forecast');
  }
  async function importArchive(file?:File){
    if(!file)return;setError('');
    try{if(file.size>5_000_000)throw new Error('Choose an archive under 5 MB.');const raw=JSON.parse(await file.text());const a=validateArchive(raw.archive??raw);if(!market)throw new Error('Load the market configuration first.');importedData.current=true;applyData(mergeArchives(archiveRef.current,a),market);setStatus('Archive imported for this tab. Imported data is not an official attestation; check its provenance.');setConfigLive(false);setNotices(n=>[...n,'Imported data disables submission until a clean reload. Imports are for analysis only.']);}
    catch(e){setError(message(e));}
  }
  function exportEvidence(){
    if(!archive||!result||!market)return;
    const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),archive,market,forecast:result},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='forecast-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function downloadResearch(){
    if(exportBusy||busy||accountBusy||!archive||!market)return;
    setExportBusy(true);setError('');
    const owner=client.current.studentId;
    try{
      const current=await refresh(true);
      const a=current?.archive??archiveRef.current??archive,m=current?.market??market;
      const notes=[...(current?.notices??notices),...(!current?['Public-data refresh failed; this download uses previously available evidence.']:[])];
      let game:GameState|null=null,gameFetchedAt:string|null=null;
      if(owner){
        try{const state=await client.current.state();if(client.current.studentId===owner){game=state;gameFetchedAt=new Date().toISOString();setHistory(state);setHistoryFetchedAt(gameFetchedAt);}}
        catch{notes.push('Game refresh failed. No cached class predictions are included.');if(!client.current.studentId){setStudent('');setHistory(null);setHistoryFetchedAt(null);}}
      }
      const text=await buildResearchPacket({archive:a,market:m,game,gameFetchedAt,studentId:owner,rulesLive:!!current?.configLive&&!importedData.current,liveFeedChecked:current?.liveFeedChecked??false,notices:notes,imported:importedData.current,secrets:[settings.key,entry,owner]});
      const blob=new Blob([text],{type:'text/plain;charset=utf-8'});
      const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='q1-llm-research.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setStatus(`Research file downloaded with report ${a.publishedAt}. ${game?'Returned public class fields included; private history excluded.':'Class predictions unavailable; this is marked in the file.'}`);
    }catch(e){setError(message(e));}
    finally{setExportBusy(false);}
  }
  return <>
    <header className="header"><div className="shell header-inner"><a className="brand" href="#forecast" onClick={()=>navigate('Forecast')}><span className="brand-mark" aria-hidden="true">fn</span><span>Forecast Notebook<small>Q1 · November 2026</small></span></a><label className="theme">Appearance<select id="theme" value={theme} onChange={e=>{setTheme(e.target.value);if(e.target.value==='system')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=e.target.value;}}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div></header>
    <main className="shell">
      <div className="intro simple-intro"><div><p className="eyebrow">Q1 · Predict AI Pipe’s bill for 2–8 November</p><h1>Your prediction, step by step.</h1><p>Get a range. Copy a reason. Save it in the game with zero credits.</p></div><button className="secondary" onClick={()=>navigate('Simple guide')}>What is this game?</button></div>
      <nav className="tabs" aria-label="Workspace sections">{primaryTabs.map(t=><button key={t} aria-current={tab===t?'page':undefined} onClick={()=>navigate(t)}>{tabLabels[t]}</button>)}</nav>
      <div className="status-line" role="status" aria-live="polite">{busy?<span className="dot pulse"/>:<span className="dot"/>}<span>{status}</span></div>
      {error&&<div className="notice danger" role="alert">{error}<button className="text-button" onClick={()=>setError('')}>Dismiss</button></div>}
      {tab==='Simple guide'?<Guide/>:!result||!market||!archive?<section className="panel empty"><h2>{busy?'Opening the evidence notebook…':'No evidence loaded'}</h2><p>The guide remains available while data loads. We never invent a forecast to fill this space.</p><div className="actions"><button onClick={()=>void refresh()} disabled={busy}>Try refresh</button><button className="secondary" onClick={()=>navigate('Simple guide')}>Read the guide</button></div></section>:<>
        {tab==='Forecast'&&<PredictionSteps onResearch={()=>void downloadResearch()} exportBusy={exportBusy||busy||accountBusy} result={result} market={market} outcome={outcome} reason={reason} busy={busy} draftStale={draftStale} notices={notices} rulesVerified={configLive} liveFeedChecked={liveFeedChecked} autoRefresh={watch} onOutcome={editOutcome} onReason={editReason} onRefresh={()=>void refresh(true)} onReset={()=>draft(result)} onCopy={()=>void copy(reason)} onImprove={()=>navigate('AI review')} onSaveHere={()=>navigate('My account')} onEvidence={()=>navigate('Evidence')}/>}
        {tab==='Evidence'&&<section className="section"><p className="eyebrow">Public source record · {result.evidenceId}</p><h2>Follow every number back to a day.</h2><p><strong>You do not need to import a file.</strong> The solver gets these reports automatically. This page is only for checking the numbers in more detail.</p><p className="fine">Report published <strong>{new Date(archive.publishedAt).toLocaleString()}</strong>. Unfinished and unavailable days are excluded from completed totals.</p><div className="actions"><button onClick={()=>void downloadResearch()} disabled={exportBusy||busy||accountBusy}>{exportBusy?'Refreshing and preparing…':'Download everything for my own AI'}</button><button className="secondary" onClick={exportEvidence}>Download archive JSON</button></div><details><summary>Import a previously downloaded evidence file (advanced)</summary><p>Choose <strong>forecast-evidence.json</strong> that you previously downloaded from this solver. Do not select a token, screenshot, or assignment file. Imports are for analysis only and disable saving until you reload.</p><label className="file-button">Choose your saved evidence file<input id="archive-import" type="file" accept="application/json,.json" onChange={e=>void importArchive(e.target.files?.[0])}/></label></details><div className="table-wrap"><table><thead><tr><th>UTC date</th><th>Spending in USD</th><th>Report status</th><th>Provenance</th></tr></thead><tbody>{[...archive.days].reverse().map(d=><tr key={d.date}><th>{d.date}</th><td>{d.spend??'Unknown'}</td><td>{!d.available?'Unavailable':d.complete?'Completed':'In progress · excluded'}</td><td>{d.source.startsWith('https://github.com/sarangkrish27/')?'Third-party archive of official responses':d.source===FEED_URL?'Official feed':'Unverified / imported source'}</td></tr>)}</tbody></table></div><h3>Range sensitivity</h3><p>These percentages are shares of 6,000 reproducible scenarios, <strong>not measured chances of being correct</strong>. They depend on the chosen methods and stress assumptions.</p><div className="table-wrap"><table><thead><tr><th>Range</th><th>Scenario share</th></tr></thead><tbody>{result.rangeShares.filter(r=>r.share>0).map(r=><tr key={r.id}><th>{outcomeLabel(r.id,market)}</th><td>{(r.share*100).toFixed(1)}%</td></tr>)}</tbody></table></div><h3>Target week</h3><div className="table-wrap"><table><thead><tr><th>UTC date</th><th>Observed total</th><th>Model estimate if unknown</th></tr></thead><tbody>{result.daily.map(d=><tr key={d.date}><th>{d.date}</th><td>{d.observed===null?'Not available':`$${d.observed}`}</td><td>{d.estimated===null?'—':formatMoney(d.estimated)}</td></tr>)}</tbody></table></div><details><summary>Provenance links and completed-day revisions</summary><ul>{archive.sources.map(s=><li key={s}><a href={s} target="_blank" rel="noreferrer">{s}</a></li>)}</ul><pre>{JSON.stringify(archive.revisions,null,2)}</pre></details></section>}
        {tab==='AI review'&&<ReviewPanel settings={settings} result={result} market={market} context={context} consent={consent} busy={reviewBusy} review={review} onSettings={changeSettings} onContext={value=>{setContext(value);setConsent(false);}} onConsent={setConsent} onRun={()=>void runReview()} onCancel={()=>reviewAbort.current?.abort()} onApply={useAiDraft} onBack={()=>navigate('Forecast')}/>}
        {tab==='My account'&&<section className="section"><p className="eyebrow">Your own account · Forecast-only actions</p><h2>Save to your real game account.</h2><p>This optional shortcut saves your prediction without copying it into the game. It does not create a new account. Connect with the <strong>game entry token</strong>, check the account name, then confirm the save. <strong>Your AI Pipe token does not go here.</strong></p><p className="fine">Prefer to do it manually? Copy your reason from My prediction, paste it into the game, leave credits at zero, and press Save prediction.</p><div className="two-column"><div className="panel form"><h3>{student?'Connected course account':'Connect your course account'}</h3>{student?<><p className="identity">{student}</p><p className="fine">Verify that this is your account. Tokens remain in memory and are cleared on reload. Session lifetime is controlled by the market.</p><button className="secondary" disabled={accountBusy||exportBusy} onClick={disconnect}>Disconnect and clear session</button></>:<><label htmlFor="launch-token">Fresh entry token or personal launch link</label><input id="launch-token" type="password" autoComplete="off" spellCheck={false} value={entry} onChange={e=>setEntry(e.target.value)}/><p className="fine">Get this from your own Q1 assignment. The entry token expires after about 20 minutes; we exchange it directly with the official market.</p><button disabled={!entry||accountBusy||exportBusy} onClick={()=>void connect()}>{accountBusy?'Connecting…':'Connect account'}</button></>}<a href={ASSIGNMENT_URL} target="_blank" rel="noreferrer">Open the assignment to get a fresh entry token</a></div><div className="panel form"><h3>Your prediction draft</h3><label htmlFor="outcome">Selected range</label><select id="outcome" value={outcome} disabled={accountBusy||exportBusy} onChange={e=>editOutcome(e.target.value)}><option value="">Choose a range</option>{market.outcomes.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select><label htmlFor="reason">Your explanation</label><textarea id="reason" className="reason" maxLength={1000} value={reason} disabled={accountBusy||exportBusy} onChange={e=>editReason(e.target.value)}/><p className="fine">{reason.length}/1,000 characters · at least three words · saved privately</p><div className="actions"><button className="secondary" onClick={()=>draft(result)} disabled={!result.recommendation||accountBusy}>Use latest factual draft</button><button className="secondary" onClick={()=>void copy(reason)} disabled={!reason}>Copy explanation</button></div>{draftStale&&<p className="notice">The source evidence changed. Use the latest factual draft, or get a new AI review, before saving.</p>}{result.stale&&<p className="notice">Source report is stale. Refresh before saving.</p>}{result.closed&&<p className="notice">The scoring deadline has passed. Retrieve your result after settlement instead.</p>}{!configLive&&<p className="notice">Live market rules must be verified before a prediction can be sent.</p>}<button disabled={!canSave} onClick={()=>{try{validateReason(reason);setConfirmation(true);setError('');}catch(e){setError(message(e));}}}>Review zero-credit save</button>{lastSaved===encoded&&<p className="success">This exact draft has already been accepted in this session. Repeating it does not improve your marks.</p>}{confirmation&&<div className="confirmation"><strong>Confirm this real account action</strong><p>Save <strong>{outcomeLabel(outcome,market)}</strong> for <strong>{student}</strong> with the explanation above. No trade; zero credits; private choice and explanation.</p><div className="actions"><button onClick={()=>void save()} disabled={!canSave}>{accountBusy?'Saving…':'Confirm and save prediction'}</button><button className="secondary" onClick={()=>setConfirmation(false)}>Cancel</button></div></div>}</div></div>
        {history!==null&&student&&<GameHistoryPanel state={history} studentId={student} market={market} busy={accountBusy||exportBusy} onRefresh={()=>void refreshHistory()}/>}
        <section className="section"><h3>After the game: your result code</h3><p>After official settlement, retrieve your personal signed result code. Paste it into the assignment’s Q1 answer box, then press Check and Save.</p><button className="secondary" onClick={()=>void getReceipt()} disabled={!student||accountBusy}>Retrieve official result code</button>{receipt&&<><label htmlFor="receipt">Your signed result code</label><textarea id="receipt" readOnly value={receipt}/><button onClick={()=>void copy(receipt)}>Copy result code</button></>}</section></section>}
      </>}
      <footer><p>Forecast Notebook · Independent student tool, not an official course service.</p><p>The game decides your marks. This tool helps you prepare and save a prediction.</p><div className="actions"><a href={ASSIGNMENT_URL} target="_blank" rel="noreferrer">Official assignment</a><button className="text-button" onClick={()=>navigate('Simple guide')}>Guide and help</button><button className="text-button" onClick={()=>navigate('Evidence')}>Advanced data</button></div><details><summary>Update settings</summary><label className="check"><input id="watch" type="checkbox" checked={watch} onChange={e=>setWatch(e.target.checked)}/>Check for new reports every 10 minutes while this page is visible</label><p className="fine">No account submissions happen automatically.</p></details></footer>
    </main>
  </>;
}
