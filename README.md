# LIMEN (Language-Independent Motion ENcoder)

LIMEN is a sign-language bridge that focuses on **skeleton UI** and **explainable conversion**:

- **Motion → Meaning Layer → Motion**
- Keep nuances (direction / intensity / tempo) as parameters
- Prefer **skeletal representation** over avatar styling

This repository is the **Stage 1** prototype (built on the Stage0 scaffold).

## Repo structure

- `apps/web` — Frontend (TypeScript + React + Vite)
- `apps/api` — Backend stub (Python + FastAPI)
- `schemas` — JSON Schemas and example payloads
- `docs` — Stage notes (architecture, privacy, data contracts)

## Quick start

### 1) Install dependencies

From repo root:

```bash
npm install
```

### 2) Run web app

```bash
npm run dev:web
```

Open the shown URL (usually `http://localhost:5173`).

### 3) Run API stub (optional)

In another terminal:

```bash
npm run dev:api
```

API runs on `http://localhost:8000`.

## Stage 1 features

- WebRTC camera preview + MediaPipe (Pose + Hands)
- Overlay skeleton drawing (normalized x/y, z kept)
- Recording UX: **Start → Stop → Save Session**
- Server session logging (SQLite): list + load sessions

## Stage 0 goals (kept)

- Lock **data contracts** early (Skeleton / Meaning / Session)
- Provide a **3-pane UI shell** (Input / Meaning / Output)
- Establish **privacy baseline**: do not store raw video by default
- Keep the architecture ready for Stage 1+ (camera + MediaPipe, then logging, then Meaning Layer)

## Notes

- The API is intentionally a stub: it returns a dummy Meaning response.
- The web UI is a shell with placeholders; Stage 1 replaces input/output placeholders with real skeleton streams.

