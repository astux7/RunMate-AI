"""
Runner domain models.

RunnerProfile  – validated input from the user
CoachDecision  – resolved search parameters produced by CoachAgent
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, field_validator


class RunnerLevel(str, Enum):
    """Experience level supplied by the user."""

    STARTER = "STARTER"
    RUNNER = "RUNNER"


class RunnerProfile(BaseModel):
    """Validated runner profile built from CLI arguments."""

    level: RunnerLevel
    location: str
    distance: Optional[str] = None
    month: Optional[str] = None

    @field_validator("location")
    @classmethod
    def location_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("location must not be empty")
        return v.strip()

    @field_validator("level", mode="before")
    @classmethod
    def normalise_level(cls, v: str) -> str:
        return v.upper() if isinstance(v, str) else v

    @field_validator("distance", mode="before")
    @classmethod
    def normalise_distance(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return v.strip() if v.strip() else None

    @field_validator("month", mode="before")
    @classmethod
    def normalise_month(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return v.strip().title() if v.strip() else None


class CoachDecision(BaseModel):
    """
    Output of CoachAgent.

    distances         – list of race distances the Race Search Agent should query
    months_to_search  – list of months to search (derived or user-supplied)
    beginner_guidance – friendly guidance text for STARTER runners (may be None)
    reasoning         – internal reasoning logged for transparency
    """

    distances: list[str]
    months_to_search: list[str]
    beginner_guidance: Optional[str] = None
    reasoning: str
