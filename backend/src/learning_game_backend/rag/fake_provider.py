"""A stand-in game master for tests and the explicitly enabled demo mode.

Its questions are generated multiplication facts and do NOT come from the PDF.
They carry no page references because none exist. It is only used when
GAME_MASTER_MODE=fake, never as a fallback for a failing real provider.
"""

from learning_game_backend.rag.schemas import CONTRACT_VERSION, GenerationRequest


class FakeGameMaster:
    """Deterministic stand-in for tests and the explicit demo mode.

    Its questions are basic multiplication and do not come from the PDF. They
    carry no page references, because none exist.
    """

    name = "fake"

    def __init__(self) -> None:
        self.ingested: list[str] = []

    def ingest_document(self, document_id: str, filename: str, pdf: bytes) -> None:
        self.ingested.append(document_id)

    def generate_questions(self, request: GenerationRequest) -> object:
        span = request.difficulty_max - request.difficulty_min + 1
        questions = []
        for index in range(request.count):
            difficulty = request.difficulty_min + index % span
            left, right = difficulty + 1, index % 4 + 2
            questions.append(
                {
                    "id": f"fake-{index + 1}",
                    "type": "numeric",
                    "mode": request.mode.value,
                    "topic": request.topic,
                    "prompt": f"What is {left} × {right}?",
                    "answer": {"value": left * right},
                    "explanation": f"{left} groups of {right} make {left * right}.",
                    "difficulty": difficulty,
                    "sources": [{"document_id": request.document_ids[0]}],
                }
            )
        return {
            "schema_version": CONTRACT_VERSION,
            "generation": {
                "model": "fake-provider (not grounded in the PDF)",
                "prompt_version": "none",
            },
            "questions": questions,
        }
