# 002 — n8n escalation hand-off (AI Tools capstone)

**Date:** 2026-09-20
**Repository:** `C:\_dev\Prototype_PM4_for2608` — a **copy** of the PM4 prototype,
not the PM4 repo itself. See "Repository split" below before pushing anything.

## Why this session happened

This work belongs to a *different* course than PM4: the **SCI AI Tools Expert
Training** capstone (`AI-Tools Capstone Assignment.pdf`). That brief asks for a
small artifact that uses at least two tools from the training and has a model
doing real work, graded on judgment rather than scale.

An earlier chat had designed a full human-in-the-loop package (Postgres case
store, two extra Streamlit modules, docker-compose, tests). That was scaled down
deliberately: a linear n8n workflow demonstrates the same judgment and fits a
two-minute video, where the larger build would not.

## What was built

A hand-off from the prototype's existing escalation decision into an n8n form
that owns the case from there on.

- **`n8n/pm4-escalation-workflow.json`** — five nodes in a line: Form Trigger →
  Code ("Fall aufbereiten") → mail to the citizen → mail to the caseworker →
  completion page. SMTP (Gmail app password), no database.
- **`n8n/fall-aufbereiten.js`** — readable reference copy of the Code node.
- **`n8n/README.md`** — setup, the parameter contract, design notes, limits.
- **`src/handoff.py`** — builds the prefilled form URL from a pipeline result.
- **`app/streamlit_app.py`** — `render_handoff()` renders the link button in the
  escalation branch, plus an inspection expander showing the handed-over payload.
- **`config.yaml`** — new `handoff:` block; `PM4_HANDOFF_FORM_URL` overrides it.

Nothing in the retrieval, scoring, coverage or routing path was touched.

## Decisions and their reasons

**Link, not webhook POST.** The decisive argument is not simplicity, it is
reachability: the link is followed by the *citizen's browser*, so an n8n on
`localhost:5678` works even when the app runs on Streamlit Cloud. A server-side
POST from Streamlit Cloud could never reach it. It also keeps n8n's availability
out of the request path and avoids a shared secret. The honest cost: the
hand-off is an invitation, not a guarantee — no click, no case.

**No case register.** The caseworker's inbox is the queue. This contradicts
REQ-09 (logged decisions with reviewer initials) in the PM4 report, so it is
stated as a scope cut in `n8n/README.md` rather than left to look like an
oversight. It is the first thing the next increment would add.

**The LLM summary travels with the hand-off.** `betreff` and `offene_punkte`
come from the escalation summary `src/generate.py` already produces, so the
caseworker opens a prepared case. The mail labels them as model-generated and
tells the reader to check them — the point of the exercise is a human in the
loop, not a human rubber-stamping.

**Hard routes report `nicht berechnet`, not `0.000`.** Hard-routed inquiries
never reach the scorer. Sending a zero would read as "maximally unconfident",
which is a different and misleading claim.

## Bug found and fixed during the build

The Code node returned `name`, `telefon` and `email` unescaped while both mails
interpolate them into HTML, and n8n expressions do not escape what they
interpolate. Feeding `<script>alert(1)</script>` through the name field in a Node
harness showed it landing raw in the markup. Fixed by splitting the node's output
on an explicit contract: anything ending in `_html` is escaped and safe for a mail
body, everything else is plain and belongs only in a subject line or an address
field (`email` must stay literal to work as an address).

## Verification

- Code node executed in Node against two simulated submissions — one arriving
  from the assistant, one opened cold. Case reference format, working-day
  deadline, falltyp fallback and HTML escaping all confirmed.
- Streamlit app run on port 8502; hard-routed inquiry produced the button, and
  the rendered href decoded to all eight parameters with umlauts intact (739
  chars, well under the 1800 ceiling).
- **The n8n workflow itself has not been imported or executed.** No email has
  been sent. That is the immediate next step and needs the SMTP app password,
  which only the user can create.

## Repository split — read before pushing

This copy still has `origin` pointing at
`github.com/reigenmann-collab/RAGChatBotSZ`, the **PM4** repository, which also
auto-deploys to Streamlit Cloud on push to `main`. Pushing this work there would
put capstone material into the PM4 submission and redeploy the PM4 demo.

Give this copy its own remote (or no remote) before committing anything.

## Left open

- Import, wire the SMTP credential, activate, and run the workflow end to end.
- Confirm the Form Trigger's `responseMode: "responseNode"` is accepted; if n8n
  objects, set **Respond** to *Using Respond to Webhook Node* in the UI.
- The capstone's other two deliverables: the one-page PDF and the two-minute
  video.
- PM4's own open thread is untouched and still open: the evaluation chain has
  never been run, so the 0.82 threshold remains a placeholder.
