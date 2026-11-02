import {useEffect,useState} from 'react';
import {P1_EXAM_CLOSE,P1_RULES_CHECKED,PROJECT_QUESTIONS,STATUS_LABELS,phaseStatus} from './projectQuestions';

export function ProjectHome(){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30_000);return()=>clearInterval(timer);},[]);
  return <article className="project-home section">
    <p className="eyebrow">September 2026 · Project 1</p>
    <h1>One project. Seven questions.</h1>
    <p className="lede">Choose a question to open its guide. Q1 includes the prediction solver; each other question has its own instructions and deadlines.</p>
    <aside className="guide-note dates"><span className="note-label">Final assignment Save</span><strong>17 November 2026, 11:59:59 PM IST.</strong><p>{now>=Date.parse(P1_EXAM_CLOSE)?'The published exam Save window has closed. Consult the official assignment for your result.':'Activity deadlines below are separate. The final Save date does not reopen a closed recording or game.'}</p></aside>
    <div className="home-question-list">{PROJECT_QUESTIONS.map(question=><a key={question.id} className="home-question" href={`#${question.id==='q1'?'forecast':question.id}`}>
      <div className="home-question-heading"><span className="question-number">Q{question.number}</span><div><h2>{question.title}</h2><p className="question-score">{question.score} · {question.id==='q1'?'Solver + guide':'Separate guide'}</p></div><span className="open-question">Open →</span></div>
      <p className="question-summary">{question.summary}</p>
      <dl className="home-deadlines">{question.phases.map(phase=><div key={phase.label}><dt>{phase.label}</dt><dd>{phase.dates}<span className={`phase-status ${phaseStatus(phase,now)}`}>{STATUS_LABELS[phaseStatus(phase,now)]}</span></dd></div>)}</dl>
    </a>)}</div>
    <p className="fine">Published rules checked {P1_RULES_CHECKED}. Status labels use your device’s time; they do not access your account. For ambiguous times or updated dates, check the official game.</p>
  </article>;
}
