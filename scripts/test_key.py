from dotenv import load_dotenv
load_dotenv()  # carga GEMINI_API_KEY desde .env

from google import genai

client = genai.Client()
r = client.models.generate_content(
    model="gemini-3.5-flash",
    contents="Reply with: the key works",
)
print(r.text)