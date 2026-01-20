from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from storage import ensure_db, get_session, list_sessions, save_session

app = FastAPI(title="LIMEN API (Stage 1 stub)", version="0.1.0")

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


@app.on_event("startup")
def _startup() -> None:
    ensure_db()


@app.get("/health")
def health():
    return {"ok": True, "service": "limen-api", "stage": 1}


@app.post("/meaning/estimate")
def meaning_estimate(payload: dict):
    source = payload.get("sourceLanguage", "JSL")
    target = payload.get("targetLanguage", "ASL")
    return {
        "schemaVersion": "0.1.0",
        "sourceLanguage": source,
        "targetLanguage": target,
        "intent": "greeting",
        "params": {
            "direction": {"x": 0.0, "y": 0.0, "z": 0.0},
            "intensity": 0.35,
            "tempo": 0.50,
            "politeness": 0.80,
        },
        "confidence": 0.72,
        "rationale": "Stage1 stub: returning a fixed Meaning response.",
        "debug": {"receivedKeys": list(payload.keys())},
    }


@app.post("/session/save")
def session_save(payload: dict):
    if not isinstance(payload, dict) or "schemaVersion" not in payload or "inputSkeleton" not in payload:
        raise HTTPException(status_code=400, detail="Invalid Session payload")

    session_id = save_session(payload)
    return {"sessionId": session_id}


@app.get("/session/list")
def session_list(limit: int = 50):
    limit = max(1, min(200, int(limit)))
    items = list_sessions(limit=limit)
    return {"count": len(items), "items": items}


@app.get("/session/get/{session_id}")
def session_get(session_id: str):
    payload = get_session(session_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return payload
