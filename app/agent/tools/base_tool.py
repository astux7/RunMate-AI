"""
Abstract base class for all RunMate search tools.

New tools (e.g. a dedicated race-calendar API, OpenStreetMap, weather service)
should inherit from BaseTool and implement the search() method.
"""

from abc import ABC, abstractmethod

from models.runner import RunnerProfile
from models.race import RaceSearchResult


class BaseTool(ABC):
    """Abstract interface for all search tools."""

    @abstractmethod
    def search(self, profile: RunnerProfile, **kwargs: object) -> RaceSearchResult:
        """
        Run a search based on the runner profile.

        Parameters
        ----------
        profile:
            The validated runner profile from the CLI.
        **kwargs:
            Tool-specific parameters (e.g. distances, months).

        Returns
        -------
        RaceSearchResult
            Structured search result. Returns an empty result (found=False) if
            nothing is found — never raises on empty results.
        """
        ...
