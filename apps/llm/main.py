from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import FastAPI, Header, HTTPException

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

MODEL_NAME = os.environ.get("LIMEN_MODEL_NAME", "limen-meaning-stub")
MODEL_VERSION = os.environ.get("LIMEN_MODEL_VERSION", "0.0.1")
REQUIRE_API_KEY = bool(os.environ.get("LIMEN_LLM_API_KEY"))

app = FastAPI(title="LIMEN Specialized Model Server (Local)", version=MODEL_VERSION)


def _clamp01(x: Any, default: float = 0.0) -> float:
    try:
        v = float(x)
    except Exception:
        v = float(default)
    if v != v:  # NaN
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


def _require_key(x_api_key: Optional[str]) -> None:
    expected = os.environ.get("LIMEN_LLM_API_KEY")
    if not expected:
        return
    if not x_api_key or x_api_key.strip() != expected.strip():
        raise HTTPException(status_code=401, detail="invalid api key")


def _heuristic_meaning(features: Dict[str, Any]) -> Dict[str, Any]:
    """Deterministic placeholder for a specialized model.

    Uses the same feature keys as LIMEN web/features.ts.
    """

    motion = features.get("motion") if isinstance(features.get("motion"), dict) else {}
    hands = features.get("hands") if isinstance(features.get("hands"), dict) else {}

    tempo = _clamp01(motion.get("speedNorm"), 0.45)
    intensity = _clamp01(motion.get("dispNorm"), 0.35)
    direction = _normalize_direction(motion.get("netDisp"))

    both_ratio = _clamp01(hands.get("bothHandsRatio"), 0.5)

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

    # Keep within the fixed intent set.
    if intent not in INTENTS_11:
        intent = "greeting"
        conf = 0.55

    return {
        "intent": intent,
        "confidence": conf,
        "params": {
            "direction": direction,
            "intensity": intensity,
            "tempo": tempo,
            "politeness": 0.55,
        },
        "rationale": "local stub heuristic (replace with your specialized model)",
        "rationale_short": "stub",
        "debug": {
            "model": MODEL_NAME,
            "modelVersion": MODEL_VERSION,
            "bothHandsRatio": both_ratio,
            "tempo": tempo,
            "intensity": intensity,
        },
    }


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "limen-llm",
        "model": MODEL_NAME,
        "version": MODEL_VERSION,
        "auth": "x-api-key" if REQUIRE_API_KEY else "none",
    }


@app.post("/v1/meaning/estimate")
def meaning_estimate(payload: dict, x_api_key: Optional[str] = Header(default=None)):
    _require_key(x_api_key)

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")

    features = payload.get("features") if isinstance(payload.get("features"), dict) else None
    if features is None:
        raise HTTPException(status_code=400, detail="features is required")

    # Intentionally do NOT accept raw video or full frame series here.
    if "video" in payload or "frames" in payload or "framesRaw" in payload:
        raise HTTPException(status_code=400, detail="raw frames/video not accepted")

    out = _heuristic_meaning(features)
    return {
        "schemaVersion": "0.1.0",
        "intent": out["intent"],
        "confidence": out["confidence"],
        "params": out["params"],
        "rationale": out.get("rationale", ""),
        "rationale_short": out.get("rationale_short", ""),
        "debug": out.get("debug", {}),
    }
