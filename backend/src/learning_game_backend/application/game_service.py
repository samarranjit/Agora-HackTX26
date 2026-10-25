"""Application operations for the API: documents, question sets, and play.

This is where the pieces meet. Each operation that changes a player runs in a
single database transaction: it loads the player's engine state, checks the
request, applies engine actions, records attempts and results, and writes the
new state with an incremented state_version. If anything fails, the
transaction rolls back and nothing is changed.

Request retries are safe:
- Answering stores the result under the request's idempotency key. The same
  key and answer return the stored result without applying it again.
- Starting a battle stores its result the same way, so a retry is not charged.
- Creating a practice attempt returns the already-pending one if there is one.

Rewards come only from the engine's rules and the stored question's difficulty. Clients
never send correctness, difficulty, XP, or health.
"""

import gzip
import hashlib
import json
import logging
import sqlite3
import uuid
from collections.abc import Iterator, Sequence
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing, contextmanager
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from learning_game_engine.engine import GameEngine, InvalidAction, InvalidState
from learning_game_engine.models import BattleOutcome, PlayerState, QuestionRef, Scene
from learning_game_engine.rules import DEFAULT_RULES, Rules
from learning_game_engine.state_codec import (
    StateCodecError,
    state_from_dict,
    state_to_dict,
)

from learning_game_backend.application.campaign import DEFAULT_CAMPAIGN, Campaign
from learning_game_backend.auth.service import Account
from learning_game_backend.config import Settings
from learning_game_backend.documents.storage import (
    DocumentError,
    check_pdf,
    read_pdf,
    store_pdf,
)
from learning_game_backend.grading.evaluator import AnswerKey, InvalidAnswer, evaluate
from learning_game_backend.persistence import database as db
from learning_game_backend.persistence import repositories as repo
from learning_game_backend.rag.protocol import GameMaster, ProviderError
from learning_game_backend.rag.schemas import (
    GeneratedSet,
    GenerationRequest,
    QuestionMode,
    QuestionType,
)
from learning_game_backend.rag.validation import (
    GenerationValidationError,
    validate_generated_set,
)

logger = logging.getLogger(__name__)

STATUS_SCHEMA_VERSION = 1
EXPORT_SCHEMA_VERSION = 1
RESTART_ERROR = "Interrupted by a server restart. Please submit it again."


