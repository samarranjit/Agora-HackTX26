# Agora — Output

Sample artifacts from `ai_module.pdf_to_json`. Not read by the live game. The backend stores its own questions after the game master responds.

| File | Role |
| --- | --- |
| `learning_path.json` | Generated questions and topic path |
| `answer_key.json` | Private answers for that sample run |

Regenerate with:

```sh
python -m ai_module.pdf_to_json ai_module/sample.pdf --output-dir output
```
