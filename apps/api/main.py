from __future__ import annotations

import json
import os
import time
import urllib.request
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from storage import (
    ensure_db,
    find_latest_template,
    get_run,
    get_session,
    get_template,
    list_runs,
    list_sessions,
    list_templates,
    save_run,
    save_session,
    save_template,
)


INTENTS_11 = {
    "greeting",
    "introduce_self",
    "thanks",
    "sorry",
    "help",
    "request",
    "slow_down",
    "where",
    "warning",
    "yes",
    "no",
}


def _load_allowed_intents() -> set[str]:
    """Load allowed intent IDs.

    MVP: fixed 11 intents.
    Future: expand by editing apps/api/intent_registry.json.
    """

    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "intent_registry.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        intents = set(str(x).strip() for x in (data.get("intents") or []) if str(x).strip())
        intents.add("unknown")
        return intents
    except Exception:
        s = set(INTENTS_11)
        s.add("unknown")
        return s


ALLOWED_INTENTS = _load_allowed_intents()


app = FastAPI(title="LIMEN API (Stage 4 MVP)", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "service": "limen-api", "stage": 4}


@app.on_event("startup")
def _startup():
    ensure_db()


def _clamp01(x: Any, default: float = 0.0) -> float:
    try:
        v = float(x)
    except Exception:
        v = float(default)
    if v != v:
        v = float(default)
    return max(0.0, min(1.0, v))


def _normalize_direction(d: Any) -> Dict[str, float]:
    if not isinstance(d, dict):
        return {"x": 0.0, "y": 0.0, "z": 0.0}
    return {
        "x": float(d.get("x", 0.0) or 0.0),
        "y": float(d.get("y", 0.0) or 0.0),
        "z": float(d.get("z", 0.0) or 0.0),
    }


def _validate_meaning(obj: Any, source: str, target: str) -> Dict[str, Any]:
    """Strict Meaning JSON validation (D4-3).

    MVP: keep intent within the fixed 11 (+ 'unknown') set.
    Future: expand ALLOWED_INTENTS via intent_registry.json.
    """

    if not isinstance(obj, dict):
        raise ValueError("meaning must be an object")

    intent = str(obj.get("intent") or "").strip()
    if intent not in ALLOWED_INTENTS:
        raise ValueError(f"unsupported_intent:{intent}")

    params = obj.get("params") if isinstance(obj.get("params"), dict) else {}

    out: Dict[str, Any] = {
        "schemaVersion": "0.1.0",
        "sourceLanguage": source,
        "targetLanguage": target,
        "intent": intent,
        "params": {
            "direction": _normalize_direction(params.get("direction")),
            "intensity": _clamp01(params.get("intensity"), 0.35),
            "tempo": _clamp01(params.get("tempo"), 0.5),
            "politeness": _clamp01(params.get("politeness"), 0.5),
        },
        "confidence": _clamp01(obj.get("confidence"), 0.6),
        "rationale": str(obj.get("rationale") or ""),
        "debug": obj.get("debug") if isinstance(obj.get("debug"), dict) else {},
    }
    return out


def _heuristic_meaning(features: Dict[str, Any], source: str, target: str) -> Dict[str, Any]:
    """Deterministic fallback classifier.

    This is NOT the final "specialized LLM"—it exists so the full workflow can run
    end-to-end without external dependencies.
    """

    motion = features.get("motion") if isinstance(features.get("motion"), dict) else {}
    hands = features.get("hands") if isinstance(features.get("hands"), dict) else {}

    tempo = _clamp01(motion.get("speedNorm"), 0.45)
    intensity = _clamp01(motion.get("dispNorm"), 0.35)
    direction = _normalize_direction(motion.get("netDisp"))

    both_ratio = _clamp01(hands.get("bothHandsRatio"), 0.5)

    # Very simple intent rules (upgrade later with the specialized LLM).
    intent = "greeting"
    conf = 0.62

    if both_ratio > 0.7 and intensity > 0.6:
        intent = "warning"
        conf = 0.70
    elif both_ratio > 0.6 and tempo < 0.35:
        intent = "thanks"
        conf = 0.66
    elif tempo > 0.7 and intensity > 0.55:
        intent = "request"
        conf = 0.64
    elif both_ratio < 0.35 and intensity < 0.25:
        intent = "yes"
        conf = 0.60
    elif both_ratio < 0.35 and intensity >= 0.25:
        intent = "no"
        conf = 0.60

    return {
        "schemaVersion": "0.1.0",
        "sourceLanguage": source,
        "targetLanguage": target,
        "intent": intent,
        "params": {
            "direction": direction,
            "intensity": intensity,
            "tempo": tempo,
            "politeness": 0.55,
        },
        "confidence": conf,
        "rationale": "heuristic fallback (set LIMEN_LLM_ENDPOINT to use a specialized model)",
        "debug": {
            "bothHandsRatio": both_ratio,
            "tempo": tempo,
            "intensity": intensity,
        },
    }


def _call_llm_endpoint(endpoint: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Call an external specialized model endpoint.

    The endpoint must return a Meaning-shaped JSON.
    
    Optional:
      - LIMEN_LLM_API_KEY: sent as X-API-Key
      - LIMEN_LLM_TIMEOUT_SEC: request timeout (default 8)
    """

    try:
        data = json.dumps(payload).encode("utf-8")
        headers: Dict[str, str] = {"content-type": "application/json"}
        api_key = str(os.environ.get("LIMEN_LLM_API_KEY") or "").strip()
        if api_key:
            headers["X-API-Key"] = api_key

        try:
            timeout = float(os.environ.get("LIMEN_LLM_TIMEOUT_SEC") or 8)
        except Exception:
            timeout = 8

        req = urllib.request.Request(
            endpoint,
            data=data,
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
        return json.loads(raw)
    except Exception:
        return None


@app.post("/meaning/estimate")
def meaning_estimate(payload: dict):
    """Stage4: estimate Meaning from a fixed-length feature summary (D4-2).

    Request expects:
      - sourceLanguage, targetLanguage
      - features: {motion, hands, ...}

    For MVP stability, if LIMEN_LLM_ENDPOINT is not set (or fails), we fall back to
    a deterministic heuristic.
    """

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")

    source = str(payload.get("sourceLanguage") or "JSL")
    target = str(payload.get("targetLanguage") or "ASL")

    features = payload.get("features") if isinstance(payload.get("features"), dict) else {}

    llm_endpoint = str(os.environ.get("LIMEN_LLM_ENDPOINT") or "").strip()

    llm_debug: Dict[str, Any] = {}

    if llm_endpoint:
        llm_in = {
            "schemaVersion": "0.1.0",
            "sourceLanguage": source,
            "targetLanguage": target,
            "features": features,
        }
        llm_out = _call_llm_endpoint(llm_endpoint, llm_in)
        if llm_out is None:
            llm_debug = {
                "llmEndpoint": llm_endpoint,
                "llmUsed": False,
                "llmMode": "fallback",
                "llmError": "call_failed",
            }
        else:
            try:
                validated = _validate_meaning(llm_out, source, target)
                validated.setdefault("debug", {})
                validated["debug"].update(
                    {
                        "llmEndpoint": llm_endpoint,
                        "llmUsed": True,
                        "llmMode": "external",
                    }
                )
                return validated
            except Exception as e:
                err = str(e)
                # If the model produced an intent that isn't supported yet, do NOT
                # reclassify with heuristics (that would hide the mismatch). Return
                # intent='unknown' and let the UI/logs explain the block.
                if err.startswith("unsupported_intent:"):
                    raw_intent = str(llm_out.get("intent") or "").strip()
                    params = llm_out.get("params") if isinstance(llm_out.get("params"), dict) else {}
                    unknown = {
                        "intent": "unknown",
                        "confidence": 0.0,
                        "params": {
                            "direction": _normalize_direction(params.get("direction")),
                            "intensity": _clamp01(params.get("intensity"), 0.35),
                            "tempo": _clamp01(params.get("tempo"), 0.5),
                            "politeness": _clamp01(params.get("politeness"), 0.5),
                        },
                        "rationale": f"unsupported intent from model: {raw_intent}",
                        "debug": {
                            "llmEndpoint": llm_endpoint,
                            "llmUsed": False,
                            "llmMode": "external_rejected",
                            "llmUnsupportedIntent": raw_intent,
                            "llmRejectedReason": err,
                        },
                    }
                    return _validate_meaning(unknown, source, target)

                # Fall back, but record why the LLM response was rejected.
                llm_debug = {
                    "llmEndpoint": llm_endpoint,
                    "llmUsed": False,
                    "llmMode": "fallback",
                    "llmRejectedReason": err,
                }

    try:
        out = _heuristic_meaning(features, source, target)
        validated = _validate_meaning(out, source, target)
        validated.setdefault("debug", {})
        if llm_debug:
            validated["debug"].update(llm_debug)
        return validated
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/session/save")
def session_save(payload: dict):
    """Stage1+: store a session payload in SQLite.

    We store *only* skeleton + derived data; raw video is not accepted here.
    """

    try:
        session_id = save_session(payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "sessionId": session_id}


@app.get("/session/list")
def session_list(limit: int = 30, offset: int = 0):
    items = list_sessions(limit=limit, offset=offset)
    return {"items": items}


@app.get("/session/get/{session_id}")
def session_get(session_id: str):
    payload = get_session(session_id)
    if not payload:
        raise HTTPException(status_code=404, detail="session not found")
    return payload


# --- Templates (Stage3) ---


@app.post("/template/save")
def template_save(payload: dict):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")

    try:
        template_id = save_template(payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"ok": True, "templateId": template_id}


@app.get("/template/list")
def template_list(limit: int = 50, offset: int = 0, language: str = ""):
    items = list_templates(limit=limit, offset=offset, language=language)
    return {"items": items}


@app.get("/template/get/{template_id}")
def template_get(template_id: str):
    payload = get_template(template_id)
    if not payload:
        raise HTTPException(status_code=404, detail="template not found")
    return payload


@app.get("/template/find")
def template_find(language: str, intent: str):
    template_id = find_latest_template(language=language, intent=intent)
    return {"templateId": template_id}


# --- Runs (Stage6: transparency logs) ---


@app.post("/run/save")
def run_save(payload: dict):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")

    # Basic sanity check: do not accept raw video.
    if "video" in payload or "framesRaw" in payload:
        raise HTTPException(status_code=400, detail="raw video is not accepted")

    try:
        run_id = save_run(payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"ok": True, "runId": run_id}


@app.get("/run/list")
def run_list(limit: int = 50, offset: int = 0):
    items = list_runs(limit=limit, offset=offset)
    return {"items": items}


@app.get("/run/get/{run_id}")
def run_get(run_id: str):
    payload = get_run(run_id)
    if not payload:
        raise HTTPException(status_code=404, detail="run not found")
    return payload