class AppError(Exception):
    """A request that cannot be completed. The message is safe to show."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _not_found(kind: str) -> AppError:
    # Used for both "does not exist" and "belongs to someone else", so other
    # players' IDs cannot be discovered.
    return AppError(404, f"{kind}_not_found", f"No such {kind.replace('_', ' ')}.")


@dataclass(frozen=True)
class Player:
    engine: GameEngine
    state_version: int
    updated_at: str


class GameService:
    def __init__(
        self,
        settings: Settings,
        game_master: GameMaster | None,
        rules: Rules = DEFAULT_RULES,
        campaign: Campaign = DEFAULT_CAMPAIGN,
    ) -> None:
        self.settings = settings
        self.campaign = campaign
        self.game_master = game_master
        self.rules = rules

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        with closing(db.connect(self.settings.database_path)) as conn:
            yield conn

    # --- Startup ---

    def recover_interrupted_jobs(self) -> int:
        """Mark ingestion/generation left unfinished by a restart as failed.

        Background work runs inside the server process, so it cannot survive a
        restart. Failing it explicitly means nothing stays "processing" forever;
        the player can resubmit.
        """
        now = db.utc_now()
        with self.connection() as conn, db.transaction(conn):
            changed = 0
            for table in ("documents", "question_sets", "study_packs"):
                cursor = conn.execute(
                    f"UPDATE {table} SET status = 'failed', error = ?, updated_at = ?"
                    " WHERE status IN ('pending', 'processing')",
                    (RESTART_ERROR, now),
                )
                changed += cursor.rowcount
        return changed

    # --- Player state ---

    def create_player(self, conn: sqlite3.Connection, account: Account) -> None:
        engine = GameEngine.new_game(
            account.username,
            slide_count=self.campaign.slide_count,
            villain_ids=self.campaign.villain_ids,
            rules=self.rules,
        )
        now = db.utc_now()
        with db.transaction(conn):
            conn.execute(
                "INSERT INTO player_states (user_id, state_json, xp, health,"
                " max_health, adventure_unlocked, state_version, created_at,"
                " updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
                (
                    account.user_id,
                    json.dumps(state_to_dict(engine.state)),
                    engine.state.xp,
                    engine.state.health,
                    self.rules.max_health,
                    int(engine.state.adventure_unlocked),
                    now,
                    now,
                ),
            )

    def _load_player(self, conn: sqlite3.Connection, user_id: str) -> Player:
        row = conn.execute(
            "SELECT * FROM player_states WHERE user_id = ?", (user_id,)
        ).fetchone()
        if row is None:
            raise AppError(404, "player_not_found", "No game state for this account.")
        try:
            state = state_from_dict(json.loads(row["state_json"]))
            engine = GameEngine(
                state,
                slide_count=self.campaign.slide_count,
                villain_ids=self.campaign.villain_ids,
                rules=self.rules,
            )
        except (StateCodecError, InvalidState, ValueError) as exc:
            logger.error("Stored state for a player is invalid: %s", exc)
            raise AppError(
                500, "corrupt_state", "Stored game state is invalid."
            ) from None
        if (row["xp"], row["health"], bool(row["adventure_unlocked"])) != (
            state.xp,
            state.health,
            state.adventure_unlocked,
        ):
            raise AppError(500, "corrupt_state", "Stored game state is inconsistent.")
        return Player(engine, row["state_version"], row["updated_at"])

    def _save_player(
        self, conn: sqlite3.Connection, user_id: str, player: Player
    ) -> int:
        """Write the engine state if nobody else changed it. Returns the new version."""
        state = player.engine.state
        new_version = player.state_version + 1
        cursor = conn.execute(
            "UPDATE player_states SET state_json = ?, xp = ?, health = ?,"
            " max_health = ?, adventure_unlocked = ?, state_version = ?,"
            " updated_at = ? WHERE user_id = ? AND state_version = ?",
            (
                json.dumps(state_to_dict(state)),
                state.xp,
                state.health,
                self.rules.max_health,
                int(state.adventure_unlocked),
                new_version,
                db.utc_now(),
                user_id,
                player.state_version,
            ),
        )
        if cursor.rowcount != 1:
            raise AppError(
                409, "state_conflict", "Your game changed meanwhile. Please retry."
            )
        return new_version

    # --- Documents ---

    def _require_game_master(self) -> GameMaster:
        if self.game_master is None:
            raise AppError(
                503,
                "game_master_unavailable",
                "No game master is configured, so PDFs cannot be processed. "
                "Set GAME_MASTER_MODE (see INTEGRATION_GUIDE.md).",
            )
        return self.game_master

    def upload_document(
        self, account: Account, name: str, data: bytes
    ) -> dict[str, Any]:
        """Validate and store a PDF. The caller then runs ingest_document()."""
        self._require_game_master()
        try:
            checked = check_pdf(data, self.settings.max_upload_bytes)
        except DocumentError as exc:
            status = 413 if exc.code == "too_large" else 422
            raise AppError(status, exc.code, str(exc)) from None
        document_id = uuid.uuid4().hex
        store_pdf(self.settings.documents_dir, document_id, checked.data)
        now = db.utc_now()
        with self.connection() as conn, db.transaction(conn):
            conn.execute(
                "INSERT INTO documents (id, owner_id, display_name, size_bytes,"
                " sha256, page_count, status, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
                (
                    document_id,
                    account.user_id,
                    name,
                    len(checked.data),
                    checked.sha256,
                    checked.page_count,
                    now,
                    now,
                ),
            )
            stored = repo.fetch_document(conn, document_id)
            assert stored is not None
            return self._document_view(stored)

    def ingest_document(self, document_id: str) -> None:
        """Send a stored PDF to the game master and record the outcome."""
        game_master = self._require_game_master()
        with self.connection() as conn:
            row = repo.fetch_document(conn, document_id)
            if row is None or row["status"] != "pending":
                return
            repo.set_status(conn, "documents", document_id, "processing")
            try:
                game_master.ingest_document(
                    document_id,
                    row["display_name"],
                    read_pdf(self.settings.documents_dir, document_id),
                )
            except ProviderError as exc:
                repo.set_status(conn, "documents", document_id, "failed", str(exc))
                return
            except Exception:
                repo.set_status(
                    conn, "documents", document_id, "failed", "Internal error."
                )
                raise
            repo.set_status(conn, "documents", document_id, "ready")

    def get_document(self, account: Account, document_id: str) -> dict[str, Any]:
        with self.connection() as conn:
            row = repo.fetch_document(conn, document_id)
            if row is None or row["owner_id"] != account.user_id:
                raise _not_found("document")
            return self._document_view(row)

    def _document_view(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "document_id": row["id"],
            "name": row["display_name"],
            "size_bytes": row["size_bytes"],
            "page_count": row["page_count"],
            "status": row["status"],
            "error": row["error"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    # --- Question sets ---

    def request_question_set(
        self,
        account: Account,
        document_ids: Sequence[str],
        mode: QuestionMode,
        topic: str,
        count: int,
        difficulty_min: int,
        difficulty_max: int,
    ) -> dict[str, Any]:
        return self._create_question_set(
            account.user_id,
            document_ids,
            mode,
            topic,
            count,
            difficulty_min,
            difficulty_max,
        )

    def _create_question_set(
        self,
        owner_id: str,
        document_ids: Sequence[str],
        mode: QuestionMode,
        topic: str,
        count: int,
        difficulty_min: int,
        difficulty_max: int,
    ) -> dict[str, Any]:
        game_master = self._require_game_master()
        unique_ids = tuple(dict.fromkeys(document_ids))
        set_id = uuid.uuid4().hex
        now = db.utc_now()
        with self.connection() as conn, db.transaction(conn):
            for document_id in unique_ids:
                row = repo.fetch_document(conn, document_id)
                if row is None or row["owner_id"] != owner_id:
                    raise _not_found("document")
                if row["status"] != "ready":
                    raise AppError(
                        409,
                        "document_not_ready",
                        f"Document {document_id} is {row['status']}, not ready.",
                    )
            conn.execute(
                "INSERT INTO question_sets (id, owner_id, mode, topic,"
                " requested_count, difficulty_min, difficulty_max, status,"
                " provider, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
                (
                    set_id,
                    owner_id,
                    mode.value,
                    topic,
                    count,
                    difficulty_min,
                    difficulty_max,
                    game_master.name,
                    now,
                    now,
                ),
            )
            conn.executemany(
                "INSERT INTO question_set_documents VALUES (?, ?)",
                [(set_id, document_id) for document_id in unique_ids],
            )
            return self._question_set_view(conn, set_id)

    def generate_question_set(self, set_id: str) -> None:
        """Ask the game master for questions, validate them, and store them."""
        game_master = self._require_game_master()
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM question_sets WHERE id = ?", (set_id,)
            ).fetchone()
            if row is None or row["status"] != "pending":
                return
            repo.set_status(conn, "question_sets", set_id, "processing")
            request = GenerationRequest(
                question_set_id=set_id,
                document_ids=repo.question_set_document_ids(conn, set_id),
                topic=row["topic"],
                mode=QuestionMode(row["mode"]),
                count=row["requested_count"],
                difficulty_min=row["difficulty_min"],
                difficulty_max=row["difficulty_max"],
            )
            try:
                generated = validate_generated_set(
                    game_master.generate_questions(request), request
                )
                self._store_questions(conn, set_id, row["owner_id"], generated)
            except (ProviderError, GenerationValidationError) as exc:
                repo.set_status(conn, "question_sets", set_id, "failed", str(exc))
            except Exception:
                # Never leave a set "processing": storing failed and was rolled back.
                repo.set_status(
                    conn, "question_sets", set_id, "failed", "Internal error."
                )
                raise

    def _store_questions(
        self,
        conn: sqlite3.Connection,
        set_id: str,
        owner_id: str,
        generated: GeneratedSet,
    ) -> None:
        now = db.utc_now()
        with db.transaction(conn):
            for position, question in enumerate(generated.questions):
                answer: dict[str, str | None]
                if question.question_type is QuestionType.NUMERIC:
                    answer = {"value": str(question.numeric_answer)}
                else:
                    answer = {"option_id": question.correct_option_id}
                conn.execute(
                    "INSERT INTO questions (id, question_set_id, owner_id, position,"
                    " source_question_id, content_version, mode, question_type,"
                    " topic, learning_objective, prompt, options_json, answer_json,"
                    " grading_json, explanation, difficulty, sources_json,"
                    " created_at) VALUES"
                    " (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        uuid.uuid4().hex,
                        set_id,
                        owner_id,
                        position,
                        question.source_question_id,
                        question.content_version,
                        question.mode.value,
                        question.question_type.value,
                        question.topic,
                        question.learning_objective,
                        question.prompt,
                        json.dumps(
                            [{"id": o.id, "text": o.text} for o in question.options]
                        )
                        if question.options
                        else None,
                        json.dumps(answer),
                        json.dumps({"tolerance": str(question.tolerance)}),
                        question.explanation,
                        question.difficulty,
                        json.dumps(
                            [
                                {"document_id": s.document_id, "pages": list(s.pages)}
                                for s in question.sources
                            ]
                        ),
                        now,
                    ),
                )
            conn.execute(
                "UPDATE question_sets SET status = 'ready', error = NULL,"
                " generation_json = ?, updated_at = ? WHERE id = ?",
                (json.dumps(generated.generation), now, set_id),
            )

    def get_question_set(self, account: Account, set_id: str) -> dict[str, Any]:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT owner_id FROM question_sets WHERE id = ?", (set_id,)
            ).fetchone()
            if row is None or row["owner_id"] != account.user_id:
                raise _not_found("question_set")
            return self._question_set_view(conn, set_id)

    def _question_set_view(
        self, conn: sqlite3.Connection, set_id: str
    ) -> dict[str, Any]:
        row = conn.execute(
            "SELECT * FROM question_sets WHERE id = ?", (set_id,)
        ).fetchone()
        questions = conn.execute(
            "SELECT id, question_type, topic, difficulty FROM questions"
            " WHERE question_set_id = ? ORDER BY position",
            (set_id,),
        ).fetchall()
        return {
            "question_set_id": row["id"],
            "mode": row["mode"],
            "topic": row["topic"],
            "status": row["status"],
            "error": row["error"],
            "provider": row["provider"],
            "requested_count": row["requested_count"],
            "difficulty_min": row["difficulty_min"],
            "difficulty_max": row["difficulty_max"],
            "document_ids": list(repo.question_set_document_ids(conn, set_id)),
            "generation": json.loads(row["generation_json"] or "{}"),
            "questions": [
                {
                    "question_id": q["id"],
                    "type": q["question_type"],
                    "topic": q["topic"],
                    "difficulty": q["difficulty"],
                }
                for q in questions
            ],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    # --- Study packs: one PDF upload becomes a practice set and an adventure set ---

    def create_study_pack(
        self,
        account: Account,
        name: str,
        data: bytes,
        topic: str,
        practice_count: int,
    ) -> dict[str, Any]:
        """Validate and store a PDF and record the pack. Then run_study_pack().

        Raises AppError for an unusable PDF or when no game master is configured,
        before anything is recorded.
        """
        document = self.upload_document(account, name, data)
        now = db.utc_now()
        with self.connection() as conn, db.transaction(conn):
            conn.execute(
                "INSERT INTO study_packs (document_id, owner_id, topic,"
                " practice_count, status, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, 'pending', ?, ?)",
                (
                    document["document_id"],
                    account.user_id,
                    topic,
                    practice_count,
                    now,
                    now,
                ),
            )
            return self._study_pack_view(conn, document["document_id"])

    def run_study_pack(self, document_id: str) -> None:
        """Index the PDF, then write and store both question sets.

        Runs in the background. Whatever happens, the pack ends as ready or
        failed (with a message), never stuck in progress.
        """
        try:
            self._run_study_pack(document_id)
        except Exception:
            self._finish_pack(document_id, "failed", "Internal error.")
            raise

    def _run_study_pack(self, document_id: str) -> None:
        with self.connection() as conn:
            pack = conn.execute(
                "SELECT * FROM study_packs WHERE document_id = ?", (document_id,)
            ).fetchone()
            if pack is None or pack["status"] != "pending":
                return
            self._finish_pack(document_id, "processing", None)

        self.ingest_document(document_id)
        with self.connection() as conn:
            document = repo.fetch_document(conn, document_id)
            assert document is not None
            if document["status"] != "ready":
                self._finish_pack(
                    document_id,
                    "failed",
                    document["error"] or "The PDF could not be processed.",
                )
                return

        owner_id = pack["owner_id"]
        villains = self.campaign.villains
        levels = [villain.target_difficulty for villain in villains]
        practice = self._create_question_set(
            owner_id, [document_id], QuestionMode.PRACTICE, pack["topic"],
            pack["practice_count"], 1, 5,
        )  # fmt: skip
        adventure = self._create_question_set(
            owner_id, [document_id], QuestionMode.ADVENTURE, pack["topic"],
            len(villains) * self.rules.battle_question_count, min(levels), max(levels),
        )  # fmt: skip
        with self.connection() as conn, db.transaction(conn):
            conn.execute(
                "UPDATE study_packs SET practice_set_id = ?, adventure_set_id = ?"
                " WHERE document_id = ?",
                (
                    practice["question_set_id"],
                    adventure["question_set_id"],
                    document_id,
                ),
            )

        # The two sets are independent, so write them at the same time.
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(self.generate_question_set, practice["question_set_id"]),
                pool.submit(self.generate_question_set, adventure["question_set_id"]),
            ]
            for future in futures:
                future.result()

        with self.connection() as conn:
            failure = self._pack_failure(
                conn, practice["question_set_id"], adventure["question_set_id"]
            )
        self._finish_pack(document_id, "failed" if failure else "ready", failure)

    def _pack_failure(
        self, conn: sqlite3.Connection, practice_id: str, adventure_id: str
    ) -> str | None:
        """Why a finished pack is not playable, or None if it is."""
        for set_id in (practice_id, adventure_id):
            row = conn.execute(
                "SELECT mode, status, error FROM question_sets WHERE id = ?", (set_id,)
            ).fetchone()
            if row["status"] != "ready":
                reason = row["error"] or "unknown error"
                return f"The {row['mode']} questions failed: {reason}"
        # Each villain needs a question at its own difficulty (the adventure rule).
        needed: dict[int, int] = {}
        for villain in self.campaign.villains:
            needed[villain.target_difficulty] = (
                needed.get(villain.target_difficulty, 0)
                + self.rules.battle_question_count
            )
        have = {
            row["difficulty"]: row["n"]
            for row in conn.execute(
                "SELECT difficulty, COUNT(*) AS n FROM questions"
                " WHERE question_set_id = ? GROUP BY difficulty",
                (adventure_id,),
            )
        }
        missing = sorted(level for level, n in needed.items() if have.get(level, 0) < n)
        if missing:
            return (
                "The adventure questions are missing difficulty level(s) "
                f"{', '.join(map(str, missing))}, which the villains need."
            )
        return None

    def _finish_pack(self, document_id: str, status: str, error: str | None) -> None:
        with self.connection() as conn, db.transaction(conn):
            conn.execute(
                "UPDATE study_packs SET status = ?, error = ?, updated_at = ?"
                " WHERE document_id = ?",
                (status, error, db.utc_now(), document_id),
            )

    def get_study_pack(self, account: Account, document_id: str) -> dict[str, Any]:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT owner_id FROM study_packs WHERE document_id = ?", (document_id,)
            ).fetchone()
            if row is None or row["owner_id"] != account.user_id:
                raise _not_found("study_pack")
            return self._study_pack_view(conn, document_id)

    def list_study_packs(self, account: Account) -> list[dict[str, Any]]:
        with self.connection() as conn:
            ids = [
                row["document_id"]
                for row in conn.execute(
                    "SELECT document_id FROM study_packs WHERE owner_id = ?"
                    " ORDER BY rowid DESC",
                    (account.user_id,),
                )
            ]
            return [self._study_pack_view(conn, document_id) for document_id in ids]

    def _study_pack_view(
        self, conn: sqlite3.Connection, document_id: str
    ) -> dict[str, Any]:
        pack = conn.execute(
            "SELECT * FROM study_packs WHERE document_id = ?", (document_id,)
        ).fetchone()
        document = repo.fetch_document(conn, document_id)
        assert document is not None

        def set_view(set_id: str | None) -> dict[str, Any] | None:
            if set_id is None:
                return None
            row = conn.execute(
                "SELECT id, mode, status, error FROM question_sets WHERE id = ?",
                (set_id,),
            ).fetchone()
            count = conn.execute(
                "SELECT COUNT(*) FROM questions WHERE question_set_id = ?", (set_id,)
            ).fetchone()[0]
            return {
                "question_set_id": row["id"],
                "mode": row["mode"],
                "status": row["status"],
                "error": row["error"],
                "question_count": count,
            }

        if pack["status"] == "failed":
            stage = "failed"
        elif document["status"] in ("pending", "processing"):
            stage = "indexing"
        elif pack["status"] == "ready":
            stage = "done"
        else:
            stage = "writing_questions"
        return {
            "document_id": document_id,
            "name": document["display_name"],
            "topic": pack["topic"],
            "status": pack["status"],
            "stage": stage,
            "error": pack["error"],
            "practice": set_view(pack["practice_set_id"]),
            "adventure": set_view(pack["adventure_set_id"]),
            "created_at": pack["created_at"],
            "updated_at": pack["updated_at"],
        }

    # --- Play ---

    def create_practice_attempt(
        self, account: Account, question_set_id: str | None
    ) -> tuple[dict[str, Any], bool]:
        """Return (public question, created). An already pending one is reused."""
        with self.connection() as conn, db.transaction(conn):
            player = self._load_player(conn, account.user_id)
            state = player.engine.state
            if state.active_battle is not None:
                raise AppError(
                    409, "battle_in_progress", "Finish the current battle first."
                )
            if state.pending_practice is not None:
                attempt = self._public_attempt(
                    conn, account.user_id, state.pending_practice.attempt_id, state
                )
                return attempt, False
            if question_set_id is not None:
                self._require_ready_set(conn, account, question_set_id, "practice")

            question = conn.execute(
                "SELECT q.id, q.difficulty, (SELECT COUNT(*) FROM attempts a"
                " WHERE a.owner_id = q.owner_id AND a.question_id = q.id) AS uses"
                " FROM questions q JOIN question_sets s ON s.id = q.question_set_id"
                " WHERE q.owner_id = ? AND q.mode = 'practice'"
                " AND s.status = 'ready' AND (? IS NULL OR s.id = ?)"
                " ORDER BY uses, s.rowid, q.position LIMIT 1",
                (account.user_id, question_set_id, question_set_id),
            ).fetchone()
            if question is None:
                raise AppError(
                    409,
                    "no_practice_questions",
                    "Generate a practice question set from one of your PDFs first.",
                )
            engine = player.engine
            if engine.state.scene is not Scene.PRACTICE:
                engine.go_to(Scene.PRACTICE)
            pending = engine.present_practice_question(
                question["id"], question["difficulty"]
            )
            self._insert_attempt(
                conn,
                account.user_id,
                pending.attempt_id,
                question["id"],
                QuestionMode.PRACTICE,
                None,
            )
            self._save_player(conn, account.user_id, player)
            attempt = self._public_attempt(
                conn, account.user_id, pending.attempt_id, engine.state
            )
            return attempt, True

    def start_battle(
        self, account: Account, idempotency_key: str, question_set_id: str | None
    ) -> dict[str, Any]:
        """Charge the entry cost once and return the battle's first question."""
        with self.connection() as conn, db.transaction(conn):
            stored = conn.execute(
                "SELECT result_json FROM battle_starts"
                " WHERE owner_id = ? AND idempotency_key = ?",
                (account.user_id, idempotency_key),
            ).fetchone()
            if stored is not None:
                result: dict[str, Any] = json.loads(stored["result_json"])
                return result

            player = self._load_player(conn, account.user_id)
            engine = player.engine
            if engine.state.active_battle is not None:
                raise AppError(
                    409,
                    "battle_in_progress",
                    "A battle is already in progress. Fetch it from "
                    "/api/me/active-attempt.",
                )
            if not engine.state.adventure_unlocked:
                raise AppError(
                    409,
                    "adventure_locked",
                    f"Adventure unlocks at {self.rules.unlock_threshold} XP. "
                    f"Earn {engine.xp_to_unlock} more XP in practice.",
                )
            villain_id = engine.next_villain_id
            if villain_id is None:
                raise AppError(
                    409, "adventure_completed", "Every villain is already defeated."
                )
            if engine.health_shortfall:
                raise AppError(
                    409,
                    "insufficient_health",
                    "Answer practice questions correctly to recover health first.",
                )
            if engine.battle_shortfall:
                raise AppError(
                    409,
                    "insufficient_xp",
                    f"A battle costs {self.rules.battle_cost} XP. "
                    f"Earn {engine.battle_shortfall} more XP in practice.",
                )
            if question_set_id is not None:
                self._require_ready_set(conn, account, question_set_id, "adventure")
            refs = self._choose_battle_questions(
                conn, account.user_id, villain_id, question_set_id
            )

            engine.go_to(Scene.ADVENTURE)
            try:
                battle = engine.start_battle(villain_id, refs)
            except InvalidAction as exc:
                raise AppError(409, "action_not_allowed", str(exc)) from None
            self._insert_attempt(
                conn,
                account.user_id,
                battle.pending_attempt_id,
                battle.current_question_id,
                QuestionMode.ADVENTURE,
                battle.battle_attempt_id,
            )
            version = self._save_player(conn, account.user_id, player)
            result = {
                "battle_attempt_id": battle.battle_attempt_id,
                "villain_id": villain_id,
                "villain_name": self.campaign.villain(villain_id).name,
                "entry_cost": self.rules.battle_cost,
                "xp": engine.state.xp,
                "health": engine.state.health,
                "state_version": version,
                "attempt": self._public_attempt(
                    conn, account.user_id, battle.pending_attempt_id, engine.state
                ),
            }
            conn.execute(
                "INSERT INTO battle_starts VALUES (?, ?, ?, ?, ?)",
                (
                    account.user_id,
                    idempotency_key,
                    battle.battle_attempt_id,
                    json.dumps(result),
                    db.utc_now(),
                ),
            )
            return result

    def get_active_attempt(self, account: Account) -> dict[str, Any] | None:
        """The question waiting for an answer, if any. Changes nothing."""
        with self.connection() as conn:
            state = self._load_player(conn, account.user_id).engine.state
            if state.active_battle is not None:
                attempt_id = state.active_battle.pending_attempt_id
            elif state.pending_practice is not None:
                attempt_id = state.pending_practice.attempt_id
            else:
                return None
            return self._public_attempt(conn, account.user_id, attempt_id, state)

    def submit_answer(
        self, account: Account, attempt_id: str, answer: str, idempotency_key: str
    ) -> dict[str, Any]:
        digest = hashlib.sha256(answer.strip().encode("utf-8")).hexdigest()
        with self.connection() as conn, db.transaction(conn):
            stored = conn.execute(
                "SELECT attempt_id, answer_digest, result_json FROM submissions"
                " WHERE owner_id = ? AND idempotency_key = ?",
                (account.user_id, idempotency_key),
            ).fetchone()
            if stored is not None:
                if (stored["attempt_id"], stored["answer_digest"]) != (
                    attempt_id,
                    digest,
                ):
                    raise AppError(
                        409,
                        "idempotency_key_reused",
                        "This idempotency key was already used for a different answer.",
                    )
                replayed: dict[str, Any] = json.loads(stored["result_json"])
                return replayed

            attempt = conn.execute(
                "SELECT * FROM attempts WHERE id = ? AND owner_id = ?",
                (attempt_id, account.user_id),
            ).fetchone()
            if attempt is None:
                raise _not_found("attempt")
            if attempt["status"] == "answered":
                raise AppError(
                    409,
                    "attempt_already_answered",
                    "This question was already answered with a different request.",
                )
            question = _fetch_question(conn, attempt["question_id"])
            try:
                correct = evaluate(_answer_key(question), answer)
            except InvalidAnswer as exc:
                raise AppError(422, "invalid_answer", str(exc)) from None

            player = self._load_player(conn, account.user_id)
            engine = player.engine
            result = self._apply_answer(conn, account, engine, attempt, correct)
            conn.execute(
                "UPDATE attempts SET status = 'answered', answered_at = ? WHERE id = ?",
                (db.utc_now(), attempt_id),
            )
            result["state_version"] = self._save_player(conn, account.user_id, player)
            result["feedback"] = {
                "correct_answer": _answer_text(question),
                "explanation": question["explanation"],
            }
            if result["next_attempt_id"] is not None:
                result["next_attempt"] = self._public_attempt(
                    conn, account.user_id, result["next_attempt_id"], engine.state
                )
            conn.execute(
                "INSERT INTO submissions VALUES (?, ?, ?, ?, ?, ?)",
                (
                    attempt_id,
                    account.user_id,
                    idempotency_key,
                    digest,
                    json.dumps(result),
                    db.utc_now(),
                ),
            )
            return result

    def _apply_answer(
        self,
        conn: sqlite3.Connection,
        account: Account,
        engine: GameEngine,
        attempt: sqlite3.Row,
        correct: bool,
    ) -> dict[str, Any]:
        state = engine.state
        result: dict[str, Any] = {
            "attempt_id": attempt["id"],
            "correct": correct,
            "max_health": self.rules.max_health,
            "next_attempt_id": None,
            "next_attempt": None,
        }
        try:
            if attempt["mode"] == QuestionMode.PRACTICE.value:
                if state.active_battle is not None:
                    raise InvalidAction("Finish the current battle first.")
                if state.scene is not Scene.PRACTICE:
                    engine.go_to(Scene.PRACTICE)
                practice = engine.submit_practice_result(attempt["id"], correct)
                result.update(
                    xp_delta=practice.xp_delta,
                    xp=practice.xp,
                    health_delta=practice.health_delta,
                    health=practice.health,
                    encounter={
                        "mode": "practice",
                        "outcome": "none",
                        "adventure_unlocked_now": practice.adventure_unlocked_now,
                        "adventure_completed": engine.adventure_completed,
                    },
                )
                return result

            battle = engine.submit_battle_result(attempt["id"], correct)
        except InvalidAction as exc:
            raise AppError(409, "attempt_not_active", str(exc)) from None

        result.update(
            xp_delta=battle.xp_delta,
            xp=battle.xp,
            health_delta=battle.health_delta,
            health=battle.health,
            encounter={
                "mode": "adventure",
                "outcome": _OUTCOMES[battle.outcome],
                "villain_id": battle.villain_id,
                "question_number": battle.question_number,
                "question_count": battle.question_count,
                "correct_count": battle.correct_count,
                "adventure_unlocked_now": False,
                "adventure_completed": battle.adventure_completed,
            },
        )
        active = engine.state.active_battle
        if battle.outcome is BattleOutcome.IN_PROGRESS and active is not None:
            self._insert_attempt(
                conn,
                account.user_id,
                active.pending_attempt_id,
                active.current_question_id,
                QuestionMode.ADVENTURE,
                active.battle_attempt_id,
            )
            result["next_attempt_id"] = active.pending_attempt_id
        return result

    # --- Status and export ---

    def get_state(self, account: Account) -> dict[str, Any]:
        with self.connection() as conn:
            player = self._load_player(conn, account.user_id)
        engine = player.engine
        state = engine.state
        battle = state.active_battle
        pending_id = (
            battle.pending_attempt_id
            if battle is not None
            else state.pending_practice.attempt_id
            if state.pending_practice is not None
            else None
        )
        return {
            "username": account.username,
            "state_version": player.state_version,
            "updated_at": player.updated_at,
            "xp": state.xp,
            "health": state.health,
            "max_health": self.rules.max_health,
            "adventure_unlocked": state.adventure_unlocked,
            "adventure_completed": engine.adventure_completed,
            "location": state.scene.value,
            "practice_answered": state.practice_position,
            "villains": [
                {
                    "villain_id": villain.id,
                    "name": villain.name,
                    "status": engine.villain_status(villain.id).value,
                }
                for villain in self.campaign.villains
            ],
            "active_battle": None
            if battle is None
            else {
                "battle_attempt_id": battle.battle_attempt_id,
                "villain_id": battle.villain_id,
                "question_number": battle.position + 1,
                "question_count": len(battle.questions),
                "correct_count": battle.correct_count,
            },
            "pending_attempt_id": pending_id,
            "rules": {
                "unlock_threshold": self.rules.unlock_threshold,
                "battle_cost": self.rules.battle_cost,
                "battle_question_count": self.rules.battle_question_count,
                "battle_wins_required": self.rules.battle_wins_required,
                "correct_xp_by_difficulty": list(self.rules.correct_xp_by_difficulty),
            },
        }

    def get_status(self, account: Account) -> dict[str, Any]:
        """The small HUD view. The database stays the source of truth."""
        with self.connection() as conn:
            player = self._load_player(conn, account.user_id)
        return self._status(player)

    def _status(self, player: Player) -> dict[str, Any]:
        state = player.engine.state
        return {
            "schema_version": STATUS_SCHEMA_VERSION,
            "state_version": player.state_version,
            "xp": state.xp,
            "health": state.health,
            "max_health": self.rules.max_health,
            "adventure_unlocked": state.adventure_unlocked,
            "adventure_completed": player.engine.adventure_completed,
            "location": state.scene.value,
        }

    def export_progress(self, account: Account) -> bytes:
        """A gzip-compressed JSON copy of safe progress data.

        It holds no credentials, answer keys, prompts, or document content, and
        there is deliberately no endpoint to import it back.
        """
        with self.connection() as conn:
            player = self._load_player(conn, account.user_id)
            history = conn.execute(
                "SELECT a.id, a.mode, a.question_id, a.status, a.created_at,"
                " a.answered_at, q.topic, q.difficulty FROM attempts a"
                " JOIN questions q ON q.id = a.question_id"
                " WHERE a.owner_id = ? ORDER BY a.rowid",
                (account.user_id,),
            ).fetchall()
            results = {
                row["attempt_id"]: json.loads(row["result_json"])
                for row in conn.execute(
                    "SELECT attempt_id, result_json FROM submissions"
                    " WHERE owner_id = ?",
                    (account.user_id,),
                )
            }
        export = {
            "export_schema_version": EXPORT_SCHEMA_VERSION,
            "exported_at": db.utc_now(),
            "username": account.username,
            "status": self._status(player),
            "completed_villains": list(player.engine.state.completed_villains),
            "attempts": [
                {
                    "attempt_id": row["id"],
                    "mode": row["mode"],
                    "question_id": row["question_id"],
                    "topic": row["topic"],
                    "difficulty": row["difficulty"],
                    "status": row["status"],
                    "created_at": row["created_at"],
                    "answered_at": row["answered_at"],
                    "correct": results.get(row["id"], {}).get("correct"),
                    "xp_delta": results.get(row["id"], {}).get("xp_delta"),
                    "health_delta": results.get(row["id"], {}).get("health_delta"),
                }
                for row in history
            ],
        }
        return gzip.compress(json.dumps(export, indent=2).encode("utf-8"))

    # --- Helpers ---

    def _require_ready_set(
        self, conn: sqlite3.Connection, account: Account, set_id: str, mode: str
    ) -> None:
        row = conn.execute(
            "SELECT owner_id, mode, status FROM question_sets WHERE id = ?", (set_id,)
        ).fetchone()
        if row is None or row["owner_id"] != account.user_id:
            raise _not_found("question_set")
        if row["mode"] != mode or row["status"] != "ready":
            raise AppError(
                409,
                "question_set_unusable",
                f"That question set must be a ready {mode} set.",
            )

    def _choose_battle_questions(
        self,
        conn: sqlite3.Connection,
        owner_id: str,
        villain_id: str,
        question_set_id: str | None,
    ) -> tuple[QuestionRef, ...]:
        """Choose the least-used question at this villain's exact difficulty.

        The ground-zero campaign has one question per encounter: difficulty 1
        for the goblin, 3 for the troll, and 5 for the dragon finale.
        """
        rows = conn.execute(
            "SELECT q.id, q.difficulty, s.rowid AS set_order, q.position,"
            " (SELECT COUNT(*) FROM attempts a WHERE a.owner_id = q.owner_id"
            " AND a.question_id = q.id) AS uses"
            " FROM questions q JOIN question_sets s ON s.id = q.question_set_id"
            " WHERE q.owner_id = ? AND q.mode = 'adventure' AND s.status = 'ready'"
            " AND (? IS NULL OR s.id = ?)",
            (owner_id, question_set_id, question_set_id),
        ).fetchall()
        target = self.campaign.villain(villain_id).target_difficulty
        matching = [row for row in rows if row["difficulty"] == target]
        needed = self.rules.battle_question_count
        if len(matching) < needed:
            raise AppError(
                409,
                "not_enough_questions",
                f"The {self.campaign.villain(villain_id).name} needs "
                f"{needed} adventure question at difficulty {target}; you have "
                f"{len(matching)}. Generate an adventure set covering "
                "difficulties 1, 3, and 5.",
            )
        matching.sort(
            key=lambda r: (
                r["uses"],
                r["set_order"],
                r["position"],
            )
        )
        return tuple(QuestionRef(r["id"], r["difficulty"]) for r in matching[:needed])

    def _insert_attempt(
        self,
        conn: sqlite3.Connection,
        owner_id: str,
        attempt_id: str,
        question_id: str,
        mode: QuestionMode,
        battle_attempt_id: str | None,
    ) -> None:
        conn.execute(
            "INSERT INTO attempts (id, owner_id, question_id, mode,"
            " battle_attempt_id, status, created_at)"
            " VALUES (?, ?, ?, ?, ?, 'pending', ?)",
            (
                attempt_id,
                owner_id,
                question_id,
                mode.value,
                battle_attempt_id,
                db.utc_now(),
            ),
        )

    def _public_attempt(
        self,
        conn: sqlite3.Connection,
        owner_id: str,
        attempt_id: str,
        state: PlayerState,
    ) -> dict[str, Any]:
        """The question as the player may see it: no answer, no explanation."""
        attempt = conn.execute(
            "SELECT * FROM attempts WHERE id = ? AND owner_id = ?",
            (attempt_id, owner_id),
        ).fetchone()
        if attempt is None:
            raise AppError(500, "corrupt_state", "A pending attempt is missing.")
        question = _fetch_question(conn, attempt["question_id"])
        names = {
            row["id"]: row["display_name"]
            for row in conn.execute(
                "SELECT id, display_name FROM documents WHERE owner_id = ?",
                (owner_id,),
            )
        }
        options = (
            json.loads(question["options_json"]) if question["options_json"] else None
        )
        battle = state.active_battle
        battle_view = None
        if attempt["mode"] == QuestionMode.ADVENTURE.value and battle is not None:
            battle_view = {
                "battle_attempt_id": battle.battle_attempt_id,
                "villain_id": battle.villain_id,
                "villain_name": self.campaign.villain(battle.villain_id).name,
                "question_number": battle.position + 1,
                "question_count": len(battle.questions),
                "correct_count": battle.correct_count,
            }
        return {
            "attempt_id": attempt["id"],
            "question_id": question["id"],
            "mode": attempt["mode"],
            "type": question["question_type"],
            "prompt": question["prompt"],
            "options": options,
            "difficulty": question["difficulty"],
            "topic": question["topic"],
            "learning_objective": question["learning_objective"],
            "sources": [
                {
                    "document_id": source["document_id"],
                    "document_name": names.get(source["document_id"]),
                    "pages": source["pages"],
                }
                for source in json.loads(question["sources_json"])
            ],
            "battle": battle_view,
        }


