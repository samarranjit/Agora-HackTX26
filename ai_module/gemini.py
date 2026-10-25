import time
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

logger = logging.getLogger(__name__)

from google import genai
from pydantic import BaseModel, ValidationError

from . import prompts
from .config import MODEL, MAX_TOPICS, CHALLENGES_PER_TOPIC
from .schemas import TopicList, GeneratedSubject

client = genai.Client()


def create_store_and_index(file_path: str, display_name: str) -> str:
    """Create a File Search store, upload the document and wait until indexed.
    Returns the store name, used later to query the document."""
    logger.info("Creando File Search Store: %s", display_name)
    store = client.file_search_stores.create(config={
        "display_name": display_name,
        "embedding_model": "models/gemini-embedding-2",
    })
    logger.info("Store creado: %s", store.name)
    logger.info("Subiendo PDF: %s", file_path)
    upload_start = time.perf_counter()
    op = client.file_search_stores.upload_to_file_search_store(
        file=file_path,
        file_search_store_name=store.name,
        config={"display_name": display_name},
    )
    logger.info("Solicitud de subida aceptada en %.1fs; esperando indexacion", time.perf_counter() - upload_start)
    start = time.perf_counter()
    while not op.done:
        logger.info("Indexando PDF... %.1fs", time.perf_counter() - start)
        time.sleep(3)
        op = client.operations.get(op)
    logger.info("Operacion de indexacion terminada en %.1fs", time.perf_counter() - start)
    return store.name


def delete_store(store_name: str) -> None:
    logger.info("Eliminando File Search Store: %s", store_name)
    start = time.perf_counter()
    client.file_search_stores.delete(name=store_name, config={"force": True})
    logger.info("Store eliminado en %.1fs", time.perf_counter() - start)


def _generate(schema_cls: type[BaseModel], prompt: str, store_name: str, retries: int = 1):
    """Ask Gemini (grounded in the store) for JSON and validate it with Pydantic.
    If validation fails, retry once telling the model what went wrong."""
    last_error = None
    for attempt in range(1, retries + 2):
        full_prompt = prompt
        if last_error:
            full_prompt += (
                f"\n\nYour previous answer was invalid ({last_error}). "
                "Return valid JSON that follows the schema exactly."
            )
        logger.info("Consultando Gemini: schema=%s intento=%d/%d modelo=%s", schema_cls.__name__, attempt, retries + 1, MODEL)
        start = time.perf_counter()
        try:
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
        except Exception:
            logger.exception("Error en consulta Gemini: schema=%s tras %.1fs", schema_cls.__name__, time.perf_counter() - start)
            raise
        logger.info("Gemini respondio: schema=%s en %.1fs", schema_cls.__name__, time.perf_counter() - start)
        try:
            validated = schema_cls.model_validate_json(interaction.output_text)
            logger.info("JSON validado: schema=%s", schema_cls.__name__)
            return validated
        except ValidationError as e:
            last_error = str(e)[:300]
            logger.warning("JSON invalido: schema=%s intento=%d/%d: %s", schema_cls.__name__, attempt, retries + 1, last_error)
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