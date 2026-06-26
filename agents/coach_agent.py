"""
CoachAgent — interprets the runner profile and decides what to search for.

Responsibilities:
  - Resolve race distances to search (based on level + supplied distance)
  - Resolve months to search (next 3 months if not supplied)
  - Generate beginner guidance text for STARTER runners
  - Return a CoachDecision

Zero LLM calls — everything here is pure Python / deterministic logic.
This eliminates one full API call per run and makes the agent independently
testable without any API key.
"""

from calendar import month_name
from datetime import date

from agents.base_agent import BaseAgent
from models.runner import RunnerLevel, RunnerProfile, CoachDecision


# Beginner guidance template — no LLM needed for this
_STARTER_GUIDANCE = (
    "Welcome to your running journey! Starting with a 5K is the perfect first goal — "
    "it's achievable, exciting, and gives you a real race-day experience. "
    "parkrun is a fantastic free weekly 5K held every Saturday in parks near you — "
    "friendly, timed, and welcoming to all paces including walking. "
    "You've got this! 🏃"
)

_STARTER_GUIDANCE_WITH_DISTANCE = (
    "Great choice setting a goal distance! Taking it step by step is the smartest approach. "
    "parkrun is a brilliant free weekly 5K every Saturday — a perfect regular training run "
    "as you build toward your target. You've got this! 🏃"
)


class CoachAgent(BaseAgent):
    """
    Resolves search parameters using pure Python — no LLM calls.

    This agent is fully deterministic and testable without an API key.
    """

    prompt_file = ""  # No LLM prompt needed

    _COMMON_DISTANCES = ["5K", "10K", "Half Marathon", "Marathon"]
    _STARTER_DEFAULT = ["5K"]

    def run(self, profile: RunnerProfile) -> CoachDecision:
        """
        Analyse the runner profile and return a CoachDecision.

        Parameters
        ----------
        profile:
            The validated runner profile from the CLI.

        Returns
        -------
        CoachDecision
            Distances to search, months to search, optional beginner guidance.
            All values are resolved deterministically — zero API calls made.
        """
        distances = self._resolve_distances(profile)
        months = self._resolve_months(profile)
        guidance = self._resolve_guidance(profile)

        return CoachDecision(
            distances=distances,
            months_to_search=months,
            beginner_guidance=guidance,
            reasoning=self._build_reasoning(profile, distances, months),
        )

    # ------------------------------------------------------------------
    # Internal helpers — all pure Python
    # ------------------------------------------------------------------

    def _resolve_distances(self, profile: RunnerProfile) -> list[str]:
        """
        Deterministically resolve the list of distances to search.

        STARTER + no distance  → ["5K"]
        STARTER + distance     → [distance]
        RUNNER  + no distance  → all common distances
        RUNNER  + distance     → [distance]
        """
        if profile.distance:
            return [profile.distance]
        if profile.level == RunnerLevel.STARTER:
            return self._STARTER_DEFAULT
        return self._COMMON_DISTANCES

    def _resolve_months(self, profile: RunnerProfile) -> list[str]:
        """
        Resolve months to search.

        If the user supplied a month, use only that.
        Otherwise return the next 3 calendar months from today.
        """
        if profile.month:
            return [profile.month]

        today = date.today()
        months = []
        for offset in range(3):
            month_index = (today.month - 1 + offset) % 12 + 1
            months.append(month_name[month_index])
        return months

    def _resolve_guidance(self, profile: RunnerProfile) -> str | None:
        """Return beginner guidance text for STARTER runners only."""
        if profile.level != RunnerLevel.STARTER:
            return None
        if profile.distance:
            return _STARTER_GUIDANCE_WITH_DISTANCE
        return _STARTER_GUIDANCE

    def _build_reasoning(
        self,
        profile: RunnerProfile,
        distances: list[str],
        months: list[str],
    ) -> str:
        return (
            f"Level={profile.level.value}, "
            f"distances={distances}, "
            f"months={months} "
            f"(resolved deterministically — no LLM call)"
        )
