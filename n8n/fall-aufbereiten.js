// PM4 — "Fall aufbereiten" (Code node of pm4-escalation-workflow.json)
//
// Reference copy for review. The authoritative version is the one inside the
// workflow JSON; edit there (or in the n8n UI) and mirror it back here.
//
// In:  one form submission.
// Out: one normalised case, from which both emails and the confirmation page
//      are built. All formatting decisions live here so the two email nodes
//      stay readable templates.

const f = $input.first().json;

// Form field keys are the visible field LABELS, and the field NAMES for hidden
// fields. Reading through a helper keeps a renamed label from throwing.
const text = (...keys) => {
  for (const k of keys) {
    const v = f[k];
    if (v === undefined || v === null) continue;
    const s = Array.isArray(v) ? v.join(', ') : String(v);
    if (s.trim() !== '') return s.trim();
  }
  return '';
};

// Citizen free text is interpolated into HTML mail. Escape it. This is the one
// genuine injection surface in the workflow.
const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

// --- Geschäftszeichen -------------------------------------------------------
const now = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const datum = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}`;
const lauf = String(Math.floor(Math.random() * 9000) + 1000);
const caseRef = `SZ-VK-${datum}-${lauf}`;

const fmt = (d, opts) => new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', ...opts }).format(d);
const eingang = fmt(now, { dateStyle: 'long', timeStyle: 'short' });

// Antwortfrist: fünf Arbeitstage. Feiertage sind bewusst nicht berücksichtigt —
// im PoC ist das eine Richtangabe, keine Zusicherung.
const frist = new Date(now);
let offen = 5;
while (offen > 0) {
  frist.setDate(frist.getDate() + 1);
  const tag = frist.getDay();
  if (tag !== 0 && tag !== 6) offen--;
}

// --- Felder -----------------------------------------------------------------
const anfrage = text('Anfrage');
const name = text('Name');
const email = text('E-Mail');
const telefon = text('Telefon');
const weitere = text('Weitere Angaben');

// Diese fünf liefert der Assistent als Query-Parameter mit. Wer das Formular
// direkt aufruft, hat sie nicht — dann ist der Fall schlicht "manuell", und der
// Sachbearbeitende sieht das auch so.
const falltyp = text('falltyp') || 'manuell';
const vertrauenswert = text('vertrauenswert') || 'nicht berechnet';
const schwelle = text('schwelle') || '—';
const grund = text('eskalationsgrund') || 'Direkt über das Formular eingereicht.';
const betreff = text('betreff') || 'Bürgeranfrage Strassenverkehr';
const quelle = text('quelle') || 'formular-direkt';

const FALLTYP_KLARTEXT = {
  escalate_confidence: 'Vertrauenswert unter Schwelle',
  escalate_coverage: 'Deckungsprüfung REQ-11 nicht bestanden',
  hard_route: 'Hart geroutet — rechtliches Thema, kein Antwortversuch',
  manuell: 'Direkt über das Formular eingereicht',
};

// Der Assistent überträgt die offenen Punkte pipe-separiert, weil eine Liste
// nicht in einen Query-Parameter passt.
const offenePunkte = text('offene_punkte')
  .split('|')
  .map((s) => s.trim())
  .filter(Boolean);

const offeneHtml = offenePunkte.length
  ? '<ul style="margin:.3rem 0 0 0;padding-left:1.2rem">' +
    offenePunkte.map((p) => `<li>${esc(p)}</li>`).join('') +
    '</ul>'
  : '<p style="color:#777;margin:.3rem 0 0 0">Keine vom Assistenten vorbereiteten Punkte.</p>';

// Naming contract, because both emails are HTML and n8n expressions do NOT
// escape what they interpolate: anything ending in _html is already escaped and
// safe to drop into markup. Everything else is plain text and belongs only in a
// subject line or an address field — never in the body.
return [{
  json: {
    case_ref: caseRef,
    eingang,
    frist: fmt(frist, { dateStyle: 'long' }),

    // plain — addressing and subject lines only
    email,                        // used as toEmail / replyTo, must stay literal
    betreff,                      // used as the caseworker subject
    anfrage,
    falltyp,
    quelle,
    offene_punkte: offenePunkte,

    // escaped — safe for the mail bodies
    name_html: esc(name),
    email_html: esc(email),
    telefon_html: esc(telefon || '—'),
    betreff_html: esc(betreff),
    grund_html: esc(grund),
    anfrage_html: nl2br(anfrage),
    weitere_html: weitere ? nl2br(weitere) : '<span style="color:#777">keine</span>',
    offene_punkte_html: offeneHtml,

    // safe by construction — derived from fixed vocabularies, not user input
    falltyp_klartext: FALLTYP_KLARTEXT[falltyp] || esc(falltyp),
    vertrauenswert: esc(vertrauenswert),
    schwelle: esc(schwelle),
  },
}];
