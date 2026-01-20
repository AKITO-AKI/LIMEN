# Data contracts

Stage 0 locks a minimal set of contracts so UI, logging, and inference can be built independently.

## 1) Skeleton

A `Skeleton` is a time series of `frames`. Each frame contains joints (2D/3D) and confidence.

- **2.5D is allowed** for MVP: (x, y, z) where z is a relative depth estimate
- Coordinate normalization is Stage 2, but the payload supports both raw and normalized

See: `schemas/skeleton.schema.json` and `schemas/examples/skeleton_sample.json`.

## 2) Meaning

A `Meaning` is a compact, explainable representation:

- `intent`: limited vocabulary (MVP ~10)
- `params`: continuous values such as
  - `direction` (vector)
  - `intensity` (0..1)
  - `tempo` (0..1)
  - `politeness` (0..1)
- `confidence`: overall confidence (0..1)
- `rationale`: short, UI-safe explanation string (no long text)

See: `schemas/meaning.schema.json` and `schemas/examples/meaning_sample.json`.

## 3) Session

A `Session` bundles:

- `inputSkeleton` (required)
- `estimatedMeaning` (optional)
- `outputSkeleton` (optional)
- `meta` (language, device, timestamps)

See: `schemas/session.schema.json` and `schemas/examples/session_sample.json`.
