"""Request and response schemas for the HTTP API.

Responses are serialized through these models, so only the fields declared
here can ever leave the server. None of them has a field for answer keys,
grading rubrics, or storage paths. Request models forbid unknown fields, so a
client cannot send its own correctness, difficulty, XP, or health.
"""

from typing import Literal

from learning_game_engine.rules import MAX_DIFFICULTY, MIN_DIFFICULTY
from pydantic import BaseModel, ConfigDict, Field, model_validator

from learning_game_backend.rag.schemas import QuestionMode

ID_PATTERN = r"^[0-9a-f]{32}$"
Status = Literal["pending", "processing", "ready", "failed"]


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Errors ---


class ErrorBody(BaseModel):
    code: str = Field(examples=["insufficient_xp"])
    message: str
    details: list[dict[str, object]] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


# --- Accounts ---


class Credentials(StrictRequest):
    username: str = Field(min_length=1, max_length=64, examples=["ada"])
    password: str = Field(min_length=1, max_length=256)


class AccountResponse(BaseModel):
    user_id: str
    username: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: str


# --- Documents and question sets ---


class DocumentResponse(BaseModel):
    document_id: str
    name: str
    size_bytes: int
    page_count: int
    status: Status
    error: str | None
    created_at: str
    updated_at: str


class QuestionSetRequest(StrictRequest):
    document_ids: list[str] = Field(min_length=1, max_length=10)
    mode: QuestionMode
    topic: str = Field(min_length=1, max_length=200, examples=["Photosynthesis"])
    count: int = Field(ge=1, le=50)
    difficulty_min: int = Field(
        default=MIN_DIFFICULTY, ge=MIN_DIFFICULTY, le=MAX_DIFFICULTY
    )
    difficulty_max: int = Field(
        default=MAX_DIFFICULTY, ge=MIN_DIFFICULTY, le=MAX_DIFFICULTY
    )

    @model_validator(mode="after")
    def check_range(self) -> "QuestionSetRequest":
        if self.difficulty_min > self.difficulty_max:
            raise ValueError("difficulty_min cannot exceed difficulty_max")
        for document_id in self.document_ids:
            if len(document_id) != 32 or not document_id.isalnum():
                raise ValueError("document_ids must be document IDs from the upload")
        return self


class QuestionSummary(BaseModel):
    question_id: str
    type: str
    topic: str
    difficulty: int


class QuestionSetResponse(BaseModel):
    question_set_id: str
    mode: QuestionMode
    topic: str
    status: Status
    error: str | None
    provider: str
    requested_count: int
    difficulty_min: int
    difficulty_max: int
    document_ids: list[str]
    generation: dict[str, str]
    questions: list[QuestionSummary]
    created_at: str
    updated_at: str


# --- Study packs (one PDF upload -> practice and adventure questions) ---


class StudyPackSet(BaseModel):
    question_set_id: str
    mode: QuestionMode
    status: Status
    error: str | None
    question_count: int


class StudyPackResponse(BaseModel):
    """Progress of one uploaded PDF. The pack is playable when status is "ready"."""

    document_id: str = Field(description="Identifies the pack; use it to poll.")
    name: str
    topic: str
    status: Status
    stage: Literal["indexing", "writing_questions", "done", "failed"]
    error: str | None
    practice: StudyPackSet | None = Field(description="Null until indexing finishes.")
    adventure: StudyPackSet | None = Field(description="Null until indexing finishes.")
    created_at: str
    updated_at: str


class StudyPackListResponse(BaseModel):
    study_packs: list[StudyPackResponse]


# --- Questions and answers ---


class PublicOption(BaseModel):
    id: str
    text: str


class SourceAttribution(BaseModel):
    document_id: str
    document_name: str | None
    pages: list[int] = Field(description="Empty when the pipeline gave no pages.")


class BattleContext(BaseModel):
    battle_attempt_id: str
    villain_id: str
    villain_name: str
    question_number: int
    question_count: int
    correct_count: int


class PublicQuestion(BaseModel):
    """A question as the player sees it before answering."""

    attempt_id: str
    question_id: str
    mode: QuestionMode
    type: str
    prompt: str
    options: list[PublicOption] | None
    difficulty: int = Field(description="1 (easiest) to 5 (hardest).")
    topic: str
    learning_objective: str | None
    sources: list[SourceAttribution]
    battle: BattleContext | None


class OptionalQuestionSet(StrictRequest):
    question_set_id: str | None = Field(default=None, pattern=ID_PATTERN)


class PracticeAttemptResponse(BaseModel):
    created: bool = Field(
        description="False when an already pending question is returned."
    )
    attempt: PublicQuestion


class BattleStartResponse(BaseModel):
    battle_attempt_id: str
    villain_id: str
    villain_name: str
    entry_cost: int
    xp: int
    health: int
    state_version: int
    attempt: PublicQuestion


class ActiveAttemptResponse(BaseModel):
    attempt: PublicQuestion | None


class AnswerRequest(StrictRequest):
    answer: str = Field(
        min_length=1,
        max_length=200,
        description="A number, or an option id for multiple choice.",
        examples=["12"],
    )


class Feedback(BaseModel):
    correct_answer: str
    explanation: str


class Encounter(BaseModel):
    mode: QuestionMode
    outcome: Literal["none", "in_progress", "won", "lost", "knocked_out"]
    villain_id: str | None = None
    question_number: int | None = None
    question_count: int | None = None
    correct_count: int | None = None
    adventure_unlocked_now: bool
    adventure_completed: bool


class AnswerResponse(BaseModel):
    attempt_id: str
    correct: bool
    feedback: Feedback
    xp_delta: int = Field(description="The change actually applied, after clamping.")
    xp: int
    health_delta: int
    health: int
    max_health: int
    encounter: Encounter
    next_attempt: PublicQuestion | None
    state_version: int


# --- Player state ---


class VillainView(BaseModel):
    villain_id: str
    name: str
    status: Literal["completed", "current", "locked"]


class ActiveBattleView(BaseModel):
    battle_attempt_id: str
    villain_id: str
    question_number: int
    question_count: int
    correct_count: int


class RulesView(BaseModel):
    unlock_threshold: int
    battle_cost: int
    battle_question_count: int
    battle_wins_required: int
    correct_xp_by_difficulty: list[int]


class PlayerStateResponse(BaseModel):
    username: str
    state_version: int
    updated_at: str
    xp: int
    health: int
    max_health: int
    adventure_unlocked: bool
    adventure_completed: bool
    location: str
    practice_answered: int
    villains: list[VillainView]
    active_battle: ActiveBattleView | None
    pending_attempt_id: str | None
    rules: RulesView


class StatusResponse(BaseModel):
    """Everything a HUD needs, and nothing else."""

    schema_version: int
    state_version: int
    xp: int
    health: int
    max_health: int
    adventure_unlocked: bool
    adventure_completed: bool
    location: str


class ServiceHealth(BaseModel):
    status: Literal["ok"]
    game_master: str
