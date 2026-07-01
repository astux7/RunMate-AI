"""
YearRoundFallbackTool — searches for races historically held in a country/region
across all months of the year, used when no upcoming races are found.

This is the last-resort fallback. It does NOT promise confirmed dates — it
surfaces races that are known to exist in a location so the runner knows what
to watch out for and when to look.
"""

import json
import os

from google import genai
from google.genai import types

from models.race import Race, RaceSearchResult
from utils.retry import call_with_retry


_SYSTEM_PROMPT = """\
You are a global running race expert with knowledge of races in every country.

Your task is to find running races that are HISTORICALLY or TYPICALLY held in a
given location, even if no confirmed upcoming dates are currently listed.

This is used when no upcoming races were found — so the runner can know what
events to watch for and when to plan their trip.

## Guidelines

- Search across ALL months of the year — do not limit to upcoming dates.
- Include well-known annual races even if the current year's edition isn't confirmed yet.
- Include races that have run in recent years (2022–2025) even if 2026 isn't confirmed.
- For restricted countries (e.g. North Korea), include any internationally known races
  and note any access requirements or restrictions in the description.
- Return up to 8 races across all distances (5K, 10K, Half Marathon, Marathon, etc.).
- Mark every race with is_historical: true.

## Output format

Return ONLY a valid JSON object — no markdown fences, no prose:

{
  "races": [
    {
      "name": "Pyongyang Marathon",
      "location": "Pyongyang, North Korea",
      "date": "Typically April (annual)",
      "distance": "Marathon, Half Marathon, 10K, 5K",
      "url": "https://koryogroup.com/travel-blog/the-pyongyang-marathon",
      "is_parkrun": false,
      "is_historical": true,
      "description": "One of the few international races held in North Korea, open to foreign tourists. Run through central Pyongyang. Distances include full marathon, half marathon, 10K and 5K fun run."
    }
  ],
  "source": "historical",
  "query_summary": "Historical races typically held in North Korea.",
  "insight": "North Korea hosts the Pyongyang Marathon annually in April. Foreign participation is possible through authorised tour operators. Check current political and travel conditions before planning.",
  "travel_tip": "Best time to travel for running: April. Book through an authorised tour operator (e.g. Koryo Tours, Young Pioneer Tours) at least 3 months in advance. A tourist visa is required and must be arranged through your tour operator. Note: entry restrictions may apply depending on your nationality and current political conditions."
}

- insight: 2-3 sentences summarising the running landscape — typical seasons, access notes.
- travel_tip: concrete, actionable travel planning advice for a runner. Include:
    * The best month(s) to travel to catch races
    * Any visa / entry requirements specific to runners or tourists
    * How to register or book (tour operators, official websites)
    * Any important warnings (political situation, travel advisories, cost)
  Write this as direct advice to the runner, e.g. "Plan your trip for April..."
- If truly no races exist anywhere near this location, return races: [] and explain in insight.
- Do not include any text outside the JSON object.
"""


class YearRoundFallbackTool:
    """
    Searches for historically/typically held races in a location across all months.

    Used as a final fallback when no upcoming official races or parkrun events
    are found. Results are flagged as is_historical=True.

    Parameters
    ----------
    client:
        A configured ``google.genai.Client`` instance.
    enable_search_grounding:
        When True (default), enables Google Search grounding.
    """

    def __init__(
        self,
        client: genai.Client,
        enable_search_grounding: bool = True,
    ) -> None:
        self._client = client
        self._model = os.getenv("MODEL_NAME", "gemini-2.5-flash")
        self._enable_search = enable_search_grounding

    def search(
        self,
        location: str,
        distances: list[str] | None = None,
    ) -> tuple[RaceSearchResult, str, str]:
        """
        Find races historically held in the given location.

        Parameters
        ----------
        location:
            The runner's location (city, country).
        distances:
            Preferred distances — used as a hint, not a hard filter.

        Returns
        -------
        (RaceSearchResult, insight, travel_tip)
            The historical race results, a plain-text insight paragraph,
            and a concrete travel planning suggestion.
        """
        dist_hint = f" Preferred distances: {', '.join(distances)}." if distances else ""
        user_message = (
            f"Find ALL running races historically or typically held in: {location}.{dist_hint}\n"
            f"Search across every month of the year — I want to know what races exist "
            f"in this location regardless of whether current-year dates are confirmed.\n"
            f"Return results as JSON."
        )

        tools = []
        if self._enable_search:
            tools.append(types.Tool(google_search=types.GoogleSearch()))

        config = types.GenerateContentConfig(
            system_instruction=_SYSTEM_PROMPT,
            tools=tools if tools else None,
            temperature=0.2,
        )

        try:
            response = call_with_retry(
                lambda: self._client.models.generate_content(
                    model=self._model,
                    contents=user_message,
                    config=config,
                )
            )
            raw = response.text.strip()
            if raw.startswith("```"):
                parts = raw.split("```")
                raw = parts[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            data = json.loads(raw)
            races = [Race(**r) for r in data.get("races", [])]
            insight = data.get("insight", "")
            travel_tip = data.get("travel_tip", "")
            result = RaceSearchResult(
                races=races,
                source="historical",
                query_summary=data.get("query_summary", ""),
            )
            return result, insight, travel_tip

        except Exception as exc:  # noqa: BLE001
            from utils.retry import is_credits_depleted
            if is_credits_depleted(str(exc)):
                raise
            import sys
            import traceback
            print(f"[YearRoundFallbackTool] search failed: {exc}", file=sys.stderr)
            if os.getenv("RUNMATE_DEBUG", "").lower() == "true":
                traceback.print_exc(file=sys.stderr)
            return RaceSearchResult(
                races=[],
                source="historical",
                query_summary=f"Historical search failed: {exc}",
            ), "", ""
