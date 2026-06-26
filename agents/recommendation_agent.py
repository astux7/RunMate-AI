"""
RecommendationAgent — ranks races and writes personalised explanations.

Takes the full set of found races and the coach decision, uses the LLM to
rank them and produce tailored explanations for the runner, and returns
a list of Recommendation objects.
"""

import json

from google import genai
from google.genai import types

from agents.base_agent import BaseAgent
from models.runner import RunnerProfile
from models.race import Race, RaceSearchResult, Recommendation
from models.runner import CoachDecision


class RecommendationAgent(BaseAgent):
    """
    Ranks races and generates tailored explanations using the LLM.

    Parameters
    ----------
    client:
        A configured ``google.genai.Client`` instance.
    """

    prompt_file = "recommendation_agent.txt"

    def __init__(self, client: genai.Client) -> None:
        super().__init__()
        self._client = client

    def run(
        self,
        profile: RunnerProfile,
        coach_decision: CoachDecision,
        search_result: RaceSearchResult,
        used_parkrun_fallback: bool = False,
    ) -> list[Recommendation]:
        """
        Rank races and return personalised recommendations.

        Parameters
        ----------
        profile:
            The validated runner profile.
        coach_decision:
            The CoachAgent's output (distances, months, guidance).
        search_result:
            The races found by RaceSearchAgent.
        used_parkrun_fallback:
            True if the Parkrun fallback was triggered.

        Returns
        -------
        list[Recommendation]
            Ordered list of recommendations (rank 1 = best choice).
            Returns an empty list if no races were found.
        """
        if not search_result.races:
            return []

        races_json = json.dumps(
            [r.model_dump() for r in search_result.races], indent=2
        )

        user_message = (
            f"Runner profile:\n"
            f"- Level: {profile.level.value}\n"
            f"- Location: {profile.location}\n"
            f"- Distance preference: {profile.distance or 'not specified'}\n"
            f"- Month preference: {profile.month or 'not specified'}\n\n"
            f"Coach decision:\n"
            f"- Distances searched: {', '.join(coach_decision.distances)}\n"
            f"- Months searched: {', '.join(coach_decision.months_to_search)}\n\n"
            f"Used Parkrun fallback: {used_parkrun_fallback}\n\n"
            f"Races found:\n{races_json}\n\n"
            f"Please rank these races and write personalised explanations. "
            f"Return valid JSON only."
        )

        config = types.GenerateContentConfig(
            system_instruction=self._system_prompt,
            temperature=0.5,
        )

        response = self._client.models.generate_content(
            model=self._get_model(),
            contents=user_message,
            config=config,
        )

        raw = self._strip_fences(response.text)
        data = json.loads(raw)

        recommendations = []
        for item in data.get("recommendations", []):
            race = Race(**item["race"])
            recommendations.append(
                Recommendation(
                    race=race,
                    rank=item["rank"],
                    explanation=item["explanation"],
                )
            )

        return sorted(recommendations, key=lambda r: r.rank)
