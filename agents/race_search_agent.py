"""
RaceSearchAgent — orchestrates search tools to find races.

Workflow:
  1. Call RaceSearchTool for official upcoming races.
  2. If no official races found → call ParkrunTool (local parkruns).
  3. If still no results → call YearRoundFallbackTool for historical/typical
     races held in that location across all months of the year.
  4. Return the best available RaceSearchResult, flags, and any insight text.
"""

from google import genai

from agents.base_agent import BaseAgent
from models.runner import RunnerProfile
from models.race import Race, RaceSearchResult
from tools.race_search_tool import RaceSearchTool
from tools.parkrun_tool import ParkrunTool
from tools.year_round_fallback_tool import YearRoundFallbackTool


class RaceSearchAgent(BaseAgent):
    """
    Finds races using a 3-tier fallback chain:
      Official upcoming → Parkrun → Year-round historical.

    Parameters
    ----------
    client:
        A configured ``google.genai.Client`` instance.
    enable_search_grounding:
        Passed through to all tools (default True).
    """

    prompt_file = ""  # Orchestrator — no direct LLM prompt

    def __init__(
        self,
        client: genai.Client,
        enable_search_grounding: bool = True,
    ) -> None:
        super().__init__()
        self._race_tool = RaceSearchTool(
            client=client,
            enable_search_grounding=enable_search_grounding,
        )
        self._parkrun_tool = ParkrunTool(
            client=client,
            enable_search_grounding=enable_search_grounding,
        )
        self._yearround_tool = YearRoundFallbackTool(
            client=client,
            enable_search_grounding=enable_search_grounding,
        )

    def run(
        self,
        profile: RunnerProfile,
        distances: list[str],
        months: list[str],
    ) -> tuple[RaceSearchResult, bool, list[Race], str, str]:
        """
        Search for races using a 3-tier fallback chain.

        Parameters
        ----------
        profile:
            The validated runner profile.
        distances:
            Distances to search (from CoachDecision).
        months:
            Months to search (from CoachDecision).

        Returns
        -------
        (result, used_parkrun, historical_races, historical_insight, travel_tip)
            result            – best RaceSearchResult (official / parkrun)
            used_parkrun      – True if parkrun fallback was triggered
            historical_races  – races from year-round search (empty if not needed)
            historical_insight – insight text from year-round search
            travel_tip        – concrete travel planning advice (empty if not needed)
        """
        # 1. Search for official upcoming races
        official_result = self._race_tool.search(
            profile=profile,
            distances=distances,
            months=months,
        )

        if official_result.found:
            return official_result, False, [], "", ""

        # 2. No official races — try local Parkrun
        parkrun_result = self._parkrun_tool.search(profile=profile)
        if parkrun_result.found:
            return parkrun_result, True, [], "", ""

        # 3. Still nothing — search year-round historical races
        print("  🌍 No upcoming races found — searching for historically held events…")
        hist_result, hist_insight, travel_tip = self._yearround_tool.search(
            location=profile.location,
            distances=distances,
        )
        return parkrun_result, True, hist_result.races, hist_insight, travel_tip

    # Keep BaseAgent.run() interface compatible:
    def __call__(self, *args: object, **kwargs: object) -> object:  # type: ignore[override]
        return self.run(*args, **kwargs)  # type: ignore[arg-type]
