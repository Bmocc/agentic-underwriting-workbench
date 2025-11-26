# Multifamily Underwriting Workbench

This project turns the existing notebook logic into a two-tier app:

- **FastAPI backend** (`backend/`) wraps the RapidAPI calls, deterministic underwriting tool, batch pipeline, and optional agent executions.
- **React + Vite frontend** (`frontend/`) provides a UI for searching properties, running the coarse screen, invoking agents, and reviewing final, detail-rich analyses.

## Prerequisites

- Python 3.10+
- Node.js 20+
- RapidAPI key for the Zillow endpoints
- (Optional) OpenAI Agents SDK & `OPENAI_API_KEY` if you want to run the typed agent flows locally

## Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # populate RapidAPI_Key / OPENAI_API_KEY
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend creates `backend/data.db` (SQLite) on first run to cache RapidAPI searches, pipeline runs, and even agent/finalize outputs. Delete the file if you want a clean slate.

Important environment variables:

- `RapidAPI_Key` – required, used for both search and property detail calls
- `OPENAI_API_KEY` – required only if the optional agent endpoints should work
- `UNDERWRITER_AGENT_MODEL` – override to change which GPT model powers the agent

## Frontend setup

```bash
cd frontend
cp .env.example .env  # edit VITE_API_URL if backend is not on localhost:8000
npm install  # install Vite + MUI + React Query deps
npm run dev
```

> **Note**: Installing the UI dependencies (`@mui/material`, `@tanstack/react-query`, etc.) may require rerunning `npm install` if the initial attempt timed out. The required packages are already listed in `package.json`.

The app expects the backend at `VITE_API_URL` (defaults to `http://localhost:8000`).

## Key flows

1. Use the **Property Search** form to hit the RapidAPI search endpoint.
2. Select properties and run the **Pipeline Controls** action to perform the coarse screen (and optional detail fetch + agent pass).
3. Inspect rows in the **Underwriting Pipeline** table, run ad-hoc agent analyses, or click “Finalize” to fetch full details + final metrics.
4. Open the drawer to review metrics, agent verdicts, and raw payloads/inputs.
5. Reuse prior searches (and pipeline runs) from the history panels—the backend serves them from SQLite so you don’t re-hit RapidAPI, and cached agent/final analyses are returned instantly unless you toggle “Force rerun.”

### What “Finalize” does

Finalize pulls the full property detail (tax/HOA/unit data) via RapidAPI, rebuilds the underwriting inputs with that richer info, reruns the deterministic math, and (optionally) invokes the agent for a final pass. The result includes the fetched detail JSON plus the refined metrics so you can drill into the numbers confidently.

## Next ideas

- Add authentication or persistence for saved deals.
- Visualize trendlines (DSCR vs price) or allow CSV export.
- Cache RapidAPI responses locally to cut down on repeated calls.
