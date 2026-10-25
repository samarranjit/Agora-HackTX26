# Central place for tunable values
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

# Models for writing questions, tried in order: the cheapest first, and the next one
# only when the previous is overloaded or unavailable. Measured on one 10-question call:
# gemini-3.1-flash-lite ~5k tokens, gemini-3.5-flash-lite ~66k, gemini-3.5-flash ~114k.
# Override with GEMINI_MODELS (comma separated).
_DEFAULT_MODELS = ("gemini-3.1-flash-lite", "gemini-3.5-flash-lite")
MODELS = tuple(m.strip() for m in os.environ.get("GEMINI_MODELS", "").split(",") if m.strip()) or _DEFAULT_MODELS
MODEL = MODELS[0]  # the preferred model; also what the original learning-path scripts use
# The SDK retries a rejected request itself. Keep that short so a busy model falls back
# to the next one in seconds instead of minutes.
SDK_ATTEMPTS = 2
SDK_RETRY_MAX_DELAY_SECONDS = 4.0
MAX_TOPICS = 5            # topics extracted per document
CHALLENGES_PER_TOPIC = 5  # 5 x 5 = 25 challenges = 125 XP, enough to reach 100
XP_PER_CHALLENGE = 5      # XP awarded per correct answer in learning mode