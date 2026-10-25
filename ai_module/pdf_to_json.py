"""CLI: python -m ai_module.pdf_to_json /ruta/documento.pdf [enfoque]."""
import argparse
import json
import logging
import time

logger = logging.getLogger(__name__)
from pathlib import Path
from . import gemini
from .learning import build_learning_path

def convert_pdf(pdf_path: str, focus: str | None = None, output_dir: str | None = None):
    """Indexa el PDF, genera preguntas y guarda JSON público y privado."""
    source = Path(pdf_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Archivo no encontrado: {source}")
    logger.info("Iniciando PDF: %s", source)
    total_start = time.perf_counter()
    name = source.stem
    store_name = gemini.create_store_and_index(str(source), name)
    logger.info("PDF indexado, iniciando generacion de learning path")
    try:
        response, stored = build_learning_path(store_name, focus)
        logger.info("Learning path generado")
    finally:
        gemini.delete_store(store_name)
    target = Path(output_dir).expanduser().resolve() if output_dir else source.parent / "output"
    target.mkdir(parents=True, exist_ok=True)
    public_file = target / "learning_path.json"
    answers_file = target / "answer_key.json"
    public_file.write_text(json.dumps(response.model_dump(by_alias=True), indent=2, ensure_ascii=False), encoding="utf-8")
    answers_file.write_text(json.dumps([c.model_dump() for c in stored], indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Archivos JSON guardados: %s y %s", public_file, answers_file)
    logger.info("Proceso terminado en %.1fs", time.perf_counter() - total_start)
    return public_file, answers_file

def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s", datefmt="%H:%M:%S")
    parser = argparse.ArgumentParser(description="Convierte un PDF en una ruta de aprendizaje")
    parser.add_argument("pdf_path")
    parser.add_argument("focus", nargs="?", default=None)
    parser.add_argument("--output-dir", default=None)
    args = parser.parse_args()
    public_file, answers_file = convert_pdf(args.pdf_path, args.focus, args.output_dir)
    print(f"Archivos generados: {public_file} y {answers_file}")

if __name__ == "__main__":
    main()
