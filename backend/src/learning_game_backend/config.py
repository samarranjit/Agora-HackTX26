"""Server settings, read from environment variables.

Only the API server uses these. Secrets (the game
master API key) are read from the environment and never logged or returned.
See .env.example for every variable.
"""

import os
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path


class GameMasterMode(StrEnum):
    # No provider: uploads and generation return 503 instead of faking content.
    DISABLED = "disabled"
    # A real game master service reached over HTTP (see INTEGRATION_GUIDE.md).
    HTTP = "http"
    # Deterministic multiplication questions that ignore the PDF's text.
    # For local demos and tests only; never enabled implicitly.
    FAKE = "fake"


class ConfigError(ValueError):
    pass


# An exact origin: scheme and host (and optional port), no path, no wildcard.
_ORIGIN_PATTERN = re.compile(r"^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$")


_Getter = Callable[[str], str | None]


def default_data_dir() -> Path:
    """The project's var/ folder in a source checkout, else ~/.learning-game/server."""
    package_dir = Path(__file__).resolve().parent
    project_dir = package_dir.parent.parent
    if package_dir.parent.name == "src" and (project_dir / "pyproject.toml").is_file():
        return project_dir / "var"
    return Path.home() / ".learning-game" / "server"


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=default_data_dir)
    max_upload_bytes: int = 20 * 1024 * 1024
    session_ttl_hours: int = 24 * 7
    allow_registration: bool = True
    cors_origins: tuple[str, ...] = ()
    gzip_minimum_bytes: int = 1000
    game_master_mode: GameMasterMode = GameMasterMode.DISABLED
    game_master_url: str | None = None
    game_master_api_key: str | None = field(default=None, repr=False)
    game_master_timeout_seconds: float = 60.0

    @property
    def database_path(self) -> Path:
        return self.data_dir / "learning_game.sqlite3"

    @property
    def documents_dir(self) -> Path:
        return self.data_dir / "documents"

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        """Build settings from environment variables. Raises ConfigError."""
        source = os.environ if env is None else env

        def get(name: str) -> str | None:
            value = source.get(name, "").strip()
            return value or None

        mode_text = get("GAME_MASTER_MODE") or GameMasterMode.DISABLED.value
        try:
            mode = GameMasterMode(mode_text)
        except ValueError:
            choices = ", ".join(m.value for m in GameMasterMode)
            raise ConfigError(f"GAME_MASTER_MODE must be one of: {choices}") from None
        url = get("GAME_MASTER_URL")
        if mode is GameMasterMode.HTTP and url is None:
            raise ConfigError("GAME_MASTER_URL is required when GAME_MASTER_MODE=http")

        data_dir = get("LEARNING_GAME_DATA_DIR")
        origins = _origins(get("LEARNING_GAME_CORS_ORIGINS"))
        return cls(
            data_dir=Path(data_dir).expanduser() if data_dir else default_data_dir(),
            max_upload_bytes=_int(get, "LEARNING_GAME_MAX_UPLOAD_BYTES", 20 << 20),
            session_ttl_hours=_int(get, "LEARNING_GAME_SESSION_TTL_HOURS", 24 * 7),
            allow_registration=_bool(get, "LEARNING_GAME_ALLOW_REGISTRATION", True),
            cors_origins=origins,
            gzip_minimum_bytes=_int(get, "LEARNING_GAME_GZIP_MINIMUM_BYTES", 1000),
            game_master_mode=mode,
            game_master_url=url,
            game_master_api_key=get("GAME_MASTER_API_KEY"),
            game_master_timeout_seconds=float(
                _int(get, "GAME_MASTER_TIMEOUT_SECONDS", 60)
            ),
        )


def _origins(text: str | None) -> tuple[str, ...]:
    """Parse the CORS allow-list. Wildcards and paths are configuration errors.

    The API uses bearer tokens, so a wildcard would let any website's scripts
    call it with a token they obtained; require exact origins instead.
    """
    origins = tuple(item.strip() for item in (text or "").split(",") if item.strip())
    for origin in origins:
        if not _ORIGIN_PATTERN.fullmatch(origin):
            raise ConfigError(
                "LEARNING_GAME_CORS_ORIGINS must list exact origins such as "
                f"https://app.example.com (no wildcards or paths); got {origin!r}"
            )
    return origins


def _int(get: _Getter, name: str, default: int) -> int:
    text = get(name)
    if text is None:
        return default
    try:
        value = int(text)
    except ValueError:
        raise ConfigError(f"{name} must be a whole number") from None
    if value < 1:
        raise ConfigError(f"{name} must be at least 1")
    return value


def _bool(get: _Getter, name: str, default: bool) -> bool:
    text = get(name)
    if text is None:
        return default
    lowered = text.lower()
    if lowered in {"1", "true", "yes", "on"}:
        return True
    if lowered in {"0", "false", "no", "off"}:
        return False
    raise ConfigError(f"{name} must be true or false")
