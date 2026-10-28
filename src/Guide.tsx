import { ASSIGNMENT_URL } from './core';

export function Guide(){
  return <article className="guide prose guide-short">
    <p className="eyebrow">Q1 · Understand it first, then choose how to play</p>
    <h2>What is the prediction game?</h2>
    <p className="lede">You are guessing <strong>AI Pipe’s total bill for 2–8 November 2026</strong>. Choose the money range you think will contain that seven-day total, and explain why.</p>
    <p>It is the <strong>shared service’s bill</strong>, not your personal spending. Everyone predicts the same total. Your answers, timing, marks, and final result code are personal.</p>
    <p><strong>Example only:</strong> if you expect about $8 a day, seven days would cost roughly $56. You might choose <strong>$50 to under $100</strong>. The real bill is not known yet, so you can revise your prediction as new reports arrive.</p>
    <aside className="guide-note good"><span className="note-label">Useful</span><strong>You can start now; do not wait for November 2.</strong><p>Earlier participation matters for marks. You can leave all 1,000 practice credits unused. Buying or selling shares is not required.</p></aside>

    <section className="guide-section" aria-labelledby="manual-play">
      <h3 id="manual-play">1. How to play in the official game</h3>
      <ol className="steps guide-workflow">
        <li><strong>Open Q1 from your assignment.</strong> Follow your personal market link and check that you are signed in as yourself.</li>
        <li><strong>Read the reports.</strong> Open <strong>See each day</strong>. Look at completed daily spending. Estimate the seven-day bill; during the target week, add the known days to your estimate for the remaining days.</li>
        <li><strong>Select Your prediction.</strong> Choose the range containing your estimate. Keep <strong>Credits to trade</strong> at <strong>0</strong>.</li>
        <li><strong>Write Your reason.</strong> Say which facts support your choice and what new evidence would change your mind. Use at least 15 characters and three words, up to 1,000 characters.</li>
        <li><strong>Click Save prediction.</strong> Check <strong>My answers</strong> for a row with your range and reason.</li>
        <li><strong>Return when reports change.</strong> If new facts justify a different range, update your prediction and explain the change. Repeating the same answer is not a meaningful revision.</li>
      </ol>
    </section>
    <aside className="guide-note important"><span className="note-label">Important</span><strong>Save prediction is the button you need.</strong><p><strong>Spend credits, Buy shares, and Review trade</strong> are optional trading controls. Ignore them for a zero-credit prediction. An empty shares table is normal. “Latest facts: 0” rows are report updates, not your saved answers.</p></aside>

    <section className="guide-section" aria-labelledby="solver-play">
      <h3 id="solver-play">2. How to play with this solver</h3>
      <ol className="steps guide-workflow">
        <li><strong>Open My prediction.</strong> Data loads automatically. No token or file upload is needed for the numerical forecast.</li>
        <li><strong>Check the report date and suggested range.</strong> Use <strong>Refresh prediction</strong> to request an update. With automatic checking enabled, the visible page checks every ten minutes.</li>
        <li><strong>Read and copy the reason.</strong> Edit it to reflect your own thinking, then click <strong>Copy reason</strong>.</li>
        <li><strong>Save in the game.</strong> Select that range under <strong>Your prediction</strong>, paste <strong>Your reason</strong>, leave credits at zero, and click <strong>Save prediction</strong>.</li>
        <li><strong>Review later updates.</strong> The solver recalculates from new reports without an LLM. It does not change your official game answer until you save again.</li>
      </ol>
    </section>
    <aside className="guide-note optional"><span className="note-label">Optional help · Choose only what you need</span>
      <dl className="optional-options">
        <dt>Improve the prediction and reason with AI</dt><dd>Open <strong>Improve reason</strong>, paste your AI Pipe API token, and click <strong>Check token and load models</strong>. Add your perspective, approve the paid requests, and run the review. Read the draft before using it. Other providers are supported too.</dd>
        <dt>Save directly from the solver and see your history</dt><dd>Open <strong>Save to game</strong>, connect using the <strong>game entry token</strong>, check the displayed account, and confirm the save. Connecting or viewing history does not submit anything.</dd>
        <dt>Ask your own external LLM</dt><dd>Click <strong>Download everything for my own AI</strong>. Upload <strong>q1-llm-research.txt</strong> to your LLM. It contains reports, logic, prompts, and available shared class evidence. A fresh download is a new snapshot; the saved file cannot update itself.</dd>
      </dl>
    </aside>
    <aside className="guide-note caution"><span className="note-label">Caution</span><strong>Use the right evidence and token.</strong><p>Do not count missing or unfinished days as zero. <strong>AI Pipe API token → Improve reason.</strong> <strong>Game entry token → Save to game.</strong> Neither is your final result code. AI review uses your provider balance, not game credits.</p><p>Future spending can differ from the forecast. Stale reports and failed refreshes are marked. Closing the page stops its checks. Edited or AI-written drafts are preserved for you to review when evidence changes.</p></aside>

    <section className="guide-section" aria-labelledby="finish-task">
      <h3 id="finish-task">3. Finish the assignment after settlement</h3>
      <aside className="guide-note mandatory"><span className="note-label">Mandatory for final submission</span><strong>Submit your own signed result code.</strong><p>After the instructor finalizes the game, get your result code from the official game or retrieve it in <strong>Save to game</strong>. Paste it into the assignment’s Q1 answer box, press <strong>Check</strong>, then <strong>Save</strong>. A money range, login token, or downloaded research file is not the final answer.</p></aside>
    </section>
    <aside className="guide-note dates"><span className="note-label">Dates · All in 2026</span><ul><li><strong>2–8 November:</strong> the seven target UTC days.</li><li><strong>9 November, 05:30 AM IST:</strong> last time to make scoring predictions.</li><li><strong>9–16 November:</strong> expected settlement; missing reports can delay it.</li><li><strong>17 November, 11:59:59 PM IST:</strong> published final assignment Save deadline.</li></ul></aside>

    <section className="guide-doubts" aria-labelledby="common-doubts">
      <h3 id="common-doubts">Quick answers to common doubts</h3>
      <details><summary>What are the 1,000 credits and shares for?</summary><p>Practice trading. <strong>Spend credits</strong> and <strong>Buy shares</strong> are two ways to trade; <strong>Review trade</strong> previews one. You do not need them for the published Q1 marks. Saving a prediction alone does not create shares, so your shares can stay empty.</p></details>
      <details><summary>Why does the group show a different range?</summary><p>The group figure comes from market prices; our forecast comes from spending reports. Neither is the answer key. A displayed 37% is not a count of students or a verified 37% chance of winning. Review the evidence instead of assuming the group or solver must be right.</p></details>
      <details><summary>Why do I see Latest facts: 0 and so many updates?</summary><p>Before November 2, the target-week bill has not happened yet. Zero means no target-week total has been observed. Report updates are mixed into the game history. To confirm you saved, look for a row containing <strong>your selected range and your explanation</strong>.</p></details>
      <details><summary>Is this a random or perfect prediction? Does it need AI?</summary><p><strong>It is evidence-based, reproducible, and does not need AI—but it is not perfect.</strong> Four numerical methods use completed spending reports. The same data and calculation conditions give the same result; refreshing does not pick a random answer. Seeded simulations explore uncertainty rather than prove future accuracy.</p><p>There may be too few past weeks to show which method is best. That is why the solver may treat them equally. Once all seven completed target-day totals are present, it calculates their observed sum directly. The official game still issues your score and result code.</p></details>
      <details><summary>Does Refresh prediction also update my answer in the game?</summary><p>No. Refresh checks available source data and recalculates the suggestion. An untouched solver draft follows new evidence, while your edits and AI-written drafts stay for review. <strong>Your official game answer changes only when you save again.</strong> No AI review is charged automatically.</p></details>
      <details><summary>Do I need a token or an imported file?</summary><p>Neither is needed to get the numerical forecast. The AI Pipe token is only for optional AI review; the game token is only for account access and direct saving. Advanced data’s import accepts a previously downloaded <strong>forecast-evidence.json</strong> for analysis. You can ignore it during normal use.</p></details>
      <details><summary>How do marks work?</summary><p>The published split is <strong>10% participation, 45% correctness over time, 22.5% early entry, and 22.5% an explained change after new evidence</strong>. Starting late cannot recover the earlier scoring time. Trading profits do not improve marks. The official server determines the score.</p></details>
    </section>
    <div className="actions"><a className="button" href={ASSIGNMENT_URL} target="_blank" rel="noreferrer">Open the official assignment</a></div>
    <p className="fine">Independent student tool. The official assignment and game remain authoritative. Credentials stay in page memory and clear on reload; server-issued sessions may expire.</p>
  </article>;
}
