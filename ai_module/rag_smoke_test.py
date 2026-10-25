"""Prueba opcional de indexación + RAG: python -m ai_module.rag_smoke_test [pdf]."""
import argparse
from pathlib import Path
from . import gemini
from .config import MODEL

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", nargs="?", default=str(Path(__file__).with_name("sample.pdf")))
    args = parser.parse_args()
    store_name = gemini.create_store_and_index(args.pdf, Path(args.pdf).stem)
    try:
        interaction = gemini.client.interactions.create(
            model=MODEL, input="List the 5 main topics of this document, one line each.",
            tools=[{"type": "file_search", "file_search_store_names": [store_name]}],
        )
        print(interaction.output_text)
        for step in interaction.steps:
            if step.type == "model_output":
                for block in step.content:
                    if block.type == "text" and block.annotations:
                        for annotation in block.annotations:
                            if annotation.type == "file_citation":
                                print("Source:", annotation.file_name)
    finally:
        gemini.delete_store(store_name)

if __name__ == "__main__":
    main()
