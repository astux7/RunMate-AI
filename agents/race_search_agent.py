"""
RaceSearchAgent — orchestrates search tools to find races.

Workflow:
  1. Call RaceSearchTool for official races.
  2. If no official races are found, call ParkrunTool as a fallback.
  3. Return the combined RaceSearchResult and a flag indicating if the
     Parkrun fallback was used.
"""

from google import genai

from agents.base_agent import BaseAgent
from models.runner import RunnerProfile
from models.race import Race, RaceSearchResult
from tools.race_search_tool import RaceSearchTool
from tools.parkrun_tool import ParkrunTool


class RaceSearchAgent(BaseAgent):
    """
    Finds races using RaceSearchTool and falls back to ParkrunTool.

    Parameters
    ----------
    client:
        A configured ``google.genai.Client`` instance.
    enable_search_grounding:
        Passed through to both tools (default True).
    """

    prompt_file = ""  # This agent orchestrates tools — no direct LLM prompt

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

    def run(
        self,
        profile: RunnerProfile,
        distances: list[str],
        months: list[str],
    ) -> tuple[RaceSearchResult, bool]:
        """
        Search for races and return results.

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
        (RaceSearchResult, used_parkrun_fallback)
            The combined race search result and a boolean indicating whether
            the Parkrun fallback was triggered.
        """
        # 1. Search for official races
        official_result = self._race_tool.search(
            profile=profile,
            distances=distances,
            months=months,
        )

        if official_result.found:
            return official_result, False

        # 2. No official races found — try Parkrun
        parkrun_result = self._parkrun_tool.search(profile=profile)
        return parkrun_result, True

    # No abstract method to fulfil — using typed run() above
    # Keep BaseAgent.run() compatible:
    def __call__(self, *args: object, **kwargs: object) -> object:  # type: ignore[override]
        return self.run(*args, **kwargs)  # type: ignore[arg-type]
