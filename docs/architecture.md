# Architecture (MVP direction)

## High level

- **Frontend** (browser)
  - WebRTC camera input (Stage 1)
  - Skeleton inference (MediaPipe, Stage 1)
  - Rendering (Canvas/WebGL)
  - Session logging (Stage 2)
  - Meaning visualization (Stage 4)

- **Backend** (API)
  - Meaning estimation (Stage 4)
  - Motion re-encoding / generation (Stage 5)
  - Optional session storage, if user opts in (Stage 2/6)

## Why 3 panes

- **Input**: what the user did (skeleton)
- **Meaning**: what the system thinks it means (intent + parameters)
- **Output**: what the system produces in target language (skeleton)

This makes the pipeline explainable and debuggable from day one.

## Data contracts (Stage 0)

See `docs/data-contracts.md` and the JSON schemas in `schemas/`.

## Versioning

- Schemas are versioned with a `schemaVersion` field.
- Any breaking change increments the schema version and updates examples.
