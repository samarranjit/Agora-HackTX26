def topics_prompt(max_topics: int, focus: str | None) -> str:
    focus_line = (
        f"Only consider topics related to this focus: {focus}.\n" if focus else ""
    )
    return (
        "You are analyzing a study document to build a memory-training game.\n"
        f"Using ONLY the document, identify its {max_topics} main topics.\n"
        f"{focus_line}"
        "Each topic title must be short and specific (max 6 words).\n"
        "Write in the same language as the document."
    )


def challenges_prompt(topic: str, n: int) -> str:
    return (
        "You are creating multiple-choice questions for a memory-training game.\n"
        f"Topic: {topic}\n\n"
        f"Using ONLY information retrieved from the document about this topic, "
        f"write exactly {n} questions.\n\n"
        "Rules:\n"
        "- Each question tests one specific fact from the document, not general knowledge.\n"
        "- Exactly 4 options with ids a, b, c, d. Exactly one is correct.\n"
        "- Wrong options must be plausible, not obviously silly.\n"
        "- Spread the correct answers across a, b, c and d.\n"
        "- explanation: one sentence saying why the correct option is right.\n"
        "- mnemonic: one concrete visual scene (max 15 words) made of physical objects "
        "that encodes the CORRECT ANSWER itself, so picturing it brings the answer to mind. "
        "No abstract shapes or decoration.\n"
        "- source_quote: a short passage copied from the document (max 25 words) "
        "that supports the correct answer.\n"
        "- Write in the same language as the document."
    )