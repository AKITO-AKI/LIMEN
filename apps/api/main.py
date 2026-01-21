from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from storage import (
    ensure_db,
    get_session,
    get_template,
    list_sessions,
    list_templates,
    save_session,
    save_template,
)


app = FastAPI(title="LIMEN API (Stage 3 prototype)", version="0.1.0")

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
    return {"ok": True, "service": "limen-api", "stage": 3}


@app.on_event("startup")
def _startup():
    ensure_db()


@app.post("/meaning/estimate")
def meaning_estimate(payload: dict):
    """Stage 0: return a schema-shaped dummy Meaning payload.

    The web app will call this endpoint to validate wiring.
    Stage 4 will replace this with real inference.
    """

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
        "rationale": "Stage0 stub: returning a fixed Meaning response.",
        "debug": {"receivedKeys": list(payload.keys())},
    }


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
    """Stage3: store a template payload.

    The payload typically contains:
      - language, intent
      - clipStartSec/clipEndSec
      - keyframes
      - skeletonClip
      - bvhText
    """

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
