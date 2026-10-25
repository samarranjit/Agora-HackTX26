# Gemini game master service

`service.py` lets the game backend (`../backend`) use this Gemini pipeline. It implements the
backend's RAG contract, version 1 (see `backend/contracts/rag-contract.md`), so the backend can
upload a player's PDF and ask for questions without knowing anything about Gemini.

The original scripts (`pdf_to_json.py` and the rest) are unchanged and still work.

```text
Backend --HTTP, Bearer key--> ai_module.service --> Gemini File Search
                              (this file)           (one store per PDF)
```

## Run it

From the repository root:

```sh
pip install -r ai_module/requirements.txt
export GEMINI_API_KEY=...        # or ai_module/.env
export RAG_API_KEY=...           # shared secret; the backend sends it as GAME_MASTER_API_KEY
python -m ai_module.service      # http://127.0.0.1:9000
```

Then start the backend with:

```sh
GAME_MASTER_MODE=http GAME_MASTER_URL=http://127.0.0.1:9000 \
GAME_MASTER_API_KEY=<same as RAG_API_KEY> GAME_MASTER_TIMEOUT_SECONDS=300 \
  uv run learning-game-api serve
```

| Variable | Default | Meaning |
|---|---|---|
| `GEMINI_API_KEY` | – | Required (read by the existing `gemini.py`) |
| `RAG_API_KEY` | – | Required. Requests must send `Authorization: Bearer <key>`. The service refuses to start without it unless `RAG_ALLOW_NO_AUTH=true` (local experiments only) |
| `GEMINI_MODELS` | `gemini-3.1-flash-lite` | The model that writes questions. By default only the cheapest model is used (about 5k tokens for a 10-question call, against about 66k for `gemini-3.5-flash-lite`). Listing more models, comma separated, allows fallbacks when one is overloaded. Which model wrote a set is recorded in its `generation.model` |
| `RAG_DATA_DIR` | `ai_module/.data` | Where PDFs and `registry.json` are kept (git-ignored) |
| `RAG_HOST`, `RAG_PORT` | `127.0.0.1`, `9000` | Where it listens |

## Endpoints

| Endpoint | What it does |
|---|---|
| `POST /v1/documents` (multipart `file`, `document_id`) | Indexes the PDF into its own Gemini store, keeps it, and returns `{"status": "ready"}` (or `{"status": "failed", "error": "..."}`). Repeating a known `document_id` does nothing. Can take a minute or more for large PDFs |
| `POST /v1/question-sets` (JSON) | Returns questions for the requested `topic`, `count` (1-50), `mode`, and difficulty range, in the contract format |
| `DELETE /v1/documents/{id}` | Extra: deletes the Gemini store, the saved PDF, and the registration, so stores do not pile up. The backend does not call it yet |
| `GET /healthz` | Liveness |

Errors are always `{"error": "short safe message"}` with an HTTP status of 400 or more, which
is what the backend shows to the player. Gemini's own error text is logged here, never returned.

## How it makes the pipeline fit the backend

| The backend needs | How the service provides it |
|---|---|
| Documents stay available for later requests | Each PDF gets its own Gemini store, kept until deleted. The old script deleted the store after one run. The `document_id → store` mapping is saved in `registry.json`, so a restart keeps it |
| Questions for a topic, a count, and a difficulty range | A new prompt (`contract_adapter.questions_prompt`) asks for exactly `count` questions about the topic, listing the difficulty to target for each. Requests over 10 questions are split into parallel batches |
| `difficulty` from 1 to 5 | Questions are spread evenly over the requested range (`plan_difficulties`): 5 questions over 1-5 give 1,2,3,4,5; 3 give **1,3,5**, the levels the backend's adventure needs. The prompt defines the 1-5 scale. The returned `difficulty` is the **planned** level for that position. If Gemini's own labels disagree, a warning is logged and the planned level is used, because the question was written for that level |
| `type`, options, the correct answer, an explanation | `multiple_choice`, options `a`-`d`, `answer: {"option_id": ...}`, one-sentence explanation. Same rules as the original prompts |
| Source references with pages | Gemini is asked for a short passage copied from the document. The service searches the saved PDF's text for it and returns page numbers only when it finds evidence: the whole passage on a page, ignoring case, punctuation and spaces (PDF text extraction often fuses or splits words), or, for longer passages, both the start and the end found in order on one page (tolerating a margin note spliced into the middle). If neither holds, no pages are returned. With one document the question still cites that document; with several documents and no match, no source is claimed. Pages are never guessed |
| Nothing that changes the game | `mnemonic` and the old `xp_reward` are dropped. XP and health come only from the game engine's rules |

## Tests

From the repository root (the test key is never used for a network call):

```sh
GEMINI_API_KEY=test python -m unittest discover -s ai_module/tests -v
```

They need the packages in `requirements.txt` plus `httpx` (used by FastAPI's test client). 63
tests cover the difficulty plan, the prompt, answer alignment, page lookup, authentication,
persistence across restarts, error shapes, and a check of every contract rule on the output.
Gemini is replaced by a stand-in, so they need no key or network.

## What has and has not been verified

- **Real Gemini (model `gemini-3.5-flash-lite`), run end to end with the real backend:** a
  27-page PDF (`sample_demo.pdf`) became a ready study pack in 24-38 seconds (indexing about
  10-18 s, writing the practice and adventure sets in parallel about 15-20 s). The questions were
  on topic, in valid contract format, with the requested difficulties (practice 1-4 by position,
  adventure exactly 1, 3, 5). The backend accepted every set, a player earned XP, unlocked
  the adventure, and defeated all three villains. No fallback or fake data was involved.
- **Page numbers on that real run:** 5 of 6 sampled questions carried a verified page. The
  first version, which required an exact match, found none: real PDF text has missing spaces and
  spliced margin notes. The current matcher found 22 of 24 on the committed sample output (strict
  matching found 18), and never disagreed with the strict matcher where both found a page.
- Tests: 63 offline tests (difficulty plan, prompt, alignment, page lookup including the real
  extraction glitches, recitation retries, authentication, persistence, error shapes, contract rules).
- **Not verified:** quality of the questions beyond reading a few; whether `difficulty` as
  judged by the model matches how hard players find a question; behavior on scanned PDFs,
  very large PDFs, or non-English documents; Gemini quota and rate limits under load.

## Known limits

- Indexing runs while the backend waits (up to its timeout). Gemini stores are not deleted automatically.
- Page numbers appear only when the quote can be located in the PDF's text (see above); some
  questions will have none. Scanned PDFs without a text layer get none.
- Parallel batches can repeat a question; duplicates are dropped, so a request can return slightly fewer than `count`.
  The backend accepts that for practice, but an adventure set needs all of its levels.
- When Gemini is overloaded, slow or down, each call is abandoned after 45 seconds (429 and 503 are not retried by
  the SDK). With the default single model the service waits 8 s and asks again, up to 4 rounds, then fails with
  "The question generator is very busy right now. Please try again in a minute." (HTTP 503). If `GEMINI_MODELS`
  lists fallbacks, a busy model hands over to the next one at once and is skipped for 2 minutes.
- Gemini sometimes blocks an answer as "copyright/recitation" (seen once on a textbook chapter).
  The service then asks again, up to 3 attempts in all, for questions in the model's own words
  and a shorter quote. If every attempt is blocked, that set fails with a safe error and the
  study pack must be submitted again.
- One service process, with a JSON registry file. It is not built for several instances.
