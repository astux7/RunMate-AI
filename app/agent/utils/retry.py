"""
Shared retry utility for Gemini API calls.

Both BaseAgent and BaseTool use this so that all LLM calls —
whether made from an agent or a tool — get consistent retry behaviour
on 429 RESOURCE_EXHAUSTED responses.

Two kinds of 429:
  - Temporary rate limit  -> retry with exponential backoff (recoverable)
  - Credits depleted      -> raise immediately, retrying won't help
"""

import os
import re
import time
from typing import Callable, TypeVar

T = TypeVar("T")

_MAX_RETRIES = int(os.getenv("RUNMATE_MAX_RETRIES", "3"))
_RETRY_BASE_DELAY = float(os.getenv("RUNMATE_RETRY_BASE_DELAY", "10"))  # seconds

# Phrases that indicate the 429 is a permanent billing block, not a temp limit.
_BILLING_PHRASES = (
    "prepayment credits are depleted",
    "billing",
    "credits are depleted",
    "manage your project and billing",
)


def is_credits_depleted(msg: str) -> bool:
    """Return True if the error is a permanent billing/credits failure."""
    lower = msg.lower()
    return any(phrase in lower for phrase in _BILLING_PHRASES)


def call_with_retry(fn: Callable[[], T]) -> T:
    """
    Call ``fn`` and retry on transient 429 RESOURCE_EXHAUSTED errors.

    Permanent billing errors (credits depleted) are re-raised immediately
    without retrying since waiting won't resolve them.

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
        Re-raises immediately for billing errors, or after all retries
        are exhausted for transient rate limits.
    """
    last_exc: Exception | None = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            return fn()
        except Exception as exc:
            msg = str(exc)
            is_transient = (
                "429" in msg or
                "RESOURCE_EXHAUSTED" in msg or
                "503" in msg or
                "UNAVAILABLE" in msg
            )

            if not is_transient:
                raise  # Non-transient error — propagate immediately

            if is_credits_depleted(msg):
                raise  # Billing failure — retrying won't help

            if attempt == _MAX_RETRIES:
                raise

            # Transient rate limit/unavailable — back off and retry
            delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))
            match = re.search(r"retry[^\d]*(\d+(?:\.\d+)?)\s*s", msg, re.IGNORECASE)
            if match:
                delay = float(match.group(1)) + 2

            print(
                f"  ⏳ Transient API error hit (attempt {attempt}/{_MAX_RETRIES}). "
                f"Waiting {delay:.0f}s before retrying…"
            )
            time.sleep(delay)
            last_exc = exc

    raise last_exc  # type: ignore[misc]
