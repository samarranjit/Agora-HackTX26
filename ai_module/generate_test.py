"""Prueba opcional: python -m ai_module.generate_test [pdf]."""
import argparse
import json
from pathlib import Path
from . import gemini

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", nargs="?", default=str(Path(__file__).with_name("sample.pdf")))
    args = parser.parse_args()
    store_name = gemini.create_store_and_index(args.pdf, Path(args.pdf).stem)
    try:
        topics = gemini.extract_topics(store_name)
        print("Topics:", topics.topics)
        subject = gemini.generate_subject(store_name, topics.topics[0])
        print(json.dumps(subject.model_dump(), indent=2, ensure_ascii=False))
    finally:
        gemini.delete_store(store_name)

if __name__ == "__main__":
    main()
