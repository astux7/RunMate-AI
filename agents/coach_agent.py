"""
CoachAgent — interprets the runner profile and decides what to search for.

Responsibilities:
  - Resolve race distances to search (based on level + supplied distance)
  - Resolve months to search (next 3 months if not supplied)
  - Generate beginner guidance text for STARTER runners
  - Return a CoachDecision

This agent uses the LLM for the beginner guidance text and month resolution.
The distance logic is enforced locally before the LLM call so it is always
deterministic and independently testable.
"""

import json

from google import genai
from google.genai import types

from agents.base_agent import BaseAgent
from models.runner import RunnerLevel, RunnerProfile, CoachDecision


class CoachAgent(BaseAgent):
    """
    Resolves search parameters and generates beginner guidance.

    Parameters
    ----------
    client:
        A configured ``google.genai.Client`` instance.
    """

    prompt_file = "coach_agent.txt"

    _COMMON_DISTANCES = ["5K", "10K", "Half Marathon", "Marathon"]
    _STARTER_DEFAULT = ["5K"]

    def __init__(self, client: genai.Client) -> None:
        super().__init__()
        self._client = client

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
        """
        distances = self._resolve_distances(profile)
        user_message = self._build_message(profile, distances)

        config = types.GenerateContentConfig(
            system_instruction=self._system_prompt,
            temperature=0.3,
        )

        response = self._client.models.generate_content(
            model=self._get_model(),
            contents=user_message,
            config=config,
        )

        raw = self._strip_fences(response.text)
        data = json.loads(raw)

        return CoachDecision(
            distances=distances,  # always use our locally resolved distances
            months_to_search=data.get("months_to_search", []),
            beginner_guidance=data.get("beginner_guidance"),
            reasoning=data.get("reasoning", ""),
        )

    # ------------------------------------------------------------------
    # Internal helpers
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

    def _build_message(self, profile: RunnerProfile, distances: list[str]) -> str:
        return (
            f"Runner profile:\n"
            f"- Level: {profile.level.value}\n"
            f"- Location: {profile.location}\n"
            f"- Distance preference: {profile.distance or 'not specified'}\n"
            f"- Month preference: {profile.month or 'not specified'}\n"
            f"- Resolved distances to search: {', '.join(distances)}\n\n"
            f"Please resolve the months to search and, if this is a STARTER runner, "
            f"write the beginner guidance text. Return valid JSON only."
        )
