"""Accounts: password hashing and login sessions."""

import tempfile
import unittest
from pathlib import Path

from learning_game_backend.auth import service as accounts
from learning_game_backend.persistence import database as db
from learning_game_backend.persistence.migrations import migrate


class AccountTests(unittest.TestCase):
    def setUp(self) -> None:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        path = Path(temp_dir.name) / "game.sqlite3"
        migrate(path)
        self.conn = db.connect(path)
        self.addCleanup(self.conn.close)

    def test_passwords_are_hashed_and_tokens_are_stored_hashed(self) -> None:
        accounts.register(self.conn, "ada", "long enough pw")
        session = accounts.login(self.conn, "ada", "long enough pw", 1)
        stored = self.conn.execute("SELECT password_hash FROM users").fetchone()[0]
        self.assertTrue(stored.startswith("$argon2"))
        self.assertNotIn("long enough pw", stored)
        token_hash = self.conn.execute("SELECT token_hash FROM sessions").fetchone()[0]
        self.assertNotEqual(token_hash, session.token)
        account = accounts.authenticate(self.conn, session.token)
        assert account is not None
        self.assertEqual(account.username, "ada")

    def test_expired_sessions_are_rejected(self) -> None:
        accounts.register(self.conn, "ada", "long enough pw")
        session = accounts.login(self.conn, "ada", "long enough pw", 1)
        self.conn.execute(
            "UPDATE sessions SET expires_at = '2000-01-01T00:00:00+00:00'"
        )
        self.assertIsNone(accounts.authenticate(self.conn, session.token))

    def test_login_removes_the_accounts_expired_sessions(self) -> None:
        accounts.register(self.conn, "ada", "long enough pw")
        accounts.register(self.conn, "grace", "long enough pw")
        old = accounts.login(self.conn, "ada", "long enough pw", 1)
        other = accounts.login(self.conn, "grace", "long enough pw", 1)
        self.conn.execute(
            "UPDATE sessions SET expires_at = '2000-01-01T00:00:00+00:00'"
        )
        fresh = accounts.login(self.conn, "ada", "long enough pw", 1)
        rows = self.conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        self.assertEqual(rows, 2)  # ada's new session + grace's expired one
        self.assertIsNone(accounts.authenticate(self.conn, old.token))
        self.assertIsNone(accounts.authenticate(self.conn, other.token))
        self.assertIsNotNone(accounts.authenticate(self.conn, fresh.token))

    def test_delete_account_removes_its_sessions(self) -> None:
        account = accounts.register(self.conn, "ada", "long enough pw")
        session = accounts.login(self.conn, "ada", "long enough pw", 1)
        accounts.delete_account(self.conn, account.user_id)
        self.assertIsNone(accounts.authenticate(self.conn, session.token))

    def test_credential_rules(self) -> None:
        for username, password in (
            ("ab", "long enough pw"),
            ("bad name!", "long enough pw"),
            ("ada", "short"),
        ):
            with (
                self.subTest(username=username),
                self.assertRaises(accounts.AccountError),
            ):
                accounts.register(self.conn, username, password)


if __name__ == "__main__":
    unittest.main()
