# Central place for tunable values
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

# The model that writes questions: always the cheapest. Measured on one 10-question call:
# gemini-3.1-flash-lite ~5k tokens, gemini-3.5-flash-lite ~66k, gemini-3.5-flash ~114k.
# GEMINI_MODELS (comma separated) can add fallbacks, tried in order when one is overloaded;
# by default there are none, so the cheapest model is the only one ever used.
_DEFAULT_MODELS = ("gemini-3.1-flash-lite",)
MODELS = tuple(m.strip() for m in os.environ.get("GEMINI_MODELS", "").split(",") if m.strip()) or _DEFAULT_MODELS
MODEL = MODELS[0]  # the preferred model; also what the original learning-path scripts use
# The SDK retries a rejected request itself. Keep that short so a busy model falls back
# to the next one in seconds instead of minutes.
SDK_ATTEMPTS = 2
SDK_RETRY_MAX_DELAY_SECONDS = 4.0
# 429 (rate limit) and 503 (overloaded) are deliberately NOT retried by the SDK: waiting on a
# busy model is slower than asking the next one, which the service does at once.
SDK_RETRY_STATUS_CODES = (408, 500, 502, 504)
CALL_TIMEOUT_SECONDS = 45.0  # a normal 10-question call takes 15-25 s; a hanging one is abandoned
MODEL_COOLDOWN_SECONDS = 120  # a model that just failed is skipped for this long
MAX_TOPICS = 5            # topics extracted per document
CHALLENGES_PER_TOPIC = 5  # 5 x 5 = 25 challenges = 125 XP, enough to reach 100
XP_PER_CHALLENGE = 5      # XP awarded per correct answer in learning mode