"""What the backend requires from a game master provider.

HttpGameMaster (http_client.py) and FakeGameMaster (fake_provider.py) both
satisfy GameMaster. Replace or add providers here without touching gameplay.
"""

from typing import Protocol

from learning_game_backend.rag.schemas import GenerationRequest


class ProviderError(Exception):
    """The game master failed or could not be reached. The message is safe to show."""


class ProviderTimeout(ProviderError):
    pass


class GameMaster(Protocol):
    """What the API needs from a game master provider."""

    name: str

    def ingest_document(self, document_id: str, filename: str, pdf: bytes) -> None:
        """Index a PDF. Raises ProviderError if it cannot be ingested."""
        ...

    def generate_questions(self, request: GenerationRequest) -> object:
        """Return raw decoded JSON in the contract format. Raises ProviderError."""
        ...
