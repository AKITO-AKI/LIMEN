import json
import os
import sqlite3
import uuid
from typing import Any, Dict, List, Optional


def _default_db_path() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "data", "limen.db")


DB_PATH = os.environ.get("LIMEN_DB_PATH", _default_db_path())


def ensure_db() -> None:
    """Create required tables if missing."""

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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS templates (
              template_id TEXT PRIMARY KEY,
              created_at TEXT,
              language TEXT,
              intent TEXT,
              duration_sec REAL,
              keyframes_count INTEGER,
              source_session_id TEXT,
              clip_start_sec REAL,
              clip_end_sec REAL,
              payload_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runs (
              run_id TEXT PRIMARY KEY,
              created_at TEXT,
              source_language TEXT,
              target_language TEXT,
              source_session_id TEXT,
              selected_template_id TEXT,
              intent TEXT,
              confidence REAL,
              payload_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_templates_created_at ON templates(created_at);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_templates_language_intent ON templates(language, intent);"
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
        payload.get("inputSkeleton", {}).get("frames", [])
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


# --- Templates (Stage3) ---


def save_template(payload: Dict[str, Any]) -> str:
    """Insert or replace a template payload.

    Expected shape is flexible, but should include:
      - language (e.g. JSL/ASL/CSL)
      - intent
      - clipStartSec / clipEndSec
      - keyframes (array)
      - skeletonClip (object)
      - bvhText (string)
    """

    template_id = str(payload.get("templateId") or "").strip()
    if not template_id:
        template_id = uuid.uuid4().hex
        payload["templateId"] = template_id

    created_at = str(payload.get("createdAt") or "")
    language = str(payload.get("language") or "")
    intent = str(payload.get("intent") or "")

    clip_start = payload.get("clipStartSec")
    clip_end = payload.get("clipEndSec")
    try:
        clip_start_sec = float(clip_start) if clip_start is not None else 0.0
    except Exception:
        clip_start_sec = 0.0
    try:
        clip_end_sec = float(clip_end) if clip_end is not None else 0.0
    except Exception:
        clip_end_sec = 0.0

    duration_sec = max(0.0, clip_end_sec - clip_start_sec)

    keyframes = payload.get("keyframes")
    keyframes_count = int(len(keyframes)) if isinstance(keyframes, list) else 0

    source_session_id = str(payload.get("sourceSessionId") or "")

    payload2 = dict(payload)
    payload2["templateId"] = template_id
    raw = json.dumps(payload2, ensure_ascii=False, separators=(",", ":"))

    conn = _conn()
    try:
        conn.execute(
            """
            INSERT INTO templates (
              template_id, created_at, language, intent,
              duration_sec, keyframes_count,
              source_session_id, clip_start_sec, clip_end_sec,
              payload_json
            ) VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(template_id) DO UPDATE SET
              created_at=excluded.created_at,
              language=excluded.language,
              intent=excluded.intent,
              duration_sec=excluded.duration_sec,
              keyframes_count=excluded.keyframes_count,
              source_session_id=excluded.source_session_id,
              clip_start_sec=excluded.clip_start_sec,
              clip_end_sec=excluded.clip_end_sec,
              payload_json=excluded.payload_json
            """,
            (
                template_id,
                created_at,
                language,
                intent,
                duration_sec,
                keyframes_count,
                source_session_id,
                clip_start_sec,
                clip_end_sec,
                raw,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return template_id


def list_templates(limit: int = 50, offset: int = 0, language: str = "") -> List[Dict[str, Any]]:
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))

    conn = _conn()
    try:
        if language:
            cur = conn.execute(
                """
                SELECT template_id, created_at, language, intent,
                       duration_sec, keyframes_count, source_session_id
                FROM templates
                WHERE language=?
                ORDER BY created_at DESC, rowid DESC
                LIMIT ? OFFSET ?
                """,
                (language, limit, offset),
            )
        else:
            cur = conn.execute(
                """
                SELECT template_id, created_at, language, intent,
                       duration_sec, keyframes_count, source_session_id
                FROM templates
                ORDER BY created_at DESC, rowid DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            )

        items: List[Dict[str, Any]] = []
        for row in cur.fetchall():
            items.append(
                {
                    "templateId": row[0],
                    "createdAt": row[1],
                    "language": row[2],
                    "intent": row[3],
                    "durationSec": row[4],
                    "keyframesCount": row[5],
                    "sourceSessionId": row[6],
                }
            )
        return items
    finally:
        conn.close()


def find_latest_template(language: str, intent: str) -> Optional[str]:
    """Return latest template_id for (language, intent), if any."""

    language = str(language or '').strip()
    intent = str(intent or '').strip()
    if not language or not intent:
        return None

    conn = _conn()
    try:
        cur = conn.execute(
            """
            SELECT template_id
            FROM templates
            WHERE language=? AND intent=?
            ORDER BY created_at DESC, rowid DESC
            LIMIT 1
            """,
            (language, intent),
        )
        row = cur.fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def get_template(template_id: str) -> Optional[Dict[str, Any]]:
    conn = _conn()
    try:
        cur = conn.execute(
            "SELECT payload_json FROM templates WHERE template_id=?",
            (template_id,),
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


# --- Runs (Stage4+) ---


def save_run(payload: Dict[str, Any]) -> str:
    """Insert or replace a run payload.

    A run represents one end-to-end inference + reconstruction attempt.
    """

    run_id = str(payload.get("runId") or "").strip()
    if not run_id:
        run_id = uuid.uuid4().hex
        payload["runId"] = run_id

    created_at = str(payload.get("createdAt") or "")
    source_language = str(payload.get("sourceLanguage") or "")
    target_language = str(payload.get("targetLanguage") or "")
    source_session_id = str(payload.get("sourceSessionId") or "")
    selected_template_id = str(payload.get("selectedTemplateId") or "")

    meaning = payload.get("meaning") if isinstance(payload.get("meaning"), dict) else {}
    intent = str(meaning.get("intent") or "")
    try:
        confidence = float(meaning.get("confidence"))
    except Exception:
        confidence = 0.0

    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

    conn = _conn()
    try:
        conn.execute(
            """
            INSERT INTO runs (
              run_id, created_at, source_language, target_language,
              source_session_id, selected_template_id,
              intent, confidence,
              payload_json
            ) VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(run_id) DO UPDATE SET
              created_at=excluded.created_at,
              source_language=excluded.source_language,
              target_language=excluded.target_language,
              source_session_id=excluded.source_session_id,
              selected_template_id=excluded.selected_template_id,
              intent=excluded.intent,
              confidence=excluded.confidence,
              payload_json=excluded.payload_json
            """,
            (
                run_id,
                created_at,
                source_language,
                target_language,
                source_session_id,
                selected_template_id,
                intent,
                confidence,
                raw,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return run_id


def list_runs(limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))

    conn = _conn()
    try:
        cur = conn.execute(
            """
            SELECT run_id, created_at, source_language, target_language,
                   source_session_id, selected_template_id,
                   intent, confidence,
                   payload_json
            FROM runs
            ORDER BY created_at DESC, rowid DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )
        items: List[Dict[str, Any]] = []
        for row in cur.fetchall():
            status = ""
            reason = ""
            try:
                payload = json.loads(row[8]) if row[8] else {}
                res = payload.get("result") if isinstance(payload, dict) else None
                if isinstance(res, dict):
                    status = str(res.get("status") or "").strip()
                    reason = str(res.get("reason") or "").strip()
            except Exception:
                pass
            items.append(
                {
                    "runId": row[0],
                    "createdAt": row[1],
                    "sourceLanguage": row[2],
                    "targetLanguage": row[3],
                    "sourceSessionId": row[4],
                    "selectedTemplateId": row[5],
                    "intent": row[6],
                    "confidence": row[7],
                    "status": status,
                    "reason": reason,
                }
            )
        return items
    finally:
        conn.close()


def get_run(run_id: str) -> Optional[Dict[str, Any]]:
    conn = _conn()
    try:
        cur = conn.execute(
            "SELECT payload_json FROM runs WHERE run_id=?",
            (run_id,),
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
