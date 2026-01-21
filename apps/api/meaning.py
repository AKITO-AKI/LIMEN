from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


@dataclass
class Vec3:
    x: float
    y: float
    z: float

    def __sub__(self, other: "Vec3") -> "Vec3":
        return Vec3(self.x - other.x, self.y - other.y, self.z - other.z)

    def mag(self) -> float:
        return math.sqrt(self.x * self.x + self.y * self.y + self.z * self.z)

    def norm(self) -> "Vec3":
        m = self.mag()
        if m <= 1e-9:
            return Vec3(0.0, 0.0, 0.0)
        return Vec3(self.x / m, self.y / m, self.z / m)


def _get_joint(frame: Dict[str, Any], key: str) -> Optional[Vec3]:
    j = (frame.get("joints") or {}).get(key)
    if not isinstance(j, dict):
        return None
    try:
        x = float(j.get("x"))
        y = float(j.get("y"))
        z = float(j.get("z", 0.0))
        return Vec3(x, y, z)
    except Exception:
        return None


def _frame_times(frames: List[Dict[str, Any]]) -> List[float]:
    ts: List[float] = []
    for i, f in enumerate(frames):
        t = f.get("t")
        if isinstance(t, (int, float)):
            ts.append(float(t))
        else:
            ts.append(i / 30.0)
    return ts


def _speeds(frames: List[Dict[str, Any]], joint_key: str) -> List[float]:
    ts = _frame_times(frames)
    speeds: List[float] = []

    prev_p: Optional[Vec3] = None
    prev_t: Optional[float] = None

    for i, f in enumerate(frames):
        p = _get_joint(f, joint_key)
        if p is None:
            continue
        t = ts[i]
        if prev_p is not None and prev_t is not None:
            dt = max(1e-6, t - prev_t)
            speeds.append((p - prev_p).mag() / dt)
        prev_p = p
        prev_t = t

    return speeds


