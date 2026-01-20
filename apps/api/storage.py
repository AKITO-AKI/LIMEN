import json
import os
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


def _default_db_path() -> str:
    base = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, "limen.db")


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


@dataclass
class SessionSummary:
    session_id: str
    created_at: str
    source_language: Optional[str]
    target_language: Optional[str]
    frames_count: Optional[int]
    duration_sec: Optional[float]


def ensure_db(db_path: Optional[str] = None) -> str:
    path = db_path or os.environ.get("LIMEN_DB_PATH") or _default_db_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with _connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
              session_id TEXT PRIMARY KEY,
              created_at TEXT NOT NULL,
              source_language TEXT,
              target_language TEXT,
              frames_count INTEGER,
              duration_sec REAL,
              payload_json TEXT NOT NULL
            );
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);"
        )

    return path


def _extract_metrics(payload: Dict[str, Any]) -> Tuple[Optional[str], Optional[str], Optional[int], Optional[float], str]:
    source = payload.get("sourceLanguage")
    target = payload.get("targetLanguage")
    created_at = payload.get("createdAt")

    frames_count: Optional[int] = None
    duration_sec: Optional[float] = None

    try:
        frames = payload.get("inputSkeleton", {}).get("frames", [])
        frames_count = int(len(frames))
        if frames_count > 0:
            duration_sec = float(frames[-1].get("t", 0.0))
    except Exception:
        pass

    if not isinstance(created_at, str):
        created_at = datetime.utcnow().isoformat() + "Z"

    return source, target, frames_count, duration_sec, created_at


def save_session(payload: Dict[str, Any], db_path: Optional[str] = None) -> str:
    path = ensure_db(db_path)

    session_id = payload.get("sessionId")
    if not isinstance(session_id, str) or len(session_id) < 8:
        session_id = uuid.uuid4().hex
        payload["sessionId"] = session_id

    source, target, frames_count, duration_sec, created_at = _extract_metrics(payload)

    with _connect(path) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO sessions
              (session_id, created_at, source_language, target_language, frames_count, duration_sec, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (
                session_id,
                created_at,
                source,
                target,
                frames_count,
                duration_sec,
                json.dumps(payload, ensure_ascii=False),
            ),
        )

    return session_id


def list_sessions(limit: int = 50, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    path = ensure_db(db_path)
    limit = max(1, min(200, int(limit)))

    with _connect(path) as conn:
        rows = conn.execute(
            """
            SELECT session_id, created_at, source_language, target_language, frames_count, duration_sec
            FROM sessions
            ORDER BY created_at DESC
            LIMIT ?;
            """,
            (limit,),
        ).fetchall()

    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "sessionId": r["session_id"],
                "createdAt": r["created_at"],
                "sourceLanguage": r["source_language"],
                "targetLanguage": r["target_language"],
                "framesCount": r["frames_count"],
                "durationSec": r["duration_sec"],
            }
        )
    return out


def get_session(session_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    path = ensure_db(db_path)

    with _connect(path) as conn:
        row = conn.execute(
            "SELECT payload_json FROM sessions WHERE session_id = ?;", (session_id,)
        ).fetchone()

    if not row:
        return None

    try:
        return json.loads(row["payload_json"])
    except Exception:
        return None
