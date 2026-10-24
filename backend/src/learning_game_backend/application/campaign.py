"""The ordered villains and lesson length that a backend player progresses through.

The engine tracks progress against villain IDs and a slide count but owns no
content, so the backend supplies them here. Changing a villain ID invalidates
stored states that mention it, so treat these IDs as stable. Making the campaign
configurable or game-master-supplied is an open product decision.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class VillainInfo:
    id: str
    name: str


@dataclass(frozen=True)
class Campaign:
    villains: tuple[VillainInfo, ...]
    slide_count: int

    @property
    def villain_ids(self) -> tuple[str, ...]:
        return tuple(villain.id for villain in self.villains)

    def villain(self, villain_id: str) -> VillainInfo:
        """Raises KeyError if the villain is unknown."""
        for villain in self.villains:
            if villain.id == villain_id:
                return villain
        raise KeyError(villain_id)


DEFAULT_CAMPAIGN = Campaign(
    villains=(
        VillainInfo("forest-goblin", "Forest Goblin"),
        VillainInfo("bridge-troll", "Bridge Troll"),
        VillainInfo("castle-dragon", "Castle Dragon"),
    ),
    slide_count=3,
)
