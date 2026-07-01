"""
ParkrunTool — finds nearby Parkrun events as a fallback when no official races
are available.

Uses Gemini with Google Search grounding to find real Parkrun locations near
the runner's location.
"""

import json
import os
from pathlib import Path

from google import genai
from google.genai import types

from models.runner import RunnerProfile
from models.race import Race, RaceSearchResult
from tools.base_tool import BaseTool
from utils.retry import call_with_retry


_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "parkrun_tool.txt"


class ParkrunTool(BaseTool):
    """
    Finds nearby Parkrun events using Gemini + Google Search grounding.

    Parkrun is a free, weekly 5K timed run held in parks worldwide every
    Saturday morning.  This tool is used as a fallback when no official
    races are found by RaceSearchTool.

    Parameters
    ----------
    client:
        A configured ``google.genai.Client`` instance.
    model:
        Gemini model name (default: from MODEL_NAME env var or gemini-2.5-flash).
    enable_search_grounding:
        When True (default), enables Google Search grounding.
    """

    def __init__(
        self,
        client: genai.Client,
        model: str | None = None,
        enable_search_grounding: bool = True,
    ) -> None:
        self._client = client
        self._model = model or os.getenv("MODEL_NAME", "gemini-2.5-flash")
        self._enable_search = enable_search_grounding
        self._system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")

    def search(
        self,
        profile: RunnerProfile,
        **kwargs: object,
    ) -> RaceSearchResult:
        """
        Find Parkrun events near the runner's location.

        Parameters
        ----------
        profile:
            The validated runner profile (only ``location`` is used).
        """
        user_message = (
            f"Please find Parkrun events near: {profile.location}\n\n"
            f"Return up to 5 real Parkrun locations as JSON."
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
            response = call_with_retry(
                lambda: self._client.models.generate_content(
                    model=self._model,
                    contents=user_message,
                    config=config,
                )
            )
            raw = response.text.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            data = json.loads(raw)
            races = [Race(**r) for r in data.get("races", [])]
            return RaceSearchResult(
                races=races,
                source="parkrun",
                query_summary=data.get("query_summary", ""),
            )
        except Exception as exc:  # noqa: BLE001
            import traceback
            import sys
            from utils.retry import is_credits_depleted
            if is_credits_depleted(str(exc)):
                raise  # Let billing errors surface to the top-level handler
            print(f"[ParkrunTool] search failed: {exc}", file=sys.stderr)
            if os.getenv("RUNMATE_DEBUG", "").lower() == "true":
                traceback.print_exc(file=sys.stderr)
            return RaceSearchResult(
                races=[],
                source="parkrun",
                query_summary=f"Parkrun search failed: {exc}",
            )
