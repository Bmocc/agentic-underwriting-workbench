# backend/app/migrations.py
from __future__ import annotations
import sqlite3
import logging

logger = logging.getLogger(__name__)

# Tuple: (version, description, sql)
# sql="" means "already handled inline or via CREATE IF NOT EXISTS" — just records the version.

# IMPORTANT — DDL safety for future migrations:
# Python's sqlite3 auto-commits DDL statements (CREATE TABLE, ALTER TABLE, etc.)
# before executing them. This means a crash between the DDL and the tracking
# INSERT below can leave a migration applied but unrecorded, causing re-run
# failures on next startup. Write future SQL migrations to be re-runnable:
#   - CREATE TABLE IF NOT EXISTS
#   - Use PRAGMA table_info() to guard ALTER TABLE statements
MIGRATIONS: list[tuple[int, str, str]] = [
    (1, "initial schema via CREATE IF NOT EXISTS", ""),
    (
        2,
        "rename search_history.limit to result_limit (handled inline in init_db)",
        "",  # The inline PRAGMA+ALTER in init_db already handles this safely
    ),
    (
        3,
        "add pipeline columns to search_results (handled inline in init_db)",
        "",  # The inline ALTER TABLE guards in init_db already handle this
    ),
    # Add future migrations below:
    # (4, "description", "ALTER TABLE ... ADD COLUMN ..."),
]


def run_migrations(conn: sqlite3.Connection) -> None:
    """Apply pending migrations and record them in schema_migrations."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL,
            description TEXT
        )
        """
    )
    conn.commit()

    applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}

    for version, description, sql in MIGRATIONS:
        if version in applied:
            continue
        logger.info("Recording migration v%d: %s", version, description)
        if sql:
            # Use conn.execute (not executescript) for single-statement migrations
            # to preserve transaction control
            conn.execute(sql)
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at, description) VALUES (?, datetime('now'), ?)",
            (version, description),
        )
        conn.commit()
        logger.info("Migration v%d complete", version)
