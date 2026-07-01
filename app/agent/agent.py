# RunMate AI Agent Definition using Google Agent Development Kit (ADK)
#
# Pipeline architecture:
#
#   SequentialAgent (runmate_pipeline)
#   ├── CoachAgent            — pure Python, resolves distances/months
#   ├── ParallelAgent         — fires all 3 search tools concurrently
#   │   ├── OfficialSearchAgent   — Gemini grounding: upcoming races
#   │   ├── ParkrunSearchAgent    — Gemini grounding: local parkruns
#   │   └── HistoricalSearchAgent — Gemini grounding: historical races
#   ├── SearchMergerAgent     — picks best result by priority, sorts output
#   └── RecommendationAgent   — LLM ranks & explains top picks
#
import asyncio
import os
import sys
import json
from pathlib import Path
from typing import AsyncGenerator

# Resolve parent directory and insert into python path so local imports work
agent_dir = Path(__file__).parent
if str(agent_dir) not in sys.path:
    sys.path.insert(0, str(agent_dir))

from google.adk.agents import BaseAgent, ParallelAgent, SequentialAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google import genai

from models.runner import RunnerProfile
from models.race import Race, RaceSearchResult, Recommendation
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Helper — build a genai client from env
# ---------------------------------------------------------------------------
def _make_client() -> genai.Client:
    return genai.Client(api_key=os.getenv("GOOGLE_API_KEY", "").strip())


def _search_enabled() -> bool:
    return os.getenv("ENABLE_SEARCH_GROUNDING", "true").lower() == "true"


def _profile_from_state(state: dict) -> RunnerProfile:
    return RunnerProfile(
        level=state.get("level"),
        location=state.get("location"),
        distance=state.get("distance"),
        month=state.get("month"),
    )


# ---------------------------------------------------------------------------
# 1. CoachAgent — pure Python, determines search scope
# ---------------------------------------------------------------------------
class CoachAgent(BaseAgent):
    """Interprets the runner profile and resolves search scope deterministically."""

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        # Parse user message into state if state is empty (ADK web / eval mode)
        if not ctx.session.state.get("location"):
            try:
                user_msg = ""
                for ev in reversed(ctx.session.events):
                    if ev.author == "user" and ev.content and ev.content.parts:
                        user_msg = ev.content.parts[0].text
                        break
                if user_msg:
                    data = json.loads(user_msg)
                    ctx.session.state["level"] = data.get("level")
                    ctx.session.state["location"] = data.get("location")
                    ctx.session.state["distance"] = data.get("distance", "")
                    ctx.session.state["month"] = data.get("month", "")
            except Exception:
                ctx.session.state["level"] = "STARTER"
                ctx.session.state["location"] = "Leeds, UK"
                ctx.session.state["distance"] = "5K"
                ctx.session.state["month"] = ""

        profile = _profile_from_state(ctx.session.state)

        # Dynamic import supports unit-test patching
        if "services.pipeline_service" in sys.modules and hasattr(
            sys.modules["services.pipeline_service"], "CoachAgent"
        ):
            CoachClass = sys.modules["services.pipeline_service"].CoachAgent
        else:
            from agents.coach_agent import CoachAgent as CoachClass

        decision = CoachClass().run(profile)

        yield Event(
            author=self.name,
            message="Coach Agent interpretation complete.",
            state={
                "coach_distances": decision.distances,
                "coach_months": decision.months_to_search,
                "coach_guidance": decision.beginner_guidance or "",
                "coach_reasoning": decision.reasoning,
            },
        )


