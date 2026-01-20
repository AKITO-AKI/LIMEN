# Decisions (Stage 0)

This file records early choices so future changes are intentional.

## D1. 3-pane UI is the default

- Input / Meaning / Output shown together for explainability.

## D2. Privacy-first default

- No raw video storage by default.
- If session recording exists, it must be opt-in + visible.

## D3. Contracts first

- JSON Schemas are the source of truth for inter-module data.

## D4. MVP Meaning is "Intent + parameters"

- Limited intent set for robust early demo.
- Expand later when data/model improves.

---

## Open decisions (please answer)

These block Stage 1/2 design unless we pick defaults.

1) **JointSet baseline**
   - Option A: `mediapipe_holistic_v1` (hands + pose + face)
   - Option B: `mediapipe_pose_v1` + `mediapipe_hands_v1` (split streams)

2) **Coordinate space for stored Skeleton**
   - Option A: `normalized` (0..1 image space)
   - Option B: `pixel` (raw image pixels)
   - Option C: `world` (model-specific world coords)

3) **Depth (z) treatment in MVP**
   - Option A: keep MediaPipe's relative z (2.5D)
   - Option B: ignore z until later

4) **MVP intent list**
   - Confirm the initial set (10-ish) used in `schemas/meaning.schema.json`, or replace with your preferred list.
