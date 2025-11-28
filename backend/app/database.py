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
                pipeline_results_payload TEXT,
                pipeline_options_payload TEXT,
                pipeline_label TEXT,
                pipeline_run_at TEXT,
                FOREIGN KEY (search_id) REFERENCES search_history(id) ON DELETE CASCADE
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

            CREATE TABLE IF NOT EXISTS property_conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                zpid TEXT UNIQUE NOT NULL,
                search_id INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                property_payload TEXT,
                pipeline_inputs TEXT,
                messages_payload TEXT NOT NULL,
                FOREIGN KEY (search_id) REFERENCES search_history(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS property_overrides (
                scope TEXT NOT NULL,
                zpid TEXT NOT NULL,
                search_id INTEGER,
                overrides_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (scope, zpid)
            );
            """
        )
        # Legacy migration: rename 'limit' column to 'result_limit'
        cur = conn.execute("PRAGMA table_info(search_history)")
        columns = {row["name"] for row in cur.fetchall()}
        if "limit" in columns and "result_limit" not in columns:
            conn.execute('ALTER TABLE search_history RENAME COLUMN "limit" TO result_limit')
            conn.commit()
        cur = conn.execute("PRAGMA table_info(search_results)")
        search_results_columns = {row["name"] for row in cur.fetchall()}
        altered = False
        if "pipeline_results_payload" not in search_results_columns:
            conn.execute("ALTER TABLE search_results ADD COLUMN pipeline_results_payload TEXT")
            altered = True
        if "pipeline_options_payload" not in search_results_columns:
            conn.execute("ALTER TABLE search_results ADD COLUMN pipeline_options_payload TEXT")
            altered = True
        if "pipeline_label" not in search_results_columns:
            conn.execute("ALTER TABLE search_results ADD COLUMN pipeline_label TEXT")
            altered = True
        if "pipeline_run_at" not in search_results_columns:
            conn.execute("ALTER TABLE search_results ADD COLUMN pipeline_run_at TEXT")
            altered = True
        if altered:
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
            SELECT
                h.id,
                h.created_at,
                h.location,
                h.status_type,
                h.home_type,
                h.result_limit,
                h.total_results,
                h.request_payload,
                r.pipeline_results_payload,
                r.pipeline_label,
                r.pipeline_run_at
            FROM search_history h
            LEFT JOIN search_results r ON h.id = r.search_id
            ORDER BY datetime(h.created_at) DESC
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
                "pipeline_run_at": row["pipeline_run_at"],
                "pipeline_label": row["pipeline_label"],
                "pipeline_result_count": (
                    len(json.loads(row["pipeline_results_payload"])) if row["pipeline_results_payload"] else None
                ),
                "request_payload": json.loads(row["request_payload"]),
            }
        )
    return history


def get_search_payload(search_id: int) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                h.id,
                h.created_at,
                h.total_results,
                h.request_payload,
                r.response_payload,
                r.props_payload,
                r.pipeline_results_payload,
                r.pipeline_options_payload,
                r.pipeline_label,
                r.pipeline_run_at
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
            "pipeline_results": json.loads(row["pipeline_results_payload"]) if row["pipeline_results_payload"] else None,
            "pipeline_options": json.loads(row["pipeline_options_payload"]) if row["pipeline_options_payload"] else None,
            "pipeline_label": row["pipeline_label"],
            "pipeline_run_at": row["pipeline_run_at"],
            "property_overrides": list_property_overrides(search_id),
        }

def record_search_pipeline_results(
    search_id: int,
    results_payload: List[Dict[str, Any]],
    options_payload: Optional[Dict[str, Any]],
    label: Optional[str],
) -> None:
    with _lock:
        with _connect() as conn:
            conn.execute(
                """
                UPDATE search_results
                SET
                    pipeline_results_payload = ?,
                    pipeline_options_payload = ?,
                    pipeline_label = ?,
                    pipeline_run_at = ?
                WHERE search_id = ?
                """,
                (
                    json.dumps(results_payload),
                    json.dumps(options_payload) if options_payload is not None else None,
                    label,
                    datetime.utcnow().isoformat(),
                    search_id,
                ),
            )
            conn.commit()


def get_property_conversation(zpid: str) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT zpid, search_id, created_at, updated_at, property_payload, pipeline_inputs, messages_payload
            FROM property_conversations
            WHERE zpid = ?
            """,
            (zpid,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "zpid": row["zpid"],
            "search_id": row["search_id"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "property_payload": json.loads(row["property_payload"]) if row["property_payload"] else None,
            "pipeline_inputs": json.loads(row["pipeline_inputs"]) if row["pipeline_inputs"] else None,
            "messages": json.loads(row["messages_payload"]) if row["messages_payload"] else [],
        }


def save_property_conversation(
    zpid: str,
    messages: List[Dict[str, Any]],
    property_payload: Optional[Dict[str, Any]],
    pipeline_inputs: Optional[Dict[str, Any]],
    search_id: Optional[int],
) -> None:
    now = datetime.utcnow().isoformat()
    with _lock:
        with _connect() as conn:
            conn.execute(
                """
                INSERT INTO property_conversations (
                    zpid,
                    search_id,
                    created_at,
                    updated_at,
                    property_payload,
                    pipeline_inputs,
                    messages_payload
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(zpid) DO UPDATE SET
                    search_id = COALESCE(excluded.search_id, property_conversations.search_id),
                    updated_at = excluded.updated_at,
                    property_payload = COALESCE(excluded.property_payload, property_conversations.property_payload),
                    pipeline_inputs = COALESCE(excluded.pipeline_inputs, property_conversations.pipeline_inputs),
                    messages_payload = excluded.messages_payload
                """,
                (
                    zpid,
                    search_id,
                    now,
                    now,
                    json.dumps(property_payload) if property_payload is not None else None,
                    json.dumps(pipeline_inputs) if pipeline_inputs is not None else None,
                    json.dumps(messages),
                ),
            )
            conn.commit()


def _payload_signature(payload: Any) -> str:
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def _override_scope(search_id: Optional[int]) -> str:
    return f"search:{search_id}" if search_id is not None else "global"


def list_property_overrides(search_id: Optional[int]) -> Dict[str, Any]:
    scope = _override_scope(search_id)
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT zpid, overrides_json
            FROM property_overrides
            WHERE scope = ?
            """,
            (scope,),
        )
        rows = cur.fetchall()
    overrides: Dict[str, Any] = {}
    for row in rows:
        try:
            overrides[row["zpid"]] = json.loads(row["overrides_json"])
        except json.JSONDecodeError:
            continue
    return overrides


def save_property_override(
    zpid: str,
    overrides: Optional[Dict[str, Any]],
    search_id: Optional[int],
) -> None:
    scope = _override_scope(search_id)
    with _lock:
        with _connect() as conn:
            if overrides is None:
                conn.execute(
                    "DELETE FROM property_overrides WHERE scope = ? AND zpid = ?",
                    (scope, zpid),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO property_overrides (scope, zpid, search_id, overrides_json, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(scope, zpid) DO UPDATE SET
                        overrides_json = excluded.overrides_json,
                        updated_at = excluded.updated_at,
                        search_id = excluded.search_id
                    """,
                    (
                        scope,
                        zpid,
                        search_id,
                        json.dumps(overrides),
                        datetime.utcnow().isoformat(),
                    ),
                )
            conn.commit()


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