# ---------------------------------------------------------------------------
# 2a. OfficialSearchAgent — searches for upcoming official races
# ---------------------------------------------------------------------------
class OfficialSearchAgent(BaseAgent):
    """Searches for official upcoming races via Gemini grounding."""

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        profile = _profile_from_state(ctx.session.state)
        coach_distances = ctx.session.state.get("coach_distances", [])
        coach_months = ctx.session.state.get("coach_months", [])

        from tools.race_search_tool import RaceSearchTool

        tool = RaceSearchTool(client=_make_client(), enable_search_grounding=_search_enabled())
        result = await asyncio.to_thread(
            tool.search,
            profile=profile,
            distances=coach_distances,
            months=coach_months,
        )

        yield Event(
            author=self.name,
            message="Official search complete.",
            state={
                "official_races_raw": json.dumps(
                    [r.model_dump() for r in result.races], indent=2
                ),
                "official_source": result.source,
                "official_summary": result.query_summary,
            },
        )


# ---------------------------------------------------------------------------
# 2b. ParkrunSearchAgent — finds local parkrun events
# ---------------------------------------------------------------------------
class ParkrunSearchAgent(BaseAgent):
    """Searches for nearby parkrun events via Gemini grounding."""

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        profile = _profile_from_state(ctx.session.state)

        from tools.parkrun_tool import ParkrunTool

        tool = ParkrunTool(client=_make_client(), enable_search_grounding=_search_enabled())
        result = await asyncio.to_thread(tool.search, profile=profile)

        yield Event(
            author=self.name,
            message="Parkrun search complete.",
            state={
                "parkrun_races_raw": json.dumps(
                    [r.model_dump() for r in result.races], indent=2
                ),
                "parkrun_summary": result.query_summary,
            },
        )


# ---------------------------------------------------------------------------
# 2c. HistoricalSearchAgent — finds historically held races
# ---------------------------------------------------------------------------
class HistoricalSearchAgent(BaseAgent):
    """Searches for historically held races as a last-resort fallback."""

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        profile = _profile_from_state(ctx.session.state)
        coach_distances = ctx.session.state.get("coach_distances", [])

        from tools.year_round_fallback_tool import YearRoundFallbackTool

        tool = YearRoundFallbackTool(client=_make_client(), enable_search_grounding=_search_enabled())
        hist_result, insight, travel_tip = await asyncio.to_thread(
            tool.search,
            location=profile.location,
            distances=coach_distances,
        )

        yield Event(
            author=self.name,
            message="Historical search complete.",
            state={
                "historical_races_raw": json.dumps(
                    [r.model_dump() for r in hist_result.races], indent=2
                ),
                "historical_insight": insight,
                "travel_tip": travel_tip,
                "historical_summary": hist_result.query_summary,
            },
        )


# ---------------------------------------------------------------------------
# 3. SearchMergerAgent — picks best result in priority order after parallel run
#    Priority: official > parkrun > historical
# ---------------------------------------------------------------------------
class SearchMergerAgent(BaseAgent):
    """
    Merges parallel search results.

    Picks the highest-priority non-empty result:
      1. Official upcoming races
      2. Parkrun events
      3. Historical / year-round races
    """

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        state = ctx.session.state

        # Parse all three result sets
        official_races = json.loads(state.get("official_races_raw", "[]"))
        parkrun_races = json.loads(state.get("parkrun_races_raw", "[]"))
        historical_races = json.loads(state.get("historical_races_raw", "[]"))

        # Sort by priority
        if official_races:
            races_found = official_races
            used_parkrun = False
            historical_output = []
            source = state.get("official_source", "official")
            summary = state.get("official_summary", "")
            historical_insight = ""
            travel_tip = ""
        elif parkrun_races:
            races_found = parkrun_races
            used_parkrun = True
            historical_output = []
            source = "parkrun"
            summary = state.get("parkrun_summary", "")
            historical_insight = ""
            travel_tip = ""
        else:
            # Fall back to historical
            races_found = []
            used_parkrun = False
            historical_output = historical_races
            source = "historical"
            summary = state.get("historical_summary", "")
            historical_insight = state.get("historical_insight", "")
            travel_tip = state.get("travel_tip", "")

        yield Event(
            author=self.name,
            message=f"Search merged — source={source}, "
                    f"races={len(races_found)}, historical={len(historical_output)}.",
            state={
                "races_found": json.dumps(races_found, indent=2),
                "used_parkrun": used_parkrun,
                "historical_races": json.dumps(historical_output, indent=2),
                "historical_insight": historical_insight,
                "travel_tip": travel_tip,
                "search_summary": summary,
                "search_source": source,
            },
        )


