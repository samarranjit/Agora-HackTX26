"""The database schema and its numbered migrations.

The schema version is kept in SQLite's `PRAGMA user_version`. migrate() applies
every numbered migration above the current version, each in its own
transaction, so running it repeatedly is safe. The server runs it at startup,
and `learning-game-api migrate` runs it on its own. To change the schema,
append a new entry to MIGRATIONS; never edit an existing one.
"""

import sqlite3
from pathlib import Path

from learning_game_backend.persistence.database import connect, transaction

MIGRATIONS: tuple[str, ...] = (
    # 1: accounts, sessions, player state, documents, generated questions,
    #    attempts, and stored results for idempotent retries.
    """
    CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
    );
    CREATE INDEX sessions_user ON sessions(user_id);

    -- xp, health, max_health and adventure_unlocked are typed copies of the
    -- values inside state_json, written in the same statement.
    CREATE TABLE player_states (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        state_json TEXT NOT NULL,
        xp INTEGER NOT NULL CHECK (xp >= 0),
        health INTEGER NOT NULL CHECK (health >= 0 AND health <= max_health),
        max_health INTEGER NOT NULL CHECK (max_health > 0),
        adventure_unlocked INTEGER NOT NULL CHECK (adventure_unlocked IN (0, 1)),
        state_version INTEGER NOT NULL CHECK (state_version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        display_name TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        page_count INTEGER NOT NULL,
        status TEXT NOT NULL
            CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX documents_owner ON documents(owner_id);

    CREATE TABLE question_sets (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK (mode IN ('practice', 'adventure')),
        topic TEXT NOT NULL,
        requested_count INTEGER NOT NULL,
        difficulty_min INTEGER NOT NULL,
        difficulty_max INTEGER NOT NULL,
        status TEXT NOT NULL
            CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
        error TEXT,
        provider TEXT NOT NULL,
        generation_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX question_sets_owner ON question_sets(owner_id);

    CREATE TABLE question_set_documents (
        question_set_id TEXT NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
        document_id TEXT NOT NULL REFERENCES documents(id),
        PRIMARY KEY (question_set_id, document_id)
    );

    -- answer_json and grading_json are private: never returned by the API.
    CREATE TABLE questions (
        id TEXT PRIMARY KEY,
        question_set_id TEXT NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        source_question_id TEXT NOT NULL,
        content_version INTEGER NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('practice', 'adventure')),
        question_type TEXT NOT NULL,
        topic TEXT NOT NULL,
        learning_objective TEXT,
        prompt TEXT NOT NULL,
        options_json TEXT,
        answer_json TEXT NOT NULL,
        grading_json TEXT NOT NULL,
        explanation TEXT NOT NULL,
        difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
        sources_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (question_set_id, source_question_id)
    );
    CREATE INDEX questions_owner_mode ON questions(owner_id, mode);

    CREATE TABLE attempts (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_id TEXT NOT NULL REFERENCES questions(id),
        mode TEXT NOT NULL CHECK (mode IN ('practice', 'adventure')),
        battle_attempt_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'answered')),
        created_at TEXT NOT NULL,
        answered_at TEXT
    );
    CREATE INDEX attempts_owner_question ON attempts(owner_id, question_id);

    -- One accepted submission per attempt. A retried request with the same
    -- idempotency key gets result_json back instead of being applied again.
    CREATE TABLE submissions (
        attempt_id TEXT PRIMARY KEY REFERENCES attempts(id),
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        answer_digest TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (owner_id, idempotency_key)
    );

    CREATE TABLE battle_starts (
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        battle_attempt_id TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, idempotency_key)
    );
    """,
)


def schema_version(conn: sqlite3.Connection) -> int:
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    assert isinstance(version, int)
    return version


def migrate(path: Path) -> int:
    """Apply pending migrations and return the resulting schema version."""
    conn = connect(path)
    try:
        current = schema_version(conn)
        if current > len(MIGRATIONS):
            raise RuntimeError(
                f"Database schema version {current} is newer than this code "
                f"supports ({len(MIGRATIONS)})."
            )
        for number in range(current + 1, len(MIGRATIONS) + 1):
            with transaction(conn):
                for statement in _statements(MIGRATIONS[number - 1]):
                    conn.execute(statement)
                conn.execute(f"PRAGMA user_version = {number}")
        return schema_version(conn)
    finally:
        conn.close()


def _statements(script: str) -> list[str]:
    """Split a migration script on semicolons.

    Migration scripts must not contain semicolons anywhere else, including
    in comments.
    """
    return [part.strip() for part in script.split(";") if part.strip()]
