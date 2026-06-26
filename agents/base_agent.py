"""
Abstract base class for all RunMate agents.

All agents share a common interface:
  - They receive structured Pydantic models as input.
  - They return structured Pydantic models as output.
  - They load their system prompt from the prompts/ directory.
  - They do NOT interact with the terminal (that is OutputAgent's job).
"""

import os
import re
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Callable, TypeVar

T = TypeVar("T")

_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

# Retry settings — override via env vars if needed
_MAX_RETRIES = int(os.getenv("RUNMATE_MAX_RETRIES", "3"))
_RETRY_BASE_DELAY = float(os.getenv("RUNMATE_RETRY_BASE_DELAY", "10"))  # seconds


class BaseAgent(ABC):
    """Abstract interface for all RunMate agents."""

    #: Subclasses set this to the filename of their prompt in prompts/
    prompt_file: str = ""

    def __init__(self) -> None:
        if self.prompt_file:
            prompt_path = _PROMPTS_DIR / self.prompt_file
            self._system_prompt = prompt_path.read_text(encoding="utf-8")
        else:
            self._system_prompt = ""

    def _get_model(self) -> str:
        return os.getenv("MODEL_NAME", "gemini-2.0-flash")

    def _strip_fences(self, text: str) -> str:
        """Remove accidental markdown code fences from LLM output."""
        text = text.strip()
        if text.startswith("```"):
            parts = text.split("```")
            # parts[1] contains the content (possibly with a language tag)
            content = parts[1]
            if content.startswith("json"):
                content = content[4:]
            return content.strip()
        return text

    def _call_with_retry(self, fn: Callable[[], T]) -> T:
        """
        Call ``fn`` and retry on 429 RESOURCE_EXHAUSTED with exponential backoff.

        The API response often includes a recommended retry delay in seconds.
        We honour that delay when available, otherwise we use exponential backoff
        starting at ``_RETRY_BASE_DELAY`` seconds.

        Parameters
        ----------
        fn:
            A zero-argument callable that makes a single Gemini API call.

        Returns
        -------
        T
            Whatever ``fn`` returns on success.

        Raises
        ------
        Exception
            Re-raises the last exception after all retries are exhausted.
        """
        last_exc: Exception | None = None
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                return fn()
            except Exception as exc:
                msg = str(exc)
                is_rate_limit = "429" in msg or "RESOURCE_EXHAUSTED" in msg

                if not is_rate_limit or attempt == _MAX_RETRIES:
                    raise

                # Try to extract the suggested retry delay from the error message
                delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))  # exponential default
                match = re.search(r"retry[^\d]*(\d+(?:\.\d+)?)\s*s", msg, re.IGNORECASE)
                if match:
                    delay = float(match.group(1)) + 2  # honour API suggestion + small buffer

                print(
                    f"  ⏳ Rate limit hit (attempt {attempt}/{_MAX_RETRIES}). "
                    f"Waiting {delay:.0f}s before retrying…"
                )
                time.sleep(delay)
                last_exc = exc

        raise last_exc  # type: ignore[misc]

    @abstractmethod
    def run(self, *args: object, **kwargs: object) -> object:
        """Execute the agent's task and return a structured result."""
        ...
