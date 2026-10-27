"""Command-line entry point: `learning-game-api serve | migrate | openapi`."""

import argparse
import json
import logging
import os
import sys
from collections.abc import Sequence
from pathlib import Path

import uvicorn
from fastapi import FastAPI

from learning_game_backend.api.app import create_app
from learning_game_backend.config import ConfigError, Settings
from learning_game_backend.persistence.migrations import migrate


def create_app_from_env() -> FastAPI:
    """Factory for uvicorn: reads settings from the environment."""
    return create_app()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="learning-game-api")
    commands = parser.add_subparsers(dest="command", required=True)
    serve = commands.add_parser("serve", help="run the API server")
    serve.add_argument("--host", default="127.0.0.1")
    # Hosts such as Render choose the port and pass it in $PORT.
    serve.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    commands.add_parser("migrate", help="create or upgrade the database")
    openapi = commands.add_parser("openapi", help="write the OpenAPI document")
    openapi.add_argument("output", type=Path, help="file to write, e.g. openapi.json")
    args = parser.parse_args(argv)

    try:
        settings = Settings.from_env()
    except ConfigError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2
    if args.command == "migrate":
        version = migrate(settings.database_path)
        print(f"Database at {settings.database_path} is at schema version {version}.")
        return 0
    if args.command == "openapi":
        # Uses an in-memory-free temporary data dir so nothing real is touched.
        import tempfile
        from dataclasses import replace

        with tempfile.TemporaryDirectory() as scratch:
            app = create_app(replace(settings, data_dir=Path(scratch)))
            document = app.openapi()
        args.output.write_text(
            json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(f"Wrote {args.output}")
        return 0
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(
        "learning_game_backend.main:create_app_from_env",
        factory=True,
        host=args.host,
        port=args.port,
    )
    return 0
