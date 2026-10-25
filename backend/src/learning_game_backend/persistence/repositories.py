"""Small, reusable database queries shared by the application layer.

Only generic lookups live here. Queries that belong to one gameplay operation
stay next to that operation in application/game_service.py so each
transaction can be read from top to bottom.
"""

import sqlite3

from learning_game_backend.persistence import database as db


def fetch_document(conn: sqlite3.Connection, document_id: str) -> sqlite3.Row | None:
    row: sqlite3.Row | None = conn.execute(
        "SELECT * FROM documents WHERE id = ?", (document_id,)
    ).fetchone()
    return row


def question_set_document_ids(conn: sqlite3.Connection, set_id: str) -> tuple[str, ...]:
    return tuple(
        row["document_id"]
        for row in conn.execute(
            "SELECT document_id FROM question_set_documents"
            " WHERE question_set_id = ? ORDER BY rowid",
            (set_id,),
        )
    )


def set_status(
    conn: sqlite3.Connection,
    table: str,
    row_id: str,
    status: str,
    error: str | None = None,
) -> None:
    assert table in ("documents", "question_sets")
    with db.transaction(conn):
        conn.execute(
            f"UPDATE {table} SET status = ?, error = ?, updated_at = ? WHERE id = ?",
            (status, error, db.utc_now(), row_id),
        )
