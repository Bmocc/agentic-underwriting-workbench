# Backlog — agentic-underwriting-workbench

Small, shippable tasks. Run `/ship` to have Claude pick 1-2 and implement them.

Priority markers: `[HIGH]` = do soon, `[LOW]` = nice to have.

---

## Backend

- [HIGH] Add `README.md` with project overview, setup instructions (env vars, `pip install -r requirements.txt`, `uvicorn` command), and frontend dev instructions (`npm install`, `npm run dev`)
- [HIGH] Add `docker-compose.yml` for one-command local setup (backend + frontend dev server)
- Add `DELETE /api/search/history/{id}` endpoint to remove a history entry, with a delete button in `SearchHistory.tsx`
- Add retry logic (max 2 retries, exponential backoff) for RapidAPI HTTP 429 / 5xx responses in `underwriting.py`
- Add `GET /api/health/detailed` that checks DB connectivity and returns `{"status":"ok","db":"ok","agent_available":true/false}`
- Add `pytest-cov` to requirements and a `coverage` target — report lines covered in `underwriting.py`
- Add input validation: reject `purchase_price <= 0` or `loan_term_years <= 0` in `analyze_multifamily` with a clear `ValueError`
- Log pipeline run duration (start/end timestamps) at INFO level in `run_underwriting_pipeline`

## Frontend

- [HIGH] Add empty-state illustration/message to `SearchHistory.tsx` when there are no history entries (instead of blank space)
- [HIGH] Add a "Copy address" icon button to each property card in the results list
- Add sortable columns to the pipeline results table (sort by price, cash-on-cash, DSCR, cap rate)
- Add a "Clear search" button that resets the search form to defaults
- Add keyboard shortcut `Ctrl+Enter` to submit the search form
- Add a CSV export button to the pipeline results table (`react-csv` or manual Blob download)
- Show a tooltip on DSCR / cap rate / cash-on-cash values explaining what the metric means
- Add a `<title>` and favicon to the app (currently uses Vite default)
- Add a collapsed "Advanced filters" section to the search form (min price, min beds, min baths)
- Persist the last search form values to `localStorage` so they survive page refresh

## DevEx / Infra

- Add `.github/workflows/test.yml` — CI that runs `pytest` on push/PR
- Add `Makefile` with targets: `make dev`, `make test`, `make lint`
- Add `pyproject.toml` with `[tool.pytest.ini_options]` to set `testpaths = ["tests"]` and suppress the asyncio warning
