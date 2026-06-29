"""
ParkrunLocalListTool — fetches all parkrun events in a given city.

Uses Gemini with Google Search grounding to return a complete list of
parkrun locations in the runner's city, each with a direct link to
their parkrun.org.uk homepage.

This is triggered whenever parkrun is mentioned in the output — both
when the parkrun fallback is used AND when a STARTER runner might
benefit from knowing their local options.
"""

import json
import os

from google import genai
from google.genai import types

from models.race import ParkrunLocation
from utils.retry import call_with_retry


_SYSTEM_PROMPT = """\
You are a parkrun expert. When given a city or location, return a JSON list of
ALL parkrun events held in or very close to that city.

Each parkrun has a homepage on parkrun.org.uk in the format:
  https://www.parkrun.org.uk/<event-slug>/

Rules:
- Only include real, active parkrun events — do NOT invent events.
- Use Google Search to find the most up-to-date list.
- The start_time for UK parkruns is almost always "Saturday 9:00am".
- Return ONLY valid JSON — no prose, no markdown fences.

Output format:
{
  "city": "<city name>",
  "parkruns": [
    {
      "name": "Roundhay parkrun",
      "url": "https://www.parkrun.org.uk/roundhay/",
      "start_time": "Saturday 9:00am"
    }
  ]
}
"""


class ParkrunLocalListTool:
    """
    Fetches all parkrun events in a given city using Gemini + Search.

    Parameters
    ----------
    client:
        A configured ``google.genai.Client`` instance.
    enable_search_grounding:
        When True (default), enables Google Search grounding for accuracy.
    """

    def __init__(
        self,
        client: genai.Client,
        enable_search_grounding: bool = True,
    ) -> None:
        self._client = client
        self._model = os.getenv("MODEL_NAME", "gemini-2.5-flash")
        self._enable_search = enable_search_grounding

    def fetch(self, location: str) -> list[ParkrunLocation]:
        """
        Return all parkrun events in the given location.

        Parameters
        ----------
        location:
            City or region string, e.g. "Leeds, United Kingdom".

        Returns
        -------
        list[ParkrunLocation]
            Empty list if none found or on error.
        """
        # Extract the city name for a cleaner query
        city = location.split(",")[0].strip()

        user_message = (
            f"List ALL parkrun events in {city}, UK. "
            f"Return their names and their parkrun.org.uk homepage URLs as JSON."
        )

        tools = []
        if self._enable_search:
            tools.append(types.Tool(google_search=types.GoogleSearch()))

        config = types.GenerateContentConfig(
            system_instruction=_SYSTEM_PROMPT,
            tools=tools if tools else None,
            temperature=0.1,
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
            # Strip any accidental markdown fences
            if raw.startswith("```"):
                parts = raw.split("```")
                raw = parts[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            data = json.loads(raw)
            return [
                ParkrunLocation(
                    name=item["name"],
                    url=item["url"],
                    start_time=item.get("start_time", "Saturday 9:00am"),
                )
                for item in data.get("parkruns", [])
            ]
        except Exception as exc:  # noqa: BLE001
            from utils.retry import is_credits_depleted
            if is_credits_depleted(str(exc)):
                raise  # Let billing errors surface to the top-level handler
            return []
