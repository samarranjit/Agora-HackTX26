import json
from app import gemini

# Index the sample document, extract topics, generate questions for the first one
store_name = gemini.create_store_and_index("sample.pdf", "sample")
try:
    topics = gemini.extract_topics(store_name)
    print("Topics:", topics.topics)

    subject = gemini.generate_subject(store_name, topics.topics[0])
    print(json.dumps(subject.model_dump(), indent=2, ensure_ascii=False))
finally:
    gemini.delete_store(store_name)  # always clean up the test store