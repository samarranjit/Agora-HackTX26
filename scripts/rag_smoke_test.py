import time
from dotenv import load_dotenv
load_dotenv()

from google import genai

client = genai.Client()

# 1. Create the store (the container for the document's embeddings)
store = client.file_search_stores.create(config={
    "display_name": "smoke-test",
    "embedding_model": "models/gemini-embedding-2",
})
print("Store created:", store.name)

# 2. Upload + index the document
op = client.file_search_stores.upload_to_file_search_store(
    file="sample.pdf",
    file_search_store_name=store.name,
    config={"display_name": "sample"},
)
while not op.done:
    print("Indexing...")
    time.sleep(5)
    op = client.operations.get(op)
print("Indexed.")

# 3. Ask a question grounded in the document
interaction = client.interactions.create(
    model="gemini-3.5-flash",
    input="List the 5 main topics of this document, one line each.",
    tools=[{"type": "file_search", "file_search_store_names": [store.name]}],
)
print("\n" + interaction.output_text)

# 4. Show which parts of the document were cited
for step in interaction.steps:
    if step.type == "model_output":
        for block in step.content:
            if block.type == "text" and block.annotations:
                for a in block.annotations:
                    if a.type == "file_citation":
                        print("Source:", a.file_name)

# 5. Clean up the test store
client.file_search_stores.delete(name=store.name, config={"force": True})