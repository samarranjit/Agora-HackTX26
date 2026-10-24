import uuid
from concurrent.futures import ThreadPoolExecutor

from app import gemini
from app.config import XP_PER_CHALLENGE
from app.schemas import (
    LearningPathResponse, Progress, PublicChallenge, PublicSubject, StoredChallenge,
)


def build_learning_path(store_name: str, focus: str | None = None):
    """Given an already-indexed document, return:
    - the public JSON for the game (no correct answers)
    - the full challenges WITH answers (kept server-side / for your own checks)"""

    # Pass 1: find the main topics of the whole document
    topics = gemini.extract_topics(store_name, focus).topics

    # Pass 2: one RAG query per topic, run in parallel to cut total time
    with ThreadPoolExecutor(max_workers=len(topics)) as pool:
        generated = list(pool.map(lambda t: gemini.generate_subject(store_name, t), topics))

    subjects: list[PublicSubject] = []
    stored: list[StoredChallenge] = []
    n = 0
    for s_idx, subject in enumerate(generated, start=1):
        subject_id = f"subj_{s_idx}"
        public_challenges = []
        for ch in subject.challenges:
            n += 1
            # IDs are assigned by the server, never by Gemini
            sc = StoredChallenge(
                id=f"ch_{n}",
                subject_id=subject_id,
                question=ch.question,
                options=ch.options,
                correct_option_id=ch.correct_option_id,
                explanation=ch.explanation,
                mnemonic=ch.mnemonic,
                source_quote=ch.source_quote,
                xp_reward=XP_PER_CHALLENGE,
            )
            stored.append(sc)
            # The public version has no answer fields at all
            public_challenges.append(PublicChallenge(
                id=sc.id,
                question=sc.question,
                options=sc.options,
                mnemonic=sc.mnemonic,
                xp_reward=sc.xp_reward,
            ))
        subjects.append(PublicSubject(
            id=subject_id, title=subject.title, challenges=public_challenges,
        ))

    response = LearningPathResponse(
        session_id=f"ses_{uuid.uuid4().hex[:8]}",
        subjects=subjects,
        progress=Progress(xp=0, xp_to_unlock=100, adventure_unlocked=False),
    )
    return response, stored