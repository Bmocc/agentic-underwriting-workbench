from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

DB_PATH = Path(__file__).resolve().parents[1] / "data.db"
_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _canonical_json(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                request_payload TEXT NOT NULL,
                location TEXT,
                status_type TEXT,
                home_type TEXT,
                result_limit INTEGER,
                total_results INTEGER
            );

            CREATE TABLE IF NOT EXISTS search_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                search_id INTEGER NOT NULL,
                response_payload TEXT NOT NULL,
                props_payload TEXT NOT NULL,
                FOREIGN KEY (search_id) REFERENCES search_history(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS pipeline_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                search_id INTEGER,
                label TEXT,
                request_payload TEXT NOT NULL,
                options_payload TEXT NOT NULL,
                results_payload TEXT NOT NULL,
                FOREIGN KEY (search_id) REFERENCES search_history(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS agent_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                zpid TEXT,
                payload_signature TEXT UNIQUE NOT NULL,
                payload TEXT NOT NULL,
                result TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS final_analysis_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                zpid TEXT,
                payload_signature TEXT UNIQUE NOT NULL,
                listing_payload TEXT NOT NULL,
                final_inputs TEXT NOT NULL,
                metrics TEXT NOT NULL,
                detail TEXT NOT NULL,
                agent_output TEXT
            );
            """
        )
        # Legacy migration: rename 'limit' column to 'result_limit'
        cur = conn.execute("PRAGMA table_info(search_history)")
        columns = {row["name"] for row in cur.fetchall()}
        if "limit" in columns and "result_limit" not in columns:
            conn.execute('ALTER TABLE search_history RENAME COLUMN "limit" TO result_limit')
            conn.commit()


init_db()


def record_search_result(
    request_payload: Dict[str, Any],
    props: List[Dict[str, Any]],
    raw_response: Dict[str, Any],
    total_results: Optional[int],
) -> int:
    with _lock:
        with _connect() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO search_history (created_at, request_payload, location, status_type, home_type, result_limit, total_results)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    datetime.utcnow().isoformat(),
                    json.dumps(request_payload),
                    request_payload.get("location"),
                    request_payload.get("status_type"),
                    request_payload.get("home_type"),
                    request_payload.get("limit"),
                    total_results,
                ),
            )
            search_id = cur.lastrowid
            cur.execute(
                """
                INSERT INTO search_results (search_id, response_payload, props_payload)
                VALUES (?, ?, ?)
                """,
                (
                    search_id,
                    json.dumps(raw_response),
                    json.dumps(props),
                ),
            )
            conn.commit()
            return int(search_id)


def list_search_history(limit: int = 50) -> List[Dict[str, Any]]:
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, created_at, location, status_type, home_type, result_limit, total_results, request_payload
            FROM search_history
            ORDER BY datetime(created_at) DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cur.fetchall()
    history: List[Dict[str, Any]] = []
    for row in rows:
        row_keys = row.keys()
        if "result_limit" in row_keys:
            limit_value = row["result_limit"]
        elif "limit" in row_keys:  # legacy column name
            limit_value = row["limit"]
        else:
            limit_value = None
        history.append(
            {
                "id": row["id"],
                "created_at": row["created_at"],
                "location": row["location"],
                "status_type": row["status_type"],
                "home_type": row["home_type"],
                "limit": limit_value,
                "result_count": row["total_results"] or 0,
                "request_payload": json.loads(row["request_payload"]),
            }
        )
    return history


def get_search_payload(search_id: int) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT h.id, h.created_at, h.total_results, h.request_payload, r.response_payload, r.props_payload
            FROM search_history h
            JOIN search_results r ON h.id = r.search_id
            WHERE h.id = ?
            """,
            (search_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "search_id": row["id"],
            "created_at": row["created_at"],
            "request_payload": json.loads(row["request_payload"]),
            "total_results": row["total_results"],
            "raw": json.loads(row["response_payload"]),
            "props": json.loads(row["props_payload"]),
        }


def record_pipeline_run(
    search_id: Optional[int],
    label: Optional[str],
    request_payload: Dict[str, Any],
    options_payload: Dict[str, Any],
    results_payload: List[Dict[str, Any]],
) -> int:
    with _lock:
        with _connect() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO pipeline_runs (created_at, search_id, label, request_payload, options_payload, results_payload)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    datetime.utcnow().isoformat(),
                    search_id,
                    label,
                    json.dumps(request_payload),
                    json.dumps(options_payload),
                    json.dumps(results_payload),
                ),
            )
            conn.commit()
            return int(cur.lastrowid)


def list_pipeline_runs(limit: int = 50) -> List[Dict[str, Any]]:
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, created_at, search_id, label, options_payload, results_payload
            FROM pipeline_runs
            ORDER BY datetime(created_at) DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cur.fetchall()
        history: List[Dict[str, Any]] = []
        for row in rows:
            results = json.loads(row["results_payload"])
            history.append(
                {
                    "id": row["id"],
                    "created_at": row["created_at"],
                    "search_id": row["search_id"],
                    "label": row["label"],
                    "result_count": len(results),
                    "options": json.loads(row["options_payload"]),
                }
            )
        return history


def get_pipeline_run(run_id: int) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, created_at, search_id, label, request_payload, options_payload, results_payload
            FROM pipeline_runs
            WHERE id = ?
            """,
            (run_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "created_at": row["created_at"],
            "search_id": row["search_id"],
            "label": row["label"],
            "request_payload": json.loads(row["request_payload"]),
            "options": json.loads(row["options_payload"]),
            "results": json.loads(row["results_payload"]),
        }


def _payload_signature(payload: Any) -> str:
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def get_agent_result(signature_payload: Any) -> Optional[Dict[str, Any]]:
    signature = _payload_signature(signature_payload)
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT zpid, payload, result, created_at
            FROM agent_results
            WHERE payload_signature = ?
            """,
            (signature,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "zpid": row["zpid"],
            "payload": json.loads(row["payload"]),
            "result": json.loads(row["result"]),
            "created_at": row["created_at"],
        }


def record_agent_result(zpid: Optional[str], payload: Any, result: Any) -> None:
    signature = _payload_signature(payload)
    with _lock:
        with _connect() as conn:
            conn.execute(
                """
                INSERT INTO agent_results (created_at, zpid, payload_signature, payload, result)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(payload_signature) DO UPDATE SET
                    created_at=excluded.created_at,
                    zpid=excluded.zpid,
                    payload=excluded.payload,
                    result=excluded.result
                """,
                (
                    datetime.utcnow().isoformat(),
                    zpid,
                    signature,
                    json.dumps(payload),
                    json.dumps(result),
                ),
            )
            conn.commit()


def get_final_analysis(payload: Any) -> Optional[Dict[str, Any]]:
    signature = _payload_signature(payload)
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT zpid, listing_payload, final_inputs, metrics, detail, agent_output, created_at
            FROM final_analysis_results
            WHERE payload_signature = ?
            """,
            (signature,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "zpid": row["zpid"],
            "listing_payload": json.loads(row["listing_payload"]),
            "final_inputs": json.loads(row["final_inputs"]),
            "metrics": json.loads(row["metrics"]),
            "detail": json.loads(row["detail"]),
            "agent_output": json.loads(row["agent_output"]) if row["agent_output"] else None,
            "created_at": row["created_at"],
        }


def record_final_analysis(
    zpid: Optional[str],
    payload: Any,
    listing_payload: Any,
    final_inputs: Any,
    metrics: Any,
    detail: Any,
    agent_output: Optional[Any],
) -> None:
    signature = _payload_signature(payload)
    with _lock:
        with _connect() as conn:
            conn.execute(
                """
                INSERT INTO final_analysis_results (
                    created_at,
                    zpid,
                    payload_signature,
                    listing_payload,
                    final_inputs,
                    metrics,
                    detail,
                    agent_output
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(payload_signature) DO UPDATE SET
                    created_at=excluded.created_at,
                    zpid=excluded.zpid,
                    listing_payload=excluded.listing_payload,
                    final_inputs=excluded.final_inputs,
                    metrics=excluded.metrics,
                    detail=excluded.detail,
                    agent_output=excluded.agent_output
                """,
                (
                    datetime.utcnow().isoformat(),
                    zpid,
                    signature,
                    json.dumps(listing_payload),
                    json.dumps(final_inputs),
                    json.dumps(metrics),
                    json.dumps(detail),
                    json.dumps(agent_output) if agent_output is not None else None,
                ),
            )
            conn.commit()
