import { ASSIGNMENT_URL, type Market, outcomeLabel, formatMoney } from './core';
import type { Forecast } from './forecast';

interface Props {
  result:Forecast; market:Market; outcome:string; reason:string; busy:boolean; draftStale:boolean; notices:string[]; rulesVerified:boolean; liveFeedChecked:boolean; autoRefresh:boolean;
  onOutcome:(value:string)=>void; onReason:(value:string)=>void; onRefresh:()=>void; onReset:()=>void;
  onCopy:()=>void; onImprove:()=>void; onSaveHere:()=>void; onEvidence:()=>void;
  onResearch:()=>void; exportBusy:boolean;
}
export function PredictionSteps(p:Props){
  const {result,market}=p;
  const label=outcomeLabel(p.outcome||result.recommendation||'',market);
  const ordinaryWarnings=result.warnings.filter(w=>!w.startsWith('History is short')&&!w.startsWith('Too few horizon-matched'));
  return <div className="prediction-steps">
    {!p.rulesVerified&&<p className="notice">Live game rules are not verified, or an analysis file was imported. Saving through this app is disabled. Reload or check the official game before using this draft.</p>}
    {!p.liveFeedChecked&&<p className="notice danger">The live spending source could not be checked. This suggestion uses the saved report shown above. Try Refresh prediction; do not mistake it for newly fetched evidence.</p>}
    {ordinaryWarnings.map((w,i)=><p className="notice" key={i}>{w}</p>)}
    {p.draftStale&&<p className="notice">A new report arrived. Your old draft is still here. <button className="text-button" onClick={p.onReset}>Use the latest suggestion</button> before saving.</p>}
    <section className="action-step">
      <span className="step-number" aria-hidden="true">1</span><div>
        <h2>Get your range</h2>
        <p className="range">{result.recommendation?outcomeLabel(result.recommendation,market):'More data needed'}</p>
        <p>{result.status==='observed'?'All seven completed daily totals are now available. The official result code still comes from the game.':'This is a suggested range for the total bill on 2–8 November. It is an estimate, not a known answer.'}</p>
        <p className="fine"><strong>No AI key is needed for this calculation.</strong> {p.autoRefresh?'New reports are checked every 10 minutes while this page is visible.':'Automatic checking is off; use Refresh prediction.'} New data updates the suggestion. Your edited or AI-written draft is kept until you replace it. Nothing is saved to the game automatically.</p>
        {p.outcome&&p.outcome!==result.recommendation&&<p className="fine"><strong>Your draft still selects {label}.</strong> The live suggestion above is different. Review your reason before deciding whether to replace the draft.</p>}
        <div className="actions"><button className="secondary" onClick={p.onRefresh} disabled={p.busy}>{p.busy?'Refreshing…':'Refresh prediction'}</button><button className="text-button" onClick={p.onReset} disabled={!result.recommendation}>Use the solver’s latest suggestion</button></div>
        <details className="compact-details"><summary>Why this range is not a random choice</summary><p>Four numerical methods use {result.trainingDays} completed daily observations. {result.point!==null?`The simulated weekly median is ${formatMoney(result.point)}.`:''} The same evidence and calculation conditions produce the same result. Simulations are seeded to make uncertainty checks reproducible, not to guarantee the future bill.</p><p className="fine">Report published: {new Date(result.publishedAt).toLocaleString()}. <a href="https://stats.aipipe.org/usage.json" target="_blank" rel="noreferrer">Open the official spending report</a>.</p></details>
        <details className="compact-details"><summary>Choose a different range</summary><label htmlFor="home-outcome">Your range</label><select id="home-outcome" value={p.outcome} onChange={e=>p.onOutcome(e.target.value)}><option value="">Choose a range</option>{market.outcomes.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select><p className="fine">If you change this, edit the reason below to match.</p></details>
      </div>
    </section>
    <section className="action-step">
      <span className="step-number" aria-hidden="true">2</span><div>
        <h2>Read and copy your reason</h2>
        <p>This explains the choice. You can edit it before copying.</p>
        <label className="sr-only" htmlFor="home-reason">Your reason</label><textarea id="home-reason" className="reason" maxLength={1000} value={p.reason} onChange={e=>p.onReason(e.target.value)}/>
        <div className="actions"><button onClick={p.onCopy} disabled={!p.reason}>Copy reason</button><button className="secondary" onClick={p.onImprove}>Improve with AI Pipe (optional)</button></div>
        <p className="fine">The explanation above is free to use. AI help is optional and uses your provider balance.</p>
      </div>
    </section>
    <section className="action-step">
      <span className="step-number" aria-hidden="true">3</span><div>
        <h2>Save it in the game</h2>
        {!result.closed&&Date.now()>=Date.parse(market.trading.opensAt)&&<p><strong>You can predict now. You do not need to wait until 2 November.</strong> Starting earlier matters for marks.</p>}
        <p className="fine">Keep the 1,000 practice credits. No shares are needed for Q1 marks, so an empty shares table is expected when you only save predictions.</p>
        <ol className="steps short-steps"><li>Open your personal Q1 game from the assignment.</li><li>Under <strong>Your prediction</strong>, choose <strong>{result.recommendation?label:'your range'}</strong>.</li><li>Leave <strong>Credits to trade</strong> at <strong>0</strong>.</li><li>Paste the explanation into <strong>Your reason</strong>.</li><li>Click <strong>Save prediction</strong>. Ignore <strong>Review trade</strong>.</li></ol>
        <p>Check <strong>My answers</strong> for your range and reason. “Latest facts” rows alone do not show that you saved a prediction.</p>
        <div className="actions"><a className="button" href={ASSIGNMENT_URL} target="_blank" rel="noreferrer">Open Q1 from the assignment</a></div>
        <details className="compact-details"><summary>Can I save without copying into the game?</summary><p>Yes. Connect your game account in <strong>Save to game</strong>, review the draft, and confirm the save. This shortcut is optional and uses the game entry token, not your AI Pipe token.</p><button className="secondary" onClick={p.onSaveHere}>Connect and save from here</button></details>
      </div>
    </section>
    <p className="simple-note"><strong>After saving:</strong> come back when new reports arrive. Revise only when the new evidence changes your view. After settlement, submit your personal result code in the assignment.</p>
    <section className="export-section"><h3>Prefer to ask your own AI?</h3><p>Download one file with the latest available reports, forecast logic, calculation source, prompts, and shared game predictions when connected. Upload it to your own LLM and ask it to review the forecast.</p><button className="secondary" onClick={p.onResearch} disabled={p.exportBusy}>{p.exportBusy?'Refreshing and preparing…':'Download everything for my own AI'}</button><p className="fine">No API key is needed. The file records refresh failures and missing class data. No private history, account IDs, or credentials are exported. Download again for a newer snapshot.</p></section>
    <details className="technical-details"><summary>How was this estimated? (Optional details)</summary>
      <p>We compare four calculation methods. {result.scenarios.every(s=>s.folds>=3)&&result.scenarios.length?'Methods that performed better on past weekly tests have more influence.':'There is too little past data to prove which method is most reliable, so the methods are treated equally. This is not an error.'}</p>
      {result.warnings.filter(w=>w.startsWith('History is short')||w.startsWith('Too few horizon-matched')).map((w,i)=><p className="fine" key={i}>{w}</p>)}
      <p><strong>Observed target-week cost:</strong> {formatMoney(result.knownTotal,4)} from {result.completed} completed days. Unreported days are not counted as zero.</p>
      {result.low!==null&&result.high!==null&&<p><strong>Most simulated totals:</strong> {formatMoney(result.low)}–{formatMoney(result.high)}. This is not a proven probability range.</p>}
      <div className="table-wrap"><table><thead><tr><th>Method</th><th>Estimated week</th><th>Past weekly tests</th></tr></thead><tbody>{result.scenarios.map(s=><tr key={s.method}><th>{s.method}</th><td>{formatMoney(s.total)}</td><td>{s.folds?`${s.folds} tests`:'Not enough history'}</td></tr>)}</tbody></table></div>
      {p.notices.map((n,i)=><p className="fine" key={i}>{n}</p>)}
      <button className="text-button" onClick={p.onEvidence}>Open advanced data</button>
    </details>
  </div>;
}
