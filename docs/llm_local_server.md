# Local specialized model server (dev)

This repo supports running a *separate* “specialized model” server locally on the same machine (different port), and letting the LIMEN API call it.

## Start the services

### 1) Start the model server (port 9100)

```bash
npm run setup:llm
npm run dev:llm
```

Check:
- http://127.0.0.1:9100/health

### 2) Start the LIMEN API (port 8000)

In a new terminal:

```bash
npm run setup:api
# Set the endpoint LIMEN API should call:
# Windows PowerShell:
#   $env:LIMEN_LLM_ENDPOINT = "http://127.0.0.1:9100/v1/meaning/estimate"
# macOS/Linux:
#   export LIMEN_LLM_ENDPOINT="http://127.0.0.1:9100/v1/meaning/estimate"

npm run dev:api
```

### 3) Start the web app

```bash
npm run dev:web
```

## Optional: API key

If you set `LIMEN_LLM_API_KEY`, the model server will require `X-API-Key` and the LIMEN API will automatically forward it.

- Model server terminal:
  - set `LIMEN_LLM_API_KEY=...` before starting
- LIMEN API terminal:
  - set the *same* `LIMEN_LLM_API_KEY=...`

## Notes

- The model server intentionally rejects raw frames/video.
- It accepts only fixed-length feature summaries (privacy + stability).
- Current implementation is a deterministic stub; replace the logic in `apps/llm/main.py` when the real model is ready.
