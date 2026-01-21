# Decisions

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

## Stage1 decisions (confirmed)

### Q1. Capture model split

- Use Pose + Hands as split streams (B).

### Q2. Coordinate space

- Store x/y in `normalized` (0..1) for MVP.

### Q3. Depth (z)

- Store z as well (2.5D; treat as relative depth in MVP).

### Q4. MVP intent list

- Keep the initial 11 intents defined in the schema.

### Q5. Early server-side logging

- Implement server session storage early in the prototype (SQLite).

### Q6. UI style

- Simple + functional first ("Blender × VSCode" feel).

### Q7. Storage format

- SQLite (A) as the server session log backend.

### Q8. Recording UX

- Start → Stop → Save (A). Also show a small REC status chip + frame count + elapsed time.

---

## Stage2 decisions (confirmed)

### S2-1. Recording upper bound

- A: keep ~20s cap for MVP stability.

### S2-2. 3-view playback

- A: fixed Front / Side / Top (no free camera yet).

### S2-3. Export priority

- B: prioritize BVH export first.

### S2-4. BVH base rig

- A: minimal MediaPipe-based humanoid (pose-only) rig for MVP.

### S2-5. BVH hands

- A: include hands/fingers in BVH using MediaPipe hand landmarks (aligned to pose wrists).


### S2-6. Arm base (shoulder) rotation stability

- Improve shoulder + torso rotation estimation in BVH export by using a two-axis basis:
  - Torso (Spine/Chest): up axis + shoulder-line axis
  - Shoulders: arm direction + torso-pole axis (shoulder → chest)
- Goal: reduce twist jitter and make arm-root motion look more natural in BVH.

### S2-7. BVH normalization + resampling (MVP quality gate)

- BVH export performs a normalization pipeline before writing the file:
  - Center @ initial hips (root translation preserved relative to that origin)
  - Scale by median shoulder width across the clip (robust to distance-to-camera)
  - Convert to world coordinates in **centimeters** (1 shoulder width ≈ 40cm)
  - Resample to a fixed **30fps** timeline for stable animation playback/editing
- Rationale: produce a BVH that imports cleanly into Blender and stays consistent across recordings.

---

## Stage3 decisions (confirmed)

### T3-1. Template representation

- A: templates are keyframe-oriented at the meaning level (intent + intensity/direction/tempo + a few reference poses).

### T3-2. Template authoring source

- A: templates are authored from clipped ranges of saved sessions.

### T3-3. Template export priority

- B: BVH is the primary export/storage artifact for templates (for practical Blender workflows).
  - A JSON payload is stored alongside BVH for in-app preview and future re-encoding.

### T3-4. UI text minimization

- A: minimize UI text to make future localization easier.
  - Default UI stays icon/short-label first; detailed explanation is opt-in (help toggle).

### T3-5. Multi-language template studio

- A: include a simple language filter/selector for templates (JSL / ASL / CSL).

### T3-X. UX clarity rule (project-wide)

- As user-facing surface area grows, each newly exposed feature should be discoverable and understandable:
  - Provide a clear path (e.g., 1-2-3 steps) and avoid hidden state.
  - Prefer progressive disclosure (help toggle / optional detail) over dense always-on text.
