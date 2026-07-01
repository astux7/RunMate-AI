import os
import sys
import asyncio
import json
from pathlib import Path

# Add app/agent to sys.path so agent imports work
agent_dir = Path(__file__).parent.parent / "agent"
if str(agent_dir) not in sys.path:
    sys.path.insert(0, str(agent_dir))

from google import genai
from models.runner import RunnerProfile, RunnerLevel
from tools.parkrun_local_list_tool import ParkrunLocalListTool
from models.race import RunmateReport, RaceSearchResult, Race, Recommendation
from utils.retry import is_credits_depleted

# ADK runner and session imports
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from agent import root_agent

# Import for test patching compatibility
from agents.coach_agent import CoachAgent
from agents.race_search_agent import RaceSearchAgent
from agents.recommendation_agent import RecommendationAgent

async def run_pipeline(profile_data: dict, enable_search: bool = True):
    """
    Asynchronous generator running the RunMate agent pipeline step-by-step
    using the Google Agent Development Kit (ADK) Runner.
    Yields status messages during execution and the final result upon completion.
    """
    try:
        yield {"type": "status", "message": "Analyzing profile & resolving parameters..."}
        # Run validation
        profile = RunnerProfile(**profile_data)
        
        # Setup ADK session and runner
        session_service = InMemorySessionService()
        session_id = "runmate_session"
        user_id = "user_runner"
        app_name = "app"
        
        session = await session_service.create_session(
            app_name=app_name, 
            user_id=user_id, 
            session_id=session_id,
            state={
                "level": profile.level.value,
                "location": profile.location,
                "distance": profile_data.get("distance", ""),
                "month": profile_data.get("month", "")
            }
        )
        
        runner = Runner(agent=root_agent, app_name=app_name, session_service=session_service)
        
        # Run ADK pipeline (Coach → ParallelSearch → Merger → Recommender)
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=types.Content(role="user", parts=[types.Part.from_text(text="run")])
        ):
            if event.author == "coach_agent":
                yield {"type": "status", "message": "Running Coach Agent (interpreting constraints)..."}
            elif event.author in ("official_search_agent", "parkrun_search_agent", "historical_search_agent"):
                yield {"type": "status", "message": f"Searching for races in {profile.location} (parallel)..."}
            elif event.author == "search_merger_agent":
                yield {"type": "status", "message": "Selecting best race results..."}
            elif event.author == "recommendation_agent":
                yield {"type": "status", "message": "Generating personalized recommendations..."}

        # Retrieve the session to fetch the completed state
        final_session = await session_service.get_session(
            app_name=app_name, 
            user_id=user_id, 
            session_id=session_id
        )
        state = final_session.state
        
        # Reconstruct CoachDecision from state
        from models.runner import CoachDecision
        coach_decision = CoachDecision(
            distances=state.get("coach_distances", []),
            months_to_search=state.get("coach_months", []),
            beginner_guidance=state.get("coach_guidance") or None,
            reasoning=state.get("coach_reasoning", "")
        )
        
        # Reconstruct RaceSearchResult
        races_list_raw = state.get("races_found", "[]")
        races_data = json.loads(races_list_raw)
        races = [Race(**r) for r in races_data]
        search_result = RaceSearchResult(
            found=len(races) > 0,
            races=races,
            source=state.get("search_source", "upcoming"),
            query_summary=state.get("search_summary", "")
        )
        
        used_parkrun = state.get("used_parkrun", False)
        
        # Reconstruct fallback properties
        hist_list_raw = state.get("historical_races", "[]")
        hist_data = json.loads(hist_list_raw)
        historical_races = [Race(**r) for r in hist_data]
        historical_insight = state.get("historical_insight", "")
        travel_tip = state.get("travel_tip", "")
        
        # Reconstruct recommendations
        recommendations = []
        has_historical = len(historical_races) > 0
        if not has_historical:
            rec_result = state.get("recommendation_result")
            if rec_result:
                if isinstance(rec_result, str):
                    rec_result = json.loads(rec_result)
                elif hasattr(rec_result, "model_dump"):
                    rec_result = rec_result.model_dump()
                elif hasattr(rec_result, "dict"):
                    rec_result = rec_result.dict()
                
                for item in rec_result.get("recommendations", []):
                    race = Race(**item["race"])
                    recommendations.append(
                        Recommendation(
                            race=race,
                            rank=item["rank"],
                            explanation=item["explanation"]
                        )
                    )
        
        # 4. Fetch local parkrun events (outside pipeline runner)
        parkrun_local_events = []
        show_parkrun_list = (
            (profile.level == RunnerLevel.STARTER or used_parkrun)
            and not has_historical
        )
        if show_parkrun_list:
            yield {"type": "status", "message": f"Fetching local parkrun events near {profile.location}..."}
            api_key = os.getenv("GOOGLE_API_KEY", "").strip()
            client = genai.Client(api_key=api_key)
            lister = ParkrunLocalListTool(client=client, enable_search_grounding=enable_search)
            parkrun_local_events = await asyncio.to_thread(lister.fetch, profile.location)
            
        # 5. Build report
        yield {"type": "status", "message": "Finalizing report..."}
        report = RunmateReport(
            profile=profile,
            coach_decision=coach_decision,
            recommendations=recommendations,
            search_summary=search_result.query_summary,
            used_parkrun_fallback=used_parkrun,
            parkrun_local_events=parkrun_local_events,
            historical_races=historical_races,
            historical_insight=historical_insight,
            travel_tip=travel_tip,
        )
        
        # Yield the final report payload
        dump_fn = report.model_dump if hasattr(report, "model_dump") else report.dict
        yield {"type": "result", "report": dump_fn()}
        
    except Exception as exc:
        import traceback
        print(f"[PipelineService] Pipeline error: {exc}", flush=True)
        traceback.print_exc()
        if is_credits_depleted(str(exc)):
            yield {
                "type": "error",
                "error_type": "billing",
                "message": "Your Gemini API prepay credits are depleted. Please top up at Google AI Studio."
            }
        else:
            yield {
                "type": "error",
                "error_type": "general",
                "message": str(exc)
            }
