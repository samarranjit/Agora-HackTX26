import time
from dotenv import load_dotenv

load_dotenv()  # loads GEMINI_API_KEY from .env

from google import genai
from pydantic import BaseModel, ValidationError

from app import prompts
from app.config import MODEL, MAX_TOPICS, CHALLENGES_PER_TOPIC
from app.schemas import TopicList, GeneratedSubject

client = genai.Client()


def create_store_and_index(file_path: str, display_name: str) -> str:
    """Create a File Search store, upload the document and wait until indexed.
    Returns the store name, used later to query the document."""
    store = client.file_search_stores.create(config={
        "display_name": display_name,
        "embedding_model": "models/gemini-embedding-2",
    })
    op = client.file_search_stores.upload_to_file_search_store(
        file=file_path,
        file_search_store_name=store.name,
        config={"display_name": display_name},
    )
    while not op.done:
        time.sleep(3)
        op = client.operations.get(op)
    return store.name


def delete_store(store_name: str) -> None:
    client.file_search_stores.delete(name=store_name, config={"force": True})


def _generate(schema_cls: type[BaseModel], prompt: str, store_name: str, retries: int = 1):
    """Ask Gemini (grounded in the store) for JSON and validate it with Pydantic.
    If validation fails, retry once telling the model what went wrong."""
    last_error = None
    for _ in range(retries + 1):
        full_prompt = prompt
        if last_error:
            full_prompt += (
                f"\n\nYour previous answer was invalid ({last_error}). "
                "Return valid JSON that follows the schema exactly."
            )
        interaction = client.interactions.create(
            model=MODEL,
            input=full_prompt,
            tools=[{"type": "file_search", "file_search_store_names": [store_name]}],
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": schema_cls.model_json_schema(),
            },
        )
        try:
            return schema_cls.model_validate_json(interaction.output_text)
        except ValidationError as e:
            last_error = str(e)[:300]
    raise ValueError(f"Gemini returned invalid JSON after retries: {last_error}")


def extract_topics(store_name: str, focus: str | None = None) -> TopicList:
    """Pass 1: find the main topics of the whole document."""
    return _generate(TopicList, prompts.topics_prompt(MAX_TOPICS, focus), store_name)


def generate_subject(store_name: str, topic: str) -> GeneratedSubject:
    """Pass 2: one RAG query per topic to generate its questions."""
    return _generate(
        GeneratedSubject,
        prompts.challenges_prompt(topic, CHALLENGES_PER_TOPIC),
        store_name,
    )