import json
import os
import sqlite3
from typing import Any, Dict, List, Optional


def _default_db_path() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "data", "limen.db")


DB_PATH = os.environ.get("LIMEN_DB_PATH", _default_db_path())


def ensure_db() -> None:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
              session_id TEXT PRIMARY KEY,
              created_at TEXT,
              source_language TEXT,
              target_language TEXT,
              frames_count INTEGER,
              duration_sec REAL,
              payload_json TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _conn() -> sqlite3.Connection:
    return sqlite3.connect(DB_PATH)


def save_session(payload: Dict[str, Any]) -> str:
    """Insert or replace a full session payload."""

    session_id = str(payload.get("sessionId") or "").strip()
    if not session_id:
        raise ValueError("sessionId is required")

    created_at = str(payload.get("createdAt") or "")
    source_language = str(payload.get("sourceLanguage") or "")
    target_language = str(payload.get("targetLanguage") or "")

    # Derive light metadata for listing.
    frames = (
        payload.get("inputSkeleton", {})
        .get("frames", [])
        if isinstance(payload.get("inputSkeleton"), dict)
        else []
    )
    frames_count = int(len(frames)) if isinstance(frames, list) else 0
    duration_sec = 0.0
    try:
        if frames_count >= 2:
            duration_sec = float(frames[-1].get("t", 0.0))
    except Exception:
        duration_sec = 0.0

    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

    conn = _conn()
    try:
        conn.execute(
            """
            INSERT INTO sessions (
              session_id, created_at, source_language, target_language,
              frames_count, duration_sec, payload_json
            ) VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(session_id) DO UPDATE SET
              created_at=excluded.created_at,
              source_language=excluded.source_language,
              target_language=excluded.target_language,
              frames_count=excluded.frames_count,
              duration_sec=excluded.duration_sec,
              payload_json=excluded.payload_json
            """,
            (
                session_id,
                created_at,
                source_language,
                target_language,
                frames_count,
                duration_sec,
                raw,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return session_id


def list_sessions(limit: int = 30, offset: int = 0) -> List[Dict[str, Any]]:
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))

    conn = _conn()
    try:
        cur = conn.execute(
            """
            SELECT session_id, created_at, source_language, target_language,
                   frames_count, duration_sec
            FROM sessions
            ORDER BY created_at DESC, rowid DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )
        items = []
        for row in cur.fetchall():
            items.append(
                {
                    "sessionId": row[0],
                    "createdAt": row[1],
                    "sourceLanguage": row[2],
                    "targetLanguage": row[3],
                    "framesCount": row[4],
                    "durationSec": row[5],
                }
            )
        return items
    finally:
        conn.close()


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    conn = _conn()
    try:
        cur = conn.execute(
            "SELECT payload_json FROM sessions WHERE session_id=?",
            (session_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        try:
            return json.loads(row[0])
        except Exception:
            return None
    finally:
        conn.close()
