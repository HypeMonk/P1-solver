export const P1_SOURCE = 'https://exam.sanand.workers.dev/exam-tds-2026-09-p1.js';
export const P1_RULES_CHECKED = '2026-11-02';
export const P1_EXAM_CLOSE = '2026-11-17T23:59:59+05:30';
export type ActivityStatus = 'upcoming' | 'open' | 'closed' | 'check-game';
export interface ProjectPhase {
  label: string; dates: string; opensAt?: string; closesAt?: string;
  note?: string;
}
export interface ProjectQuestion {
  id: string; number: number; title: string; score: string; help: string; summary: string;
  phases: ProjectPhase[]; steps: string[]; important: string[]; completion: string;
}
export function phaseStatus(phase: ProjectPhase, now: number): ActivityStatus {
  if (!phase.closesAt) return 'check-game';
  if (now >= Date.parse(phase.closesAt)) return 'closed';
  if (phase.opensAt && now < Date.parse(phase.opensAt)) return 'upcoming';
  return 'open';
}
export const STATUS_LABELS: Record<ActivityStatus,string> = {
  upcoming: 'Not open yet', open: 'Within published window', closed: 'Published window closed', 'check-game': 'Check the official game',
};
export const PROJECT_QUESTIONS: ProjectQuestion[] = [
  {
    id:'q1',number:1,title:'Predict the shared AI Pipe bill',score:'1 regular mark',help:'Forecast solver + guide',
    summary:'Predict the full November 2–8 UTC bill. Known daily totals plus estimates for unknown days always produce one whole-week prediction.',
    phases:[{label:'Save scoring predictions',dates:'Until 9 November, 5:30 AM IST',opensAt:'2026-10-17T00:00:00Z',closesAt:'2026-11-09T00:00:00Z'},
      {label:'Settlement',dates:'Expected 9–16 November; missing reports may delay it',note:'The official game supplies the result code.'}],
    steps:['Open My prediction for the current range and reason. No token is needed for the numerical forecast.','Save your choice in the official game with zero credits. Check My answers for your range and reason.','Review genuinely new reports. A Thursday submission still predicts the entire week, not just Friday–Sunday.'],
    important:['An estimate is not an answer key. Changing your draft here does not update your official prediction.','The published components are 10% participation, 45% accuracy over time, 22.5% early participation and 22.5% evidence-based revision. Early participation is not automatically full credit.'],
    completion:'After settlement, paste your personal signed result code into Q1, then Check and Save before the exam closes.',
  },
  {
    id:'q2',number:2,title:'Record your Human Exchange offer',score:'1 regular mark',help:'Offer script helper + recording guide',
    summary:'Explain a useful service you can genuinely offer a classmate, in your own voice, in up to 60 seconds.',
    phases:[{label:'Upload an offer',dates:'19 October, 8:00 AM – 5 November, 11:59:59 PM IST',opensAt:'2026-10-19T08:00:00+05:30',closesAt:'2026-11-05T23:59:59+05:30',note:'The source allows a two-minute upload grace period for slow networks. Aim for the main deadline.'}],
    steps:['Choose something you can personally deliver. Name the output, delivery time, limits and how a buyer checks it.','Use the helper below if you want a starting script. Replace the example with your real offer.','Practise aloud using your own natural voice. Listen to your take before uploading.','Open Q2 in the official assignment and follow your fresh personal recorder link. Record and submit there.','Wait for the recorder to confirm the upload. You cannot replay or download an earlier uploaded take from its audio page.'],
    important:['AI help with planning or scripting is allowed. The actual recording should use your natural voice; synthetic or cloned narration can receive an authenticity deduction. Accessibility accommodations are available from the course team.','You have three total uploads: an initial submission and two revisions. Local practice does not spend an attempt. Only the latest uploaded recording is used.','This recording and the Q6 trading game have separate deadlines. Uploading a new offer does not reopen a closed trading round.'],
    completion:'After a confirmed upload, return to Q2, type “recorded” if desired, then Check and Save. The server verifies the recording; the word itself is not proof of an upload.',
  },
  {
    id:'q3',number:3,title:'Air Ink phone drawing',score:'1 regular mark',help:'Device and submission checklist only',
    summary:'Draw your three assigned character codes by tilting your phone in the official game. This part must be completed personally, without AI agents.',
    phases:[{label:'Upload all three drawings',dates:'Until 1 November, 11:59:59 PM IST',closesAt:'2026-11-01T23:59:59+05:30',note:'A two-minute slow-network upload grace is published. It is not a new practice window.'}],
    steps:['Open the personal Air Ink link from Q3 on a phone over HTTPS. Keep the link private.','Read the recording consent and follow the official sensor-permission and calibration prompts.','Geolocation is optional: declining location does not prevent the exercise. If calibration fails, follow the official suggested fix.','Complete the drawings yourself. Review the set before using an upload attempt.','After the official game confirms the upload, return to the exam and Check, then Save.'],
    important:['This helper does not draw, provide motion data, perform OCR scoring or upload for you. Follow the task’s no-agent rule for completing the exercise.','The set of three drawings is one submission. Three total submissions are allowed; the latest received set is used. Practice in the official game does not consume an upload.','No live score is shown. Legibility is assessed offline. A late exam Save does not create a missing game upload.'],
    completion:'Use the official upload acknowledgement and exam verification. If you missed the activity cutoff, ask the course team; this page cannot reopen it.',
  },
  {
    id:'q4',number:4,title:'Reconcile the Missing Invoice',score:'0 regular marks · 1 bonus mark',help:'Calculation explanation + result guide',
    summary:'Reconcile goods received, purchase-order prices and valid credit notes. The document-request game has its own closed activity window.',
    phases:[{label:'Document requests',dates:'Until 23 October, 4:00 AM IST',closesAt:'2026-10-23T04:00:00+05:30'},
      {label:'Game activity',dates:'21 October, noon – 23 October, noon IST',opensAt:'2026-10-21T12:00:00+05:30',closesAt:'2026-10-23T12:00:00+05:30'}],
    steps:['For an existing result, open your desk from Q4 and inspect its final state.','The published payment rule is: received quantity × purchase-order price, plus GST at the purchase-order rate, minus valid credit notes. Read each document’s scope before calculating.','Only documents genuinely granted to you support the amount score. List exactly the required documents and avoid unneeded requests.','Genuine requests should be granted, cancelled notes replaced, and fake requests refused. The activity window is now past; a calculator cannot recreate missed grants.'],
    important:['The source permits agents to read documents, send requests and draft an answer. Granting, refusing and paying require the student’s Google identity confirmation.','Requests were limited to three. Unanswered requests escalated after eight hours and lost marks.','No account-connected invoice solver is included here; the documents and authentic grants are not publicly available.'],
    completion:'After the game closes, Check then Save in Q4. The exam reads the signed game result; typing a calculated amount or “played” cannot replace that result.',
  },
  {
    id:'q5',number:5,title:'Capture ten facial expressions',score:'0 regular marks · preparation only',help:'Capture checklist; later classifier not specified',
    summary:'Create your own consented image ZIP for a later classifier task. The current source does not specify that later modelling assignment.',
    phases:[{label:'Preparation',dates:'Requested by 26 October, 11:59 PM IST',closesAt:'2026-10-26T23:59:00+05:30',note:'The preparation date does not establish whether the Google Form is still accepting uploads.'},
      {label:'Later classifier',dates:'Requirements and deadline not supplied in this source'}],
    steps:['Read the official capture and consent instructions before using the camera.','The ten expressions are neutral, happy, sad, angry, surprised, contempt, restrained amusement, scepticism, uncertainty and hopelessness.','Review your photographs and download one ZIP from the official capture page.','Upload the ZIP to the linked Google Form, choose whether classmates may receive your images, and wait for the form confirmation.'],
    important:['Photos of your own face are voluntary. Contact the course team about an alternative if you do not want to provide them.','The exam acknowledgement does not upload photographs or verify the Google Form.','We cannot promise a classifier solution until its actual task, data rules and deadline are released. This helper stores no face images.'],
    completion:'Only after completing the actual form submission, enter “completed” in Q5, Check and Save. This records a zero-mark acknowledgement, not verified dataset delivery.',
  },
  {
    id:'q6',number:6,title:'Human Exchange, Round 1',score:'0 regular marks · up to 10 bonus marks, awarded separately',help:'Trade and final-receipt guide',
    summary:'Buy or sell genuinely delivered services. A trade counts only after buyer payment and seller confirmation.',
    phases:[{label:'New trades',dates:'Source wording: 22 October, noon to “31 October, midnight IST”',note:'The meaning of midnight is ambiguous. Check the official game; neither interpretation extends into November 2.'},
      {label:'Finish existing orders',dates:'Source wording: until “2 November, midnight IST”',note:'Do not assume the whole of November 2 remains open. Confirm the precise cutoff and order state in the game.'}],
    steps:['Open your official market and inspect existing orders before starting any action.','The published rules start each student with 10 credits and permit three open orders. Buying holds one credit for 48 hours, with one extension.','Agree a real deliverable and a price of 1–10 credits. Delivery happens outside the site.','The buyer pays and states what they received; the seller confirms and states what they delivered. Both identity-gated steps must be completed by the student.','After the round is final, open Result and copy your own final receipt.'],
    important:['Selling earns 4, 2, 1… game marks for successive different buyers; buying earns 2, 1, 0.5… for successive different sellers, capped at 10. Repeat partners, higher prices and credits do not add marks.','Agents may browse, place orders and chat, but paying and delivery confirmation require Google identity confirmation. No trade or payment action is performed by this page.','Trading dates differ from the Q2 recording deadline. Provisional receipts are rejected. Unusual trading patterns may be reviewed.'],
    completion:'Paste the final receipt into Q6, Check and Save. Confirm that the game has closed and the receipt is final; the wording “midnight” is not resolved by this helper.',
  },
  {
    id:'q7',number:7,title:'Picture Stories',score:'10 regular marks · 5 creator + 5 reader',help:'Separate phase and receipt guides',
    summary:'Create a wordless story image, then narrate and rank classmates’ stories. Creator and reader phases have separate cutoffs.',
    phases:[{label:'Create',dates:'24 October, noon – 29 October, noon IST',opensAt:'2026-10-24T12:00:00+05:30',closesAt:'2026-10-29T12:00:00+05:30'},
      {label:'Narrate and rank',dates:'29 October, noon – 1 November, noon IST',opensAt:'2026-10-29T12:00:00+05:30',closesAt:'2026-11-01T12:00:00+05:30'},
      {label:'Final receipt',dates:'After game closure on 2 November; submit by 17 November',note:'An exact receipt-ready time is not published. The game must identify the receipt as final.'}],
    steps:['Creator phase: one square wordless image, usually one to four panels, and a private story describing the situation, change and outcome. AI image tools are allowed for creation.','Do not include letters, numbers, captions, signatures or words in speech bubbles. Images freeze at the creator cutoff.','Reader phase: check the microphone and use the official unmarked practice. Each graded picture starts a 45-second recording immediately when revealed.','Give your own first reading in any language. One retake is available within that same 45 seconds. Rank the ten stories by storytelling, then confirm the final order personally.','Once the game is final, open Result, copy your receipt and return to the exam.'],
    important:['Missing a creator upload does not prevent earning reader marks while the reader phase is open. Neither earlier activity can be recreated after its cutoff by saving the exam later.','Creator marks cover being understood and preferred by readers. Reader marks cover completion, story interpretation and ranking agreement; no guide can guarantee other students’ rankings.','Agents may read the desk, but graded narrations must be the student’s own first readings. Final ranking confirmation requires Google identity confirmation. This guide supplies no interpretations of graded pictures.'],
    completion:'Paste your own final receipt into Q7, Check then Save by November 17. Provisional receipts copied before game closure are rejected.',
  },
];

