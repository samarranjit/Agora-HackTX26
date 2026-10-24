import json
import os
import sys

# Make the project root importable no matter where the script is run from
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app import gemini
from app.services.learning import build_learning_path

# Usage: python scripts/pdf_to_json.py sample.pdf ["optional focus"]
pdf_path = sys.argv[1]
focus = sys.argv[2] if len(sys.argv) > 2 else None

name = os.path.splitext(os.path.basename(pdf_path))[0]
store_name = gemini.create_store_and_index(pdf_path, name)
try:
    response, stored = build_learning_path(store_name, focus)
finally:
    gemini.delete_store(store_name)  # always clean up the store

out_dir = os.path.join(ROOT, "output")
os.makedirs(out_dir, exist_ok=True)

# 1) What the game receives (camelCase, no correct answers)
with open(os.path.join(out_dir, "learning_path.json"), "w", encoding="utf-8") as f:
    json.dump(response.model_dump(by_alias=True), f, indent=2, ensure_ascii=False)

# 2) Answer key for YOUR checks (includes correct option + source quote)
with open(os.path.join(out_dir, "answer_key.json"), "w", encoding="utf-8") as f:
    json.dump([c.model_dump() for c in stored], f, indent=2, ensure_ascii=False)

print(f"Done: {len(stored)} challenges in {len(response.subjects)} subjects")
print("Files: output/learning_path.json and output/answer_key.json")