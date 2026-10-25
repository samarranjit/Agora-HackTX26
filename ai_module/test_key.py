"""Prueba opcional de credenciales: python -m ai_module.test_key."""
from . import gemini
from .config import MODEL

def main():
    result = gemini.client.models.generate_content(model=MODEL, contents="Reply with: the key works")
    print(result.text)

if __name__ == "__main__":
    main()