export interface OfferDetails {
  service: string; deliverable: string; responsibility: string; deliveryTime: string; limit: string; verification: string;
}
export const EXAMPLE_OFFER: OfferDetails = {
  service:'test a classmate’s website on my phone',deliverable:'a short screen recording and a list of three usability issues',
  responsibility:'try the agreed workflow myself and describe where I get stuck',deliveryTime:'within two days of agreeing the task',
  limit:'one website and one ten-minute test',verification:'watch the recording and reproduce the steps I report',
};
export function offerScript(details: OfferDetails): string {
  const text=Object.fromEntries(Object.entries(details).map(([key,value])=>[key,value.trim().replace(/\s+/g,' ')])) as unknown as OfferDetails;
  if (Object.values(text).some(value=>!value || value.length>160)) throw new Error('Fill every field with 1–160 characters. Keep each promise short and realistic.');
  return `I offer to ${text.service}. You will receive ${text.deliverable}. I will personally ${text.responsibility}. I can deliver ${text.deliveryTime}. This offer covers ${text.limit}. To check delivery, you can ${text.verification}.`;
}
export function scriptTiming(text: string) {
  const words=text.trim()?text.trim().split(/\s+/u).length:0;
  return { words, quickerSeconds:Math.ceil(words/150*60), slowerSeconds:Math.ceil(words/120*60) };
}
