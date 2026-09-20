# Eskalations-Workflow (n8n)

Human-in-the-loop hand-off for the PM4 Auskunfts-Assistent, built for the
**SCI AI Tools Expert Training** capstone.

The RAG prototype already decides *that* an inquiry needs a human — it escalates
on low confidence, on a failed REQ-11 coverage check, or on a hard-routed legal
topic. What it never had was somewhere to escalate *to*. It told the citizen
their question "was forwarded" while nothing actually left the process. This
workflow closes that gap.

```
Streamlit app                          n8n (this workflow)
─────────────                          ───────────────────
escalation decision
  + LLM case summary
        │
        └── link, prefilled ──▶ Formular ─▶ Fall aufbereiten ─▶ Mail Bürger:in
                                                             ─▶ Mail Sachbearbeitung
                                                             ─▶ Bestätigungsseite
```

## Files

| File | Purpose |
|---|---|
| `pm4-escalation-workflow.json` | The importable workflow. Authoritative. |
| `fall-aufbereiten.js` | Reference copy of the Code node, for reading and review. |

---

## Setup

### 1. Run n8n

```bash
docker run -it --rm -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

Open <http://localhost:5678>.

### 2. Import the workflow

**Workflows ▸ … ▸ Import from File** → `pm4-escalation-workflow.json`.

### 3. Create the SMTP credential

Both mail nodes reference a credential named **SMTP (Gmail App-Passwort)**.
Open either mail node, create it, and fill in:

| Field | Value |
|---|---|
| User | `reigenmann@gmail.com` |
| Password | a Google **App Password**, not the account password |
| Host | `smtp.gmail.com` |
| Port | `465` |
| SSL/TLS | on |

An app password requires 2-Step Verification on the Google account; generate one
at <https://myaccount.google.com/apppasswords>. Create it yourself — it is a
credential and does not belong in this repo or in a chat window.

### 4. Activate the workflow

Toggle **Active** (top right). This matters more than it looks:

> **n8n only honours query-parameter prefill on the production URL of an active
> workflow.** On the test URL the fields render empty and nothing warns you.
> Almost every "the prefill doesn't work" report is this.

Copy the **production** form URL from the Form Trigger node. With the default
path it is:

```
http://localhost:5678/form/pm4-eskalation
```

### 5. Point the app at it

Already the default in `config.yaml`. To override without touching the repo, put
this in `.env`:

```
PM4_HANDOFF_FORM_URL=http://localhost:5678/form/pm4-eskalation
```

### 6. Run the assistant

```bash
python -m streamlit run app/streamlit_app.py
```

Ask something that escalates — *"Ich habe eine Busse fürs Parkieren erhalten und
möchte Einsprache erheben."* is reliable, since it hard-routes without even
attempting an answer. The button **Anfrage an die Sachbearbeitung weiterleiten**
appears under the answer. The expander next to it shows exactly what crosses the
boundary.

---

## What gets handed over

Eight query parameters. Naming is not cosmetic: n8n matches a query parameter
against the **field label** for visible fields and against the **field name** for
hidden ones, and a mismatch fails silently.

| Parameter | Form field | Content |
|---|---|---|
| `Anfrage` | visible textarea | the citizen's question, editable before sending |
| `falltyp` | hidden | `escalate_confidence` \| `escalate_coverage` \| `hard_route` |
| `vertrauenswert` | hidden | composite C, or `nicht berechnet` for hard routes |
| `schwelle` | hidden | the active threshold |
| `eskalationsgrund` | hidden | the routing engine's own reason string |
| `betreff` | hidden | LLM-generated subject |
| `offene_punkte` | hidden | LLM-generated checklist, pipe-separated |
| `quelle` | hidden | `rag-assistent`, vs. `formular-direkt` when opened cold |

`betreff` and `offene_punkte` come from the escalation summary the pipeline
already generates (`src/generate.py`). The caseworker therefore opens a prepared
case rather than a raw transcript — and the email says so, because a
model-generated checklist has to be labelled as one.

Opening the form directly works too: the hidden fields keep their defaults and
the case is marked `manuell`. The hand-off is an enhancement, not a dependency.

---

## Design notes

**Why a link and not a webhook call.** The link is followed by the *citizen's
browser*, so n8n on `localhost:5678` is reachable even when the app itself runs
on Streamlit Cloud. A server-side POST from Streamlit Cloud could never reach a
localhost n8n. It also means nothing in the scoring or routing path breaks when
n8n is down, and there is no shared secret to manage. The cost, named honestly:
the hand-off is an invitation, not a guarantee — if the citizen does not click,
nothing arrives.

**Why the mails are built in a Code node.** Both mail nodes stay readable
templates, and every formatting decision — case reference, working-day deadline,
HTML escaping — sits in one reviewable place.

**Escaping.** Citizen free text is interpolated into HTML mail, and n8n
expressions do not escape what they interpolate. `fall-aufbereiten.js` therefore
splits its output: anything ending in `_html` is escaped and safe for a mail
body; everything else is plain and belongs only in a subject or address field.
This was a real bug during the build, caught by feeding `<script>` through the
name field.

**Reply-To.** The caseworker mail sets Reply-To to the citizen, so replying goes
straight to the right person. The citizen mail sets Reply-To to the caseworker.

---

## Limits

- **No case register.** The caseworker's inbox *is* the queue. No database, no
  status tracking, no audit trail — which is a deliberate PoC-scope cut, not an
  oversight. The written PM4 report argues for logged decisions with reviewer
  initials (REQ-09); that is the next increment, not this one.
- **The case reference is not unique.** `SZ-VK-<date>-<4 digits>` is random per
  submission. With no register there is nothing to collide against, but it would
  need a sequence the moment one exists.
- **No spam protection** beyond n8n's bot filter. A public deployment would need
  rate limiting.
- **The response deadline is indicative.** Five working days, holidays ignored.
- **Emails are marked as a prototype** in subject and body, and must stay that
  way: they are not communications from Gemeinde Schwyz. Demo with synthetic
  inquiries only — no real citizen data.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Form opens but fields are empty | Test URL, or the workflow is not active. See step 4. |
| n8n rejects the completion page | Set the Form Trigger's **Respond** to *Using Respond to Webhook Node*. |
| `Invalid login` from SMTP | Account password used instead of an app password. |
| Mail sends but the body shows `{{ ... }}` | The node's HTML field lost its leading `=` (expression mode). |
| Button missing in the app | The inquiry was answered, not escalated — check the decision chip. |
| Button shows a config hint | `handoff.form_url` empty in `config.yaml` and no `PM4_HANDOFF_FORM_URL`. |
