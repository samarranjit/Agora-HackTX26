"""Player accounts and login sessions for the API server.

Passwords are hashed with Argon2 (argon2-cffi). A login returns a random
opaque bearer token from `secrets.token_urlsafe`; only its SHA-256 digest is
stored, so a leaked database does not reveal usable tokens. Tokens are sent in
the Authorization header rather than cookies, so cross-site request forgery
does not apply. Use HTTPS in any deployment: a bearer token is a password
substitute.

There is no development login bypass.
"""

import hashlib
import re
import secrets
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from learning_game_backend.persistence.database import transaction, utc_now

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 256

_hasher = PasswordHasher()
# Verified against when the username does not exist, so a failed login takes
# about as long either way and does not reveal which usernames are taken.
_DUMMY_HASH = _hasher.hash("not-a-real-password")


class AccountError(Exception):
    """Registration or login failed. The message is safe to show."""


@dataclass(frozen=True)
class Account:
    user_id: str
    username: str


@dataclass(frozen=True)
class Session:
    token: str
    expires_at: str


def validate_credentials(username: str, password: str) -> None:
    if not USERNAME_PATTERN.fullmatch(username):
        raise AccountError(
            "Usernames are 3-32 characters: letters, digits, '.', '_' or '-'."
        )
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise AccountError(
            f"Passwords must be {MIN_PASSWORD_LENGTH}-{MAX_PASSWORD_LENGTH} characters."
        )


def register(conn: sqlite3.Connection, username: str, password: str) -> Account:
    """Create an account. Raises AccountError for bad input or a taken username."""
    validate_credentials(username, password)
    account = Account(user_id=uuid.uuid4().hex, username=username)
    password_hash = _hasher.hash(password)
    try:
        with transaction(conn):
            conn.execute(
                "INSERT INTO users (id, username, password_hash, created_at)"
                " VALUES (?, ?, ?, ?)",
                (account.user_id, username, password_hash, utc_now()),
            )
    except sqlite3.IntegrityError:
        raise AccountError("That username is already taken.") from None
    return account


def login(
    conn: sqlite3.Connection, username: str, password: str, ttl_hours: int
) -> Session:
    """Check the password and open a new session. Raises AccountError."""
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    stored_hash = row["password_hash"] if row is not None else _DUMMY_HASH
    try:
        _hasher.verify(stored_hash, password)
    except (VerificationError, InvalidHashError):
        raise AccountError("Incorrect username or password.") from None
    if row is None:
        raise AccountError("Incorrect username or password.")

    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    expires_at = (now + timedelta(hours=ttl_hours)).isoformat(timespec="seconds")
    with transaction(conn):
        # Housekeeping: a login also removes this account's expired sessions.
        conn.execute(
            "DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?",
            (row["id"], now.isoformat(timespec="seconds")),
        )
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at)"
            " VALUES (?, ?, ?, ?)",
            (_digest(token), row["id"], now.isoformat(timespec="seconds"), expires_at),
        )
        if _hasher.check_needs_rehash(stored_hash):
            conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (_hasher.hash(password), row["id"]),
            )
    return Session(token=token, expires_at=expires_at)


def delete_account(conn: sqlite3.Connection, user_id: str) -> None:
    """Remove an account and, through foreign keys, everything it owns."""
    with transaction(conn):
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


def authenticate(conn: sqlite3.Connection, token: str) -> Account | None:
    """Return the account for a valid, unexpired token, else None."""
    row = conn.execute(
        "SELECT users.id, users.username, sessions.expires_at FROM sessions"
        " JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?",
        (_digest(token),),
    ).fetchone()
    if row is None or row["expires_at"] <= utc_now():
        return None
    return Account(user_id=row["id"], username=row["username"])


def logout(conn: sqlite3.Connection, token: str) -> None:
    with transaction(conn):
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_digest(token),))


def _digest(token: str) -> str:
    # A plain hash is appropriate here: the token is 256 bits of randomness,
    # so it cannot be guessed the way a password can.
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
