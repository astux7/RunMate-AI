"""
Abstract base class for all RunMate agents.

All agents share a common interface:
  - They receive structured Pydantic models as input.
  - They return structured Pydantic models as output.
  - They load their system prompt from the prompts/ directory.
  - They do NOT interact with the terminal (that is OutputAgent's job).
"""

import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Callable, TypeVar

from utils.retry import call_with_retry

T = TypeVar("T")

_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"



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
        return os.getenv("MODEL_NAME", "gemini-2.5-flash")

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
        """Delegate to the shared retry utility in utils.retry."""
        return call_with_retry(fn)

    @abstractmethod
    def run(self, *args: object, **kwargs: object) -> object:
        """Execute the agent's task and return a structured result."""
        ...
