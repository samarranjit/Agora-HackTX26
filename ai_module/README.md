# ai_module

Paquete integrado en una sola carpeta a partir del código original.

Desde la carpeta **padre** de `ai_module`:

```powershell
python -m pip install -r ai_module/requirements.txt
python -m ai_module.test_key
python -m ai_module.pdf_to_json ai_module/sample.pdf --output-dir output
```

Configura `GEMINI_API_KEY` como variable de entorno o en `ai_module/.env`.

La lógica de `learning.py`, `gemini.py`, `schemas.py`, `prompts.py` y `config.py` viene del ZIP original; únicamente cambian los imports para usar el paquete `ai_module`.

No copies archivos antiguos encima del paquete. Reemplaza la carpeta completa después de hacer una copia de seguridad de tu `.env`.

---

**Game backend integration:** `service.py` exposes this pipeline to the game backend over HTTP. See [SERVICE.md](SERVICE.md).
