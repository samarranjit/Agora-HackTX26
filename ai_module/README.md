# Agora — Game Master

Gemini pipeline that indexes a PDF and writes multiple-choice questions. The backend calls it over HTTP. It never changes XP, health, or adventure state.

HTTP contract: [SERVICE.md](SERVICE.md). Backend spec: [`../backend/contracts/rag-contract.md`](../backend/contracts/rag-contract.md).

## Run

From the repository root:

```sh
python -m pip install -r ai_module/requirements.txt
# GEMINI_API_KEY and RAG_API_KEY in the environment or ai_module/.env
python -m ai_module.service          # http://127.0.0.1:9000
RAG_PORT=9100 python -m ai_module.service   # if 9000 is taken; set the backend's GAME_MASTER_URL to match
```

## Model and overload handling

Questions come from **`gemini-3.1-flash-lite`**, the cheapest model that does the job: about 5k tokens for a 10-question call, against about 66k for `gemini-3.5-flash-lite`. It is the only model unless `GEMINI_MODELS` lists more (comma separated, tried in order).

Google sometimes overloads a model (HTTP 429/503, or a call that hangs). Each call is abandoned after 45 s. A 429/503 is not retried by the SDK. With fallbacks configured, a failed model is skipped for 2 minutes and the next one is used. With one model, the service waits 8 s and asks again, up to 4 rounds, then answers HTTP 503 "The question generator is very busy right now. Please try again in a minute." A block for copying too much of a text is retried in the model's own words.

Offline CLI (same folder):

```sh
python -m ai_module.pdf_to_json ai_module/sample.pdf --output-dir output
```

```sh
GEMINI_API_KEY=test python -m unittest discover -s ai_module/tests -v
```

## Layout

```text
ai_module/
├── service.py            FastAPI RAG contract (documents, question-sets)
├── contract_adapter.py   maps Gemini output to the backend schema
├── gemini.py             model calls and File Search
├── learning.py           learning-path builder
├── pdf_to_json.py        CLI: PDF → output/
├── prompts.py            generation prompts
├── schemas.py            local question shapes
├── config.py             models, per-call timeout, model cooldown
├── test_key.py           key smoke check
├── tests/                contract and service tests
└── sample.pdf            fixture
```
