# Stage 0 (Scaffold) definition

Stage 0's job is to make later stages easier by locking:

- **Data contracts** (what flows between modules)
- **UI skeleton** (3-pane layout)
- **Privacy defaults** (no raw video storage by default)

## Deliverables

1) Repo scaffold (web + api stub)
2) JSON Schemas + examples:
   - `Skeleton` (time series of joints)
   - `Meaning` (intent + continuous parameters)
   - `Session` (a bundle of skeleton + meaning + metadata)
3) UI shell (placeholders for Stage 1+)
4) Baseline docs (architecture, privacy, decisions)

## Out of scope (Stage 0)

- Real WebRTC camera integration
- Real MediaPipe inference
- Real Meaning inference model
- Auth / user accounts

## Stage 0 gate (done definition)

- `npm install` succeeds at repo root
- Web app starts and shows 3 panes
- JSON schema validation is possible (schemas are complete and examples conform)
- Privacy baseline doc exists and matches implementation assumptions
