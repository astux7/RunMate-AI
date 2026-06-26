"""
RaceSearchTool — finds official running races using Gemini with Google Search grounding.

The tool sends a structured prompt to the LLM asking it to search for real
races and return them as JSON.  It never scrapes websites directly.
"""

import json
import os
from pathlib import Path

from google import genai
from google.genai import types

from models.runner import RunnerProfile
from models.race import Race, RaceSearchResult
from tools.base_tool import BaseTool


_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "race_search_agent.txt"


class RaceSearchTool(BaseTool):
    """
    Searches for official running races via Gemini + Google Search grounding.

    Parameters
    ----------
    client:
        A configured ``google.genai.Client`` instance.
    model:
        Gemini model name (default: from MODEL_NAME env var or gemini-2.0-flash).
    enable_search_grounding:
        When True (default), enables Google Search grounding so the LLM can
        look up real, current race events.
    """

    def __init__(
        self,
        client: genai.Client,
        model: str | None = None,
        enable_search_grounding: bool = True,
    ) -> None:
        self._client = client
        self._model = model or os.getenv("MODEL_NAME", "gemini-2.0-flash")
        self._enable_search = enable_search_grounding
        self._system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")

    def search(
        self,
        profile: RunnerProfile,
        distances: list[str] | None = None,
        months: list[str] | None = None,
        **kwargs: object,
    ) -> RaceSearchResult:
        """
        Search for official races matching the runner's profile.

        Parameters
        ----------
        profile:
            The validated runner profile.
        distances:
            List of distances to search (e.g. ["5K", "10K"]).
        months:
            List of month names to search (e.g. ["July", "August"]).
        """
        distances = distances or ["5K"]
        months = months or []

        user_message = (
            f"Runner profile:\n"
            f"- Location: {profile.location}\n"
            f"- Distances to search: {', '.join(distances)}\n"
            f"- Months to search: {', '.join(months) if months else 'next 3 months'}\n\n"
            f"Please search for real, official running races matching these criteria "
            f"and return the results as JSON."
        )

        tools = []
        if self._enable_search:
            tools.append(types.Tool(google_search=types.GoogleSearch()))

        config = types.GenerateContentConfig(
            system_instruction=self._system_prompt,
            tools=tools if tools else None,
            temperature=0.2,
        )

        try:
            response = self._call_with_retry(
                lambda: self._client.models.generate_content(
                    model=self._model,
                    contents=user_message,
                    config=config,
                )
            )
            raw = response.text.strip()
            # Strip accidental markdown fences
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            data = json.loads(raw)
            races = [Race(**r) for r in data.get("races", [])]
            return RaceSearchResult(
                races=races,
                source=data.get("source", "official"),
                query_summary=data.get("query_summary", ""),
            )
        except Exception as exc:  # noqa: BLE001
            return RaceSearchResult(
                races=[],
                source="official",
                query_summary=f"Search failed: {exc}",
            )
