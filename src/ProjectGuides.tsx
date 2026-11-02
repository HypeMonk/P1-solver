import { useEffect,useRef,useState } from 'react';
import { ASSIGNMENT_URL } from './core';
import { EXAMPLE_OFFER,P1_RULES_CHECKED,P1_SOURCE,PROJECT_QUESTIONS,STATUS_LABELS,offerScript,phaseStatus,scriptTiming,type OfferDetails } from './projectQuestions';
import type {GuideId} from './projectRouting';

const fields:{key:keyof OfferDetails;label:string;hint:string}[]=[
  {key:'service',label:'What service can you offer?',hint:'Start with a verb: test, review, explain, interview…'},
  {key:'deliverable',label:'What exactly will the buyer receive?',hint:'A report, recording, live session or another concrete output.'},
  {key:'responsibility',label:'What will you personally do?',hint:'Describe your own role, even if you use tools.'},
  {key:'deliveryTime',label:'When can you deliver?',hint:'A realistic time after agreeing the task.'},
  {key:'limit',label:'What is included—and limited?',hint:'For example, one website and ten minutes of testing.'},
  {key:'verification',label:'How can the buyer check delivery?',hint:'Start with a verb: watch, reproduce, inspect…'},
];
function OfferHelper({now}:{now:number}) {
  const [details,setDetails]=useState<OfferDetails>({...EXAMPLE_OFFER});
  const [notice,setNotice]=useState('');
  let script='',error='';
  try { script=offerScript(details); } catch(e) { error=e instanceof Error?e.message:'Complete your offer details.'; }
  const timing=scriptTiming(script);
  const [left,setLeft]=useState(60);
  const [running,setRunning]=useState(false);
  const remaining=useRef(60);
  useEffect(()=>{
    if(!running)return;
    const end=Date.now()+remaining.current*1000;
    const timer=setInterval(()=>{const value=Math.max(0,Math.ceil((end-Date.now())/1000));remaining.current=value;setLeft(value);if(!value)setRunning(false);},200);
    return()=>clearInterval(timer);
  },[running]);
  async function copy(){try{await navigator.clipboard.writeText(script);setNotice('Script copied. Practise aloud and replace any promise you cannot deliver.');}catch{setNotice('Copy was blocked. Select the script below and copy it manually.');}}
  const closed=now>=Date.parse('2026-11-05T23:59:59+05:30');
  return <section className="offer-helper" aria-labelledby="offer-helper-title">
    <p className="eyebrow">Q2 · Local script helper</p><h3 id="offer-helper-title">Turn a real offer into a short script.</h3>
    <p><strong>The filled fields are an example, not your own offer.</strong> Replace them with something you can genuinely deliver. No AI call, token, recording or upload is made here.</p>
    {closed&&<p className="notice">The published Q2 upload window has closed. This helper can still support practice, but it cannot submit late recordings.</p>}
    <div className="two-column"><div className="panel form">{fields.map(field=><div key={field.key}><label htmlFor={`offer-${field.key}`}>{field.label}</label><input id={`offer-${field.key}`} value={details[field.key]} maxLength={160} onChange={e=>{setDetails(d=>({...d,[field.key]:e.target.value}));setNotice('');}}/><p className="fine">{field.hint}</p></div>)}<button className="secondary" onClick={()=>{setDetails({...EXAMPLE_OFFER});setNotice('Example restored. Replace it before recording your own offer.');}}>Restore example</button></div>
      <div className="panel"><h4>Your practice script</h4>{error?<p role="alert" className="notice">{error}</p>:<><p className="draft-preview offer-script">{script}</p><p className="fine">{timing.words} words · roughly {timing.quickerSeconds}–{timing.slowerSeconds} seconds at 120–150 words per minute. This is only a word-count estimate; your actual speaking time matters.</p>{timing.slowerSeconds>60&&<p className="notice">This draft may exceed 60 seconds. Shorten the fields, then rehearse before uploading.</p>}<button onClick={()=>void copy()}>Copy offer script</button></>}
      <section className="practice-timer"><h4>60-second rehearsal</h4><p><strong>{left} seconds remaining</strong></p><p className="fine">This timer records nothing and uses no microphone. It is not an official submission or attempt.</p><div className="actions"><button disabled={!left} onClick={()=>setRunning(value=>!value)}>{running?'Pause rehearsal':'Start rehearsal'}</button><button className="secondary" onClick={()=>{setRunning(false);remaining.current=60;setLeft(60);}}>Reset timer</button></div></section>
      {notice&&<p role="status" className="fine">{notice}</p>}</div></div>
  </section>;
}

export function ProjectGuides({questionId}:{questionId:GuideId}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30_000);return()=>clearInterval(timer);},[]);
  const question=PROJECT_QUESTIONS.find(q=>q.id===questionId)!;
  return <article className="project-guides section">
    <a className="back-home" href="#home">← All P1 questions</a>
    <section className="question-guide" aria-labelledby="question-guide-title">
      <div className="section-heading"><div><p className="eyebrow">Q{question.number} · {question.help}</p><h1 id="question-guide-title">{question.title}</h1></div><span className="question-score">{question.score}</span></div>
      <p>{question.summary}</p>
      <div className="phase-list">{question.phases.map(phase=><section key={phase.label} className="phase-row"><div><h4>{phase.label}</h4><p>{phase.dates}</p>{phase.note&&<p className="fine">{phase.note}</p>}</div><span className={`phase-status ${phaseStatus(phase,now)}`}>{STATUS_LABELS[phaseStatus(phase,now)]}</span></section>)}</div>
      <h4>What to do</h4><ol className="steps guide-workflow">{question.steps.map(step=><li key={step}>{step}</li>)}</ol>
      <aside className="guide-note important"><span className="note-label">Before you continue</span><ul>{question.important.map(note=><li key={note}>{note}</li>)}</ul></aside>
      <aside className="guide-note mandatory"><span className="note-label">Finish in the official assignment</span><p>{question.completion}</p></aside>
      <div className="actions"><a className="button" href={ASSIGNMENT_URL} target="_blank" rel="noreferrer">Open official assignment · Q{question.number}</a>{question.id==='q5'&&<a href="https://exam.sanand.workers.dev/face-expressions.html" target="_blank" rel="noreferrer">Official face-expression capture</a>}</div>
      <p className="fine">Get personal game or recording links from your own assignment login. Never paste a private entry token into this guide.</p>
    </section>
    {question.id==='q2'&&<OfferHelper now={now}/>}
    <details className="guide-doubts"><summary>Why isn’t every question an automatic solver?</summary><p>Q1 can calculate a forecast from public reports. Q2 needs a real voice recording; Q3 requires personal phone movement; Q4 depends on authenticated documents and grants; Q5 needs consented photographs; Q6 needs actual service delivery; Q7 needs your own first readings and rankings. This page supports the permitted preparation and submission steps without inventing those activities.</p></details>
    <p className="fine"><a href={P1_SOURCE} target="_blank" rel="noreferrer">Official question source</a> · Rules checked {P1_RULES_CHECKED} · <a href="https://exam.sanand.workers.dev/exam-tds-2026-09-p1.info.js" target="_blank" rel="noreferrer">Official exam dates</a>. Check announcements and the official game if a deadline or phase state differs.</p>
  </article>;
}
