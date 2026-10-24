"""Database migrations, constraints, and transactions."""

import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from learning_game_backend.auth import service as accounts
from learning_game_backend.persistence import database as db
from learning_game_backend.persistence.migrations import MIGRATIONS, migrate


class MigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        self.path = Path(temp_dir.name) / "nested" / "game.sqlite3"

    def test_migrate_creates_the_schema_and_is_repeatable(self) -> None:
        self.assertEqual(migrate(self.path), len(MIGRATIONS))
        self.assertEqual(migrate(self.path), len(MIGRATIONS))
        with closing(db.connect(self.path)) as conn:
            tables = {
                row[0]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
        for table in ("users", "player_states", "questions", "attempts", "submissions"):
            self.assertIn(table, tables)

    def test_a_newer_database_is_refused(self) -> None:
        migrate(self.path)
        with closing(db.connect(self.path)) as conn:
            conn.execute("PRAGMA user_version = 99")
        with self.assertRaisesRegex(RuntimeError, "newer"):
            migrate(self.path)

    def test_constraints_reject_impossible_player_values(self) -> None:
        migrate(self.path)
        insert = "INSERT INTO player_states VALUES (?, '{}', ?, ?, 100, 0, 1, 'n', 'n')"
        with closing(db.connect(self.path)) as conn:
            account = accounts.register(conn, "ada", "long enough pw")
            for xp, health in ((-1, 10), (5, -1), (5, 101)):
                with (
                    self.subTest(xp=xp, health=health),
                    self.assertRaises(sqlite3.IntegrityError),
                    db.transaction(conn),
                ):
                    conn.execute(insert, (account.user_id, xp, health))

    def test_a_failing_transaction_rolls_back(self) -> None:
        migrate(self.path)
        with closing(db.connect(self.path)) as conn:
            with self.assertRaises(RuntimeError), db.transaction(conn):
                conn.execute("INSERT INTO users VALUES ('u1', 'x', 'h', 'now')")
                raise RuntimeError("boom")
            self.assertEqual(
                conn.execute("SELECT COUNT(*) FROM users").fetchone()[0], 0
            )


if __name__ == "__main__":
    unittest.main()
