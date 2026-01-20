from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="LIMEN API (Stage 0 stub)", version="0.1.0")

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
    return {"ok": True, "service": "limen-api", "stage": 0}


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
