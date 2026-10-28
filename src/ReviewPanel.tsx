import { useState } from 'react';
import type { Forecast } from './forecast';
import { type Market, outcomeLabel } from './core';
import { type LlmSettings,type ReviewPair,type Provider,type AiPipeAccount,type ProviderModel,settingsFor,providerUrl,loadAiPipeModels,checkAiPipeAccount,AIPIPE_DEFAULT_MODEL,AIPIPE_FALLBACK_MODEL } from './llm';

interface Props {
  settings:LlmSettings;result:Forecast;market:Market;context:string;consent:boolean;busy:boolean;review:ReviewPair|null;
  onSettings:(patch:Partial<LlmSettings>)=>void;onContext:(value:string)=>void;onConsent:(value:boolean)=>void;
  onRun:()=>void;onCancel:()=>void;onApply:()=>void;onBack:()=>void;
}
export function ReviewPanel(p:Props){
  const [models,setModels]=useState<ProviderModel[]>([]);
  const [account,setAccount]=useState<AiPipeAccount|null>(null);
  const [checking,setChecking]=useState(false);
  const [checkError,setCheckError]=useState('');
  function clearCheck(){setModels([]);setAccount(null);setCheckError('');}
  async function check(){
    setChecking(true);setCheckError('');setModels([]);setAccount(null);
    try{
      const info=await checkAiPipeAccount(p.settings.key);setAccount(info);
      const list=await loadAiPipeModels(p.settings.key,p.settings.aipipeRoute??'openai');setModels(list);
      if(!list.some(m=>m.id===p.settings.model)){
        const preferred=[AIPIPE_DEFAULT_MODEL,AIPIPE_FALLBACK_MODEL,'gpt-4.1-mini','gpt-4.1-nano'];
        const choice=preferred.find(id=>list.some(m=>m.id===id));
        if(choice)p.onSettings({model:choice});
        else setCheckError('The preset model is not listed for this route. Select a model below. No review has been sent.');
      }
    }catch(e){setCheckError(e instanceof Error?e.message:'Could not check AI Pipe.');}
    finally{setChecking(false);}
  }
  const locked=p.busy||checking;
  const backup=p.settings.provider==='aipipe'&&p.settings.aipipeRoute!=='openrouter'&&p.settings.fallback;
  let host='your chosen provider';try{host=new URL(providerUrl(p.settings)).host;}catch{}
  return <section className="section review-simple">
    <p className="eyebrow">Optional · Review the prediction and personalize the reason</p>
    <h2>Get a reason you understand.</h2>
    <p>AI checks the spending evidence and our forecast, then drafts a reason using your own perspective. You review the result before using it. The free numerical forecast keeps working without AI.</p>
    <div className="panel form">
      <label htmlFor="provider">1. Choose your AI provider</label>
      <select id="provider" disabled={locked} value={p.settings.provider} onChange={e=>{p.onSettings(settingsFor(e.target.value as Provider));clearCheck();}}><option value="aipipe">AI Pipe · student API token</option><option value="compatible">OpenAI-compatible provider</option><option value="anthropic">Anthropic · Claude</option></select>
      <label htmlFor="api-key">{p.settings.provider==='aipipe'?'2. AI Pipe API token':'2. Provider API key'}</label>
      <input id="api-key" type="password" autoComplete="off" spellCheck={false} value={p.settings.key} disabled={locked} onChange={e=>{p.onSettings({key:e.target.value});clearCheck();}}/>
      {p.settings.provider==='aipipe'&&<>
        <p className="fine">Get it from <a href="https://aipipe.org/login" target="_blank" rel="noreferrer">AI Pipe login</a>. Use the API token, not your 20-minute game entry token.</p>
        <button className="secondary" disabled={!p.settings.key||locked} onClick={()=>void check()}>{checking?'Checking account and models…':'Check token and load models'}</button>
        {account&&<aside className="guide-note good" role="status"><strong>Account returned by AI Pipe: {account.email}</strong><p>{account.remaining===null?'Remaining allowance was not provided.':`Remaining reported allowance: $${account.remaining.toFixed(4)}.`} This check generates no AI text. A listed model can still become unavailable when you use it.</p></aside>}
        {checkError&&<p className="notice danger" role="alert">{checkError}</p>}
        {models.length>0&&<><label htmlFor="available-model">Models returned for this AI Pipe route</label><select id="available-model" value={models.some(m=>m.id===p.settings.model)?p.settings.model:''} onChange={e=>p.onSettings({model:e.target.value})} disabled={locked}><option value="" disabled>Select a model</option>{models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></>}
        <p className="fine">Selected: <strong>{p.settings.model}</strong> · {p.settings.aipipeRoute==='openrouter'?'OpenRouter':'OpenAI'} route. The OpenAI preset follows the old GA3 solver. Availability is checked again before a paid review.</p>
        <details className="compact-details"><summary>Advanced model settings</summary>
          <label htmlFor="aipipe-route">AI Pipe route</label><select id="aipipe-route" value={p.settings.aipipeRoute??'openai'} disabled={locked} onChange={e=>{p.onSettings({aipipeRoute:e.target.value as 'openai'|'openrouter',model:e.target.value==='openai'?AIPIPE_DEFAULT_MODEL:'openai/gpt-4.1-nano',fallback:false});clearCheck();}}><option value="openai">OpenAI · plain IDs such as gpt-5.6-terra</option><option value="openrouter">OpenRouter · vendor/model IDs</option></select>
          <label htmlFor="model">Model ID</label><input id="model" value={p.settings.model} disabled={locked} onChange={e=>p.onSettings({model:e.target.value})}/>
          {p.settings.aipipeRoute!=='openrouter'&&<label className="check"><input id="aipipe-fallback" type="checkbox" checked={p.settings.fallback} disabled={locked} onChange={e=>p.onSettings({fallback:e.target.checked})}/>Allow one backup attempt per pass using {AIPIPE_FALLBACK_MODEL}, only if listed. Up to four paid requests instead of two.</label>}
          <p className="fine">The OpenAI list comes through AI Pipe with your token. The optional OpenRouter route reads a public catalog, which does not prove every model is enabled for your account.</p>
        </details>
      </>}
      {p.settings.provider==='compatible'&&<><label htmlFor="endpoint">Provider base URL</label><input id="endpoint" type="url" placeholder="https://your-provider.example/v1" value={p.settings.endpoint} disabled={locked} onChange={e=>p.onSettings({endpoint:e.target.value})}/><label htmlFor="model">Model ID</label><input id="model" value={p.settings.model} disabled={locked} onChange={e=>p.onSettings({model:e.target.value})}/><p className="fine">Use a provider that supports browser requests and chat completions. No public credential proxy is used.</p></>}
      {p.settings.provider==='anthropic'&&<details className="compact-details"><summary>Choose another model (optional)</summary><label htmlFor="model">Model ID</label><input id="model" value={p.settings.model} disabled={locked} onChange={e=>p.onSettings({model:e.target.value})}/><label className="check"><input id="fallback" type="checkbox" checked={p.settings.fallback} disabled={locked} onChange={e=>p.onSettings({fallback:e.target.checked})}/>Allow the provider’s default fallback if the model declines</label></details>}
      <label htmlFor="context">3. Your perspective (optional)</label><textarea id="context" maxLength={1500} placeholder="For example: I am worried usage might rise near a course deadline. Please check that assumption against the evidence." value={p.context} disabled={p.busy} onChange={e=>p.onContext(e.target.value)}/>
      <p className="fine">Add a real concern or observation to make the reason personal. Do not enter private information or tokens here.</p>
      <label className="check consent"><input id="llm-consent" type="checkbox" checked={p.consent} disabled={locked} onChange={e=>p.onConsent(e.target.checked)}/>I approve {backup?'up to four':'two'} paid AI requests to {host} using my provider balance. My public evidence and perspective will be sent there.</label>
      <div className="actions"><button onClick={p.onRun} disabled={!p.consent||!p.settings.key||!p.settings.model||locked||p.result.stale||!p.result.recommendation}>{p.busy?'Reviewing prediction…':'Review prediction and improve reason'}</button>{p.busy?<button className="secondary" onClick={p.onCancel}>Cancel</button>:<button className="secondary" onClick={()=>{p.onSettings({key:''});clearCheck();}}>Clear token / key</button>}</div>
      {p.result.stale&&<p className="notice danger">Refresh the spending report before using your balance.</p>}
      <p className="fine">Credentials stay in page memory. No paid retries unless the backup option is enabled. Canceling does not guarantee that a provider stops billing an already-started request.</p>
    </div>
    {p.review&&<section className="review-results"><h3>Your AI-assisted draft</h3><article className="panel"><p className="eyebrow">Suggested range</p><h4>{outcomeLabel(p.review.critic.suggestedOutcome,p.market)}</h4><p>{p.review.critic.explanation}</p><p><strong>When to reconsider:</strong> {p.review.critic.changeTrigger}</p>{p.review.critic.concerns.length>0&&<details><summary>Review concerns</summary><ul>{p.review.critic.concerns.map((c,i)=><li key={i}>{c}</li>)}</ul></details>}</article>
      {p.review.evidenceId!==p.result.evidenceId?<p className="notice danger">A new report arrived. Review the new evidence before applying this draft.</p>:<button onClick={p.onApply}>Use this draft</button>}
      <p className="fine">This only updates your editable draft. It does not save to the game.</p>
      <details><summary>Both opinions and actual model usage</summary><p className="fine">Models: {(p.review.modelsUsed??[p.review.model]).join(', ')} · {p.review.attempts??2} attempts · {p.review.usage.input.toLocaleString()} input / {p.review.usage.output.toLocaleString()} output tokens reported</p><h4>Independent opinion</h4><p>{p.review.independent.explanation}</p><h4>Critical review</h4><p>{p.review.critic.verdict}: {p.review.critic.explanation}</p></details>
    </section>}
    <div className="actions"><button className="text-button" onClick={p.onBack}>Use the free explanation instead</button></div>
    <p className="fine">An AI review is a second opinion, not verification of future spending. The first pass forecasts independently; the second checks the solver and that opinion. Output checks reject invalid ranges and unavailable evidence dates.</p>
  </section>;
}
