"""
Hand-off from an escalated inquiry to the n8n case-intake form.

The PM4 prototype escalates but has nowhere to escalate *to*: `answer_query`
marks an inquiry for a human and stops. This module is the bridge - it builds a
prefilled URL into an n8n Form Trigger, which owns everything downstream (case
reference, citizen confirmation, caseworker notification).

Why a link and not a server-side POST to an n8n webhook:

  * The link is followed by the CITIZEN'S browser, not by the Streamlit server.
    An n8n on http://localhost:5678 is therefore reachable in a demo even when
    the app itself runs on Streamlit Cloud. A server-side POST never could be.
  * Nothing in the scoring or routing path can break when n8n is down, there is
    no shared secret to manage, and no outbound call to add latency.

The cost is honest and worth naming: the hand-off is an invitation, not a
guarantee. If the citizen does not click, nothing reaches the department. That
is a deliberate PoC-scope limit (see n8n/README.md).

The values passed are the routing decision and the LLM-generated escalation
summary the pipeline already produces - nothing is recomputed here.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import quote, urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import load_config  # noqa: E402

# Conservative ceiling. Modern browsers accept far more, but a prefill that is
# silently truncated by some proxy is worse than one we shortened deliberately.
DEFAULT_MAX_URL_CHARS = 1800

# Dropped in this order when the URL is too long. The three parameters not on
# this list - Anfrage, falltyp, quelle - are the ones the caseworker cannot do
# without, so they are never sacrificed.
SHEDDABLE = ["offene_punkte", "betreff", "eskalationsgrund", "schwelle"]


def _settings() -> dict:
    return (load_config().get("handoff") or {})


def form_base_url() -> str:
    """The n8n form URL. The environment wins so the deployed app can point
    somewhere other than what is committed in config.yaml."""
    return (os.getenv("PM4_HANDOFF_FORM_URL") or _settings().get("form_url") or "").strip()


def is_enabled() -> bool:
    return bool(_settings().get("enabled", True)) and bool(form_base_url())


def _clip(text: str, limit: int) -> str:
    text = " ".join(str(text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def build_params(result: dict) -> dict[str, str]:
    """Map a pipeline result onto the n8n form's field names.

    Key naming is not cosmetic. n8n matches a query parameter against the
    *field label* for visible fields and against the *field name* for hidden
    ones, and a mismatch fails silently - the field just renders empty. So
    `Anfrage` is capitalised because that is the visible label in the form, and
    the rest are lower-case because they are hidden fields.
    """
    signals = result.get("signals") or {}
    summary = result.get("escalation_summary") or {}
    composite = signals.get("composite")

    params = {
        "Anfrage": _clip(result.get("query", ""), 600),
        "falltyp": result.get("decision", ""),
        # Hard-routed inquiries never reach the scorer, so there is no value to
        # report. Saying so beats sending a misleading 0.000.
        "vertrauenswert": f"{composite:.3f}" if composite is not None else "nicht berechnet",
        "schwelle": f"{result['threshold']:.3f}" if result.get("threshold") is not None else "",
        "eskalationsgrund": _clip(result.get("reason", ""), 300),
        "betreff": _clip(summary.get("betreff", ""), 120),
        "offene_punkte": _clip(" | ".join(summary.get("offene_punkte") or []), 400),
        "quelle": "rag-assistent",
    }
    return {k: v for k, v in params.items() if v}


def form_url(result: dict) -> str | None:
    """The prefilled form URL, or None when no hand-off target is configured."""
    base = form_base_url()
    if not base or not _settings().get("enabled", True):
        return None

    params = build_params(result)
    limit = int(_settings().get("max_url_chars") or DEFAULT_MAX_URL_CHARS)

    # quote_via=quote encodes a space as %20 rather than '+'. Both decode
    # correctly through URLSearchParams, but %20 is unambiguous everywhere.
    def assemble(p: dict) -> str:
        return f"{base}?{urlencode(p, quote_via=quote)}"

    url = assemble(params)
    for key in SHEDDABLE:
        if len(url) <= limit:
            break
        params.pop(key, None)
        url = assemble(params)
    return url


if __name__ == "__main__":  # manual check without booting Streamlit
    demo = {
        "query": "Gibt es in der Gemeinde Schwyz Anwohnerparkkarten für Privatpersonen?",
        "decision": "escalate_coverage",
        "reason": "Thema 'parkkarte' erfordert dienstleistung, merkblatt - nicht gefunden.",
        "threshold": 0.82,
        "signals": {"composite": 0.641},
        "escalation_summary": {
            "betreff": "Anwohnerparkkarten für Privatpersonen",
            "offene_punkte": ["Existiert ein Angebot?", "Zuständigkeit klären."],
        },
    }
    print(form_url(demo) or "handoff disabled / no form_url configured")