def _std(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = sum(values) / len(values)
    var = sum((v - m) ** 2 for v in values) / (len(values) - 1)
    return math.sqrt(max(0.0, var))


def _zero_crossings(values: List[float]) -> int:
    prev = 0
    n = 0
    for v in values:
        s = 1 if v > 0 else (-1 if v < 0 else 0)
        if s == 0:
            continue
        if prev != 0 and s != prev:
            n += 1
        prev = s
    return n


def _start_end_delta(frames: List[Dict[str, Any]], key: str) -> Optional[Vec3]:
    first: Optional[Vec3] = None
    last: Optional[Vec3] = None
    for f in frames:
        p = _get_joint(f, key)
        if p is None:
            continue
        if first is None:
            first = p
        last = p
    if first is None or last is None:
        return None
    return last - first


def _avg_joint_y(frames: List[Dict[str, Any]], key: str) -> Optional[float]:
    acc = 0.0
    n = 0
    for f in frames:
        p = _get_joint(f, key)
        if p is None:
            continue
        acc += p.y
        n += 1
    if n == 0:
        return None
    return acc / n


def estimate_meaning(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Stage4 MVP heuristic Meaning Layer.

    The goal is: always return a valid Meaning object and *roughly* reflect motion.
    Accuracy is intentionally modest; we iterate later.
    """

    source = payload.get("sourceLanguage", "JSL")
    target = payload.get("targetLanguage", "ASL")

    sk = payload.get("inputSkeleton") or {}
    frames = sk.get("frames") or []

    if not isinstance(frames, list) or len(frames) < 2:
        return {
            "schemaVersion": "0.1.0",
            "sourceLanguage": source,
            "targetLanguage": target,
            "intent": "request",
            "params": {
                "direction": {"x": 0.0, "y": 0.0, "z": 0.0},
                "intensity": 0.2,
                "tempo": 0.2,
                "politeness": 0.7,
            },
            "confidence": 0.4,
            "rationale": "Not enough frames; fallback.",
            "debug": {"frames": len(frames)},
        }

    lw_key = "POSE_LEFT_WRIST"
    rw_key = "POSE_RIGHT_WRIST"
    nose_key = "POSE_NOSE"
    lsh_key = "POSE_LEFT_SHOULDER"
    rsh_key = "POSE_RIGHT_SHOULDER"

    lw_speeds = _speeds(frames, lw_key)
    rw_speeds = _speeds(frames, rw_key)

    avg_lw = sum(lw_speeds) / len(lw_speeds) if lw_speeds else 0.0
    avg_rw = sum(rw_speeds) / len(rw_speeds) if rw_speeds else 0.0
    dom_key = lw_key if avg_lw >= avg_rw else rw_key

    # Direction: dominant wrist start→end
    d = _start_end_delta(frames, dom_key)
    direction = d.norm() if d is not None else Vec3(0.0, 0.0, 0.0)

    all_speeds = sorted(lw_speeds + rw_speeds)
    mean_speed = sum(all_speeds) / len(all_speeds) if all_speeds else 0.0
    p90 = all_speeds[int(0.9 * (len(all_speeds) - 1))] if len(all_speeds) >= 2 else mean_speed

    # Tuned for normalized coordinates
    tempo = _clamp(mean_speed / 1.2)
    intensity = _clamp(p90 / 2.0)

    # Politeness: calmer + hands closer to chest
    chest: Optional[Vec3] = None
    for f in frames:
        lsh = _get_joint(f, lsh_key)
        rsh = _get_joint(f, rsh_key)
        if lsh and rsh:
            chest = Vec3((lsh.x + rsh.x) / 2.0, (lsh.y + rsh.y) / 2.0, (lsh.z + rsh.z) / 2.0)
            break

    closeness = 0.0
    if chest is not None:
        acc = 0.0
        n = 0
        for f in frames:
            p = _get_joint(f, dom_key)
            if p is None:
                continue
            acc += (p - chest).mag()
            n += 1
        if n:
            closeness = _clamp(1.0 - (acc / n) / 0.8)

    politeness = _clamp(0.7 + 0.3 * closeness - 0.5 * intensity - 0.2 * tempo)

    # Head motion: yes/no baseline
    nose_x: List[float] = []
    nose_y: List[float] = []
    for f in frames:
        n = _get_joint(f, nose_key)
        if n is None:
            continue
        nose_x.append(n.x)
        nose_y.append(n.y)

    head_shake = _std(nose_x)
    head_nod = _std(nose_y)

    # Wave detection: dominant wrist x-velocity sign changes
    ts = _frame_times(frames)
    vx: List[float] = []
    prev_p: Optional[Vec3] = None
    prev_t: Optional[float] = None
    for i, f in enumerate(frames):
        p = _get_joint(f, dom_key)
        if p is None:
            continue
        t = ts[i]
        if prev_p is not None and prev_t is not None:
            dt = max(1e-6, t - prev_t)
            vx.append((p.x - prev_p.x) / dt)
        prev_p = p
        prev_t = t

    wave_zc = _zero_crossings(vx)

    # A few extra coarse cues
    lw_delta = _start_end_delta(frames, lw_key)
    rw_delta = _start_end_delta(frames, rw_key)
    both_down = False
    if lw_delta is not None and rw_delta is not None:
        # +y is "down" in screen coords
        both_down = (lw_delta.y > 0.08) and (rw_delta.y > 0.08)

    hands_apart = False
    # average separation between wrists
    sep_acc = 0.0
    sep_n = 0
    for f in frames:
        lw = _get_joint(f, lw_key)
        rw = _get_joint(f, rw_key)
        if lw is None or rw is None:
            continue
        sep_acc += abs(lw.x - rw.x)
        sep_n += 1
    if sep_n:
        hands_apart = (sep_acc / sep_n) > 0.45

    intent = "request"
    confidence = 0.55
    rationale = "Default: request"

    if head_nod > 0.035 and head_shake < 0.03:
        intent = "yes"
        confidence = 0.75
        rationale = "Head nod detected"
    elif head_shake > 0.04 and head_nod < 0.03:
        intent = "no"
        confidence = 0.75
        rationale = "Head shake detected"
    elif wave_zc >= 4 and tempo >= 0.25:
        intent = "greeting"
        confidence = 0.70
        rationale = "Wrist wave detected"
    elif both_down and tempo < 0.35 and intensity < 0.45:
        intent = "slow_down"
        confidence = 0.65
        rationale = "Both hands moved down slowly"
    elif intensity > 0.75 and tempo > 0.45:
        intent = "warning"
        confidence = 0.62
        rationale = "High intensity motion"
    elif closeness > 0.55 and intensity < 0.45 and tempo < 0.55:
        intent = "thanks"
        confidence = 0.60
        rationale = "Calm motion near chest"
    elif hands_apart and tempo < 0.6:
        intent = "where"
        confidence = 0.58
        rationale = "Hands apart posture"

    return {
        "schemaVersion": "0.1.0",
        "sourceLanguage": source,
        "targetLanguage": target,
        "intent": intent,
        "params": {
            "direction": {"x": float(direction.x), "y": float(direction.y), "z": float(direction.z)},
            "intensity": float(intensity),
            "tempo": float(tempo),
            "politeness": float(politeness),
        },
        "confidence": float(confidence),
        "rationale": rationale,
        "debug": {
            "frames": len(frames),
            "domKey": dom_key,
            "avgSpeedL": avg_lw,
            "avgSpeedR": avg_rw,
            "p90Speed": p90,
            "headNod": head_nod,
            "headShake": head_shake,
            "waveZeroCross": wave_zc,
            "closeness": closeness,
            "handsApart": hands_apart,
            "bothDown": both_down,
        },
    }
