"""Sample game master payloads shared by the RAG tests."""

from typing import Any

from learning_game_backend.rag.schemas import GenerationRequest, QuestionMode

DOCUMENT = "d" * 32
REQUEST = GenerationRequest(
    question_set_id="s" * 32,
    document_ids=(DOCUMENT,),
    topic="Cells",
    mode=QuestionMode.PRACTICE,
    count=3,
)


def numeric(question_id: str = "q1", **changes: Any) -> dict[str, Any]:
    question: dict[str, Any] = {
        "id": question_id,
        "type": "numeric",
        "prompt": "How many chromosomes do humans have?",
        "answer": {"value": 46},
        "explanation": "Humans have 23 pairs.",
        "difficulty": 3,
        "sources": [{"document_id": DOCUMENT, "pages": [4, 5]}],
    }
    question.update(changes)
    return question


def choice(question_id: str = "mc1") -> dict[str, Any]:
    return {
        "id": question_id,
        "type": "multiple_choice",
        "prompt": "Which organelle makes ATP?",
        "options": [
            {"id": "A", "text": "Nucleus"},
            {"id": "B", "text": "Mitochondrion"},
        ],
        "answer": {"option_id": "B"},
        "explanation": "Mitochondria produce ATP.",
        "difficulty": 2,
    }


def payload(*questions: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {"schema_version": 1, "questions": list(questions), **extra}