_OUTCOMES = {
    BattleOutcome.IN_PROGRESS: "in_progress",
    BattleOutcome.WON: "won",
    BattleOutcome.LOST: "lost",
    BattleOutcome.KNOCKED_OUT: "knocked_out",
}


def _fetch_question(conn: sqlite3.Connection, question_id: str) -> sqlite3.Row:
    row: sqlite3.Row | None = conn.execute(
        "SELECT * FROM questions WHERE id = ?", (question_id,)
    ).fetchone()
    if row is None:
        raise AppError(500, "corrupt_state", "A stored question is missing.")
    return row


def _answer_key(question: sqlite3.Row) -> AnswerKey:
    answer = json.loads(question["answer_json"])
    grading = json.loads(question["grading_json"])
    question_type = QuestionType(question["question_type"])
    options = json.loads(question["options_json"]) if question["options_json"] else []
    return AnswerKey(
        question_type=question_type,
        numeric_answer=Decimal(answer["value"])
        if question_type is QuestionType.NUMERIC
        else None,
        tolerance=Decimal(grading.get("tolerance", "0")),
        correct_option_id=answer.get("option_id"),
        option_ids=tuple(option["id"] for option in options),
    )


def _answer_text(question: sqlite3.Row) -> str:
    """The correct answer for post-submission feedback only."""
    answer = json.loads(question["answer_json"])
    if question["question_type"] == QuestionType.NUMERIC.value:
        value = Decimal(answer["value"])
        if value == value.to_integral_value():
            return str(int(value))
        return str(value.normalize())
    options = json.loads(question["options_json"] or "[]")
    for option in options:
        if option["id"] == answer["option_id"]:
            return f"{option['id']}: {option['text']}"
    return str(answer["option_id"])
