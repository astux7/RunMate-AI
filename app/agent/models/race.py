"""
Race domain models.

Race             – a single race event
RaceSearchResult – output of a tool search (may be empty)
Recommendation   – a ranked race with an AI explanation
RunmateReport    – the full output report passed to OutputAgent
"""

from typing import Optional

from pydantic import BaseModel

from models.runner import RunnerProfile, CoachDecision


class ParkrunLocation(BaseModel):
    """A single local parkrun event with its homepage URL."""

    name: str
    url: str
    start_time: str = "Saturday 9:00am"


class Race(BaseModel):
    """A single running event."""

    name: str
    location: str
    date: Optional[str] = None
    distance: str
    url: Optional[str] = None
    is_parkrun: bool = False
    is_historical: bool = False  # True = typical/historical, not confirmed upcoming
    description: Optional[str] = None


class RaceSearchResult(BaseModel):
    """
    Output of a single tool search.

    source        – label for where the data came from ("official" / "parkrun")
    query_summary – human-readable description of what was searched
    found         – True when at least one race was returned
    races         – the list of Race objects (may be empty)
    """

    races: list[Race] = []
    source: str
    query_summary: str
    found: bool = False

    def model_post_init(self, __context: object) -> None:
        self.found = len(self.races) > 0


class Recommendation(BaseModel):
    """A race recommended by the RecommendationAgent."""

    race: Race
    rank: int
    explanation: str


class RunmateReport(BaseModel):
    """
    The complete output passed to OutputAgent for rendering.

    Carries every piece of data needed to produce the terminal report and the
    optional saved text file.
    """

    profile: RunnerProfile
    coach_decision: CoachDecision
    recommendations: list[Recommendation]
    search_summary: str
    used_parkrun_fallback: bool = False
    parkrun_local_events: list["ParkrunLocation"] = []
    historical_races: list[Race] = []
    historical_insight: str = ""
    travel_tip: str = ""
    disclaimer: str = (
        "RunMate AI provides informational recommendations only. "
        "Please consult a medical professional before starting any new exercise programme."
    )
