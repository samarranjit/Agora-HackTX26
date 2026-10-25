"""HTTP client for a game master service that implements the RAG contract.

See contracts/rag-contract.md for the endpoints. Network failures and bad
responses become ProviderError with a message that is safe to show: raw
response bodies, URLs, and API keys are never forwarded.
"""

from typing import Any

import httpx

from learning_game_backend.rag.protocol import ProviderError, ProviderTimeout
from learning_game_backend.rag.schemas import CONTRACT_VERSION, GenerationRequest
from learning_game_backend.rag.validation import MAX_SHORT_TEXT


class HttpGameMaster:
    """Client for a game master service implementing the HTTP contract."""

    name = "http"

    def __init__(
        self,
        base_url: str,
        api_key: str | None,
        timeout_seconds: float,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers=headers,
            timeout=timeout_seconds,
            transport=transport,
        )
        self._timeout = timeout_seconds

    def ingest_document(self, document_id: str, filename: str, pdf: bytes) -> None:
        body = self._post(
            "/v1/documents",
            files={"file": (filename, pdf, "application/pdf")},
            data={"document_id": document_id},
        )
        status = body.get("status") if isinstance(body, dict) else None
        if status == "failed":
            raise ProviderError(_safe_message(body.get("error"), "Ingestion failed."))
        if status != "ready":
            raise ProviderError("The game master returned an unexpected status.")

    def generate_questions(self, request: GenerationRequest) -> object:
        return self._post(
            "/v1/question-sets",
            json={
                "contract_version": CONTRACT_VERSION,
                "question_set_id": request.question_set_id,
                "document_ids": list(request.document_ids),
                "topic": request.topic,
                "mode": request.mode.value,
                "count": request.count,
                "difficulty_min": request.difficulty_min,
                "difficulty_max": request.difficulty_max,
            },
        )

    def _post(self, path: str, **kwargs: Any) -> Any:
        try:
            response = self._client.post(path, **kwargs)
        except httpx.TimeoutException:
            raise ProviderTimeout(
                f"The game master did not respond within {self._timeout:g} seconds."
            ) from None
        except httpx.HTTPError:
            raise ProviderError("The game master could not be reached.") from None
        if response.status_code >= 400:
            detail = None
            try:
                payload = response.json()
                if isinstance(payload, dict):
                    detail = payload.get("error")
            except ValueError:
                pass
            raise ProviderError(
                _safe_message(
                    detail, f"The game master returned HTTP {response.status_code}."
                )
            )
        try:
            return response.json()
        except ValueError:
            raise ProviderError("The game master returned invalid JSON.") from None


def _safe_message(value: object, fallback: str) -> str:
    """Use a provider's error text only if it is a short plain string."""
    if isinstance(value, str) and value.strip():
        return value.strip()[:MAX_SHORT_TEXT]
    return fallback
