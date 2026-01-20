# Privacy baseline (Stage 0)

This MVP defaults to **privacy-first**:

## Default rules

1) **Raw camera video is not stored**.
2) The system works mainly with **skeleton points and derived features**.
3) If we ever store a session, it must be **explicit opt-in** and clearly shown in UI.

## What we store in Stage 0

- Nothing by default.

## What we plan to store in Stage 2 (optional)

- Skeleton time series
- Meaning layer outputs
- Minimal metadata (timestamps, app version, device hints)

## What we intentionally avoid

- Face identity features, voice, raw frames, or background images.

## UI implications

- If recording is enabled, show an obvious indicator and provide a one-click stop.
- Provide a "delete session" action (Stage 2+) and make export formats clear.