# ---------------------------------------------------------------------------
# 4. RecommendationAgent — ranks and explains the top picks
# ---------------------------------------------------------------------------
class RecommendationAgent(BaseAgent):
    """LLM-powered agent that ranks and explains race recommendations."""

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        state = ctx.session.state

        # Bypass ranking when historical races were selected — they are pre-sorted
        historical_races_raw = state.get("historical_races", "[]")
        try:
            historical_races_data = json.loads(historical_races_raw)
        except Exception:
            historical_races_data = []

        if historical_races_data:
            yield Event(
                author=self.name,
                message="Recommendation Agent bypassed (historical races found).",
                state={"recommendation_result": {"recommendations": []}},
            )
            return

        profile = _profile_from_state(state)
        coach_distances = state.get("coach_distances", [])
        coach_months = state.get("coach_months", [])
        used_parkrun = state.get("used_parkrun", False)

        races_data = json.loads(state.get("races_found", "[]"))
        races = [Race(**r) for r in races_data]
        search_result = RaceSearchResult(
            found=len(races) > 0,
            races=races,
            source=state.get("search_source", "upcoming"),
            query_summary=state.get("search_summary", ""),
        )

        if "services.pipeline_service" in sys.modules and hasattr(
            sys.modules["services.pipeline_service"], "RecommendationAgent"
        ):
            RecommenderClass = sys.modules["services.pipeline_service"].RecommendationAgent
        else:
            from agents.recommendation_agent import RecommendationAgent as RecommenderClass

        from models.runner import CoachDecision

        coach_decision = CoachDecision(
            distances=coach_distances,
            months_to_search=coach_months,
            beginner_guidance=state.get("coach_guidance") or None,
            reasoning=state.get("coach_reasoning", ""),
        )

        recommender = RecommenderClass(client=_make_client())
        recommendations = await asyncio.to_thread(
            recommender.run,
            profile=profile,
            coach_decision=coach_decision,
            search_result=search_result,
            used_parkrun_fallback=used_parkrun,
        )

        recs_data = []
        for r in recommendations:
            if hasattr(r, "model_dump"):
                recs_data.append(r.model_dump())
            elif hasattr(r, "dict"):
                recs_data.append(r.dict())
            else:
                recs_data.append(r)

        yield Event(
            author=self.name,
            message="Recommendation Agent ranking complete.",
            state={"recommendation_result": {"recommendations": recs_data}},
        )


# ---------------------------------------------------------------------------
# Pipeline assembly
#
#   SequentialAgent
#   ├── CoachAgent
#   ├── ParallelAgent  ← fires all 3 search tools concurrently
#   │   ├── OfficialSearchAgent
#   │   ├── ParkrunSearchAgent
#   │   └── HistoricalSearchAgent
#   ├── SearchMergerAgent
#   └── RecommendationAgent
# ---------------------------------------------------------------------------
_search_orchestrator = ParallelAgent(
    name="search_orchestrator",
    sub_agents=[
        OfficialSearchAgent(name="official_search_agent"),
        ParkrunSearchAgent(name="parkrun_search_agent"),
        HistoricalSearchAgent(name="historical_search_agent"),
    ],
)

root_agent = SequentialAgent(
    name="runmate_pipeline",
    sub_agents=[
        CoachAgent(name="coach_agent"),
        _search_orchestrator,
        SearchMergerAgent(name="search_merger_agent"),
        RecommendationAgent(name="recommendation_agent"),
    ],
)
