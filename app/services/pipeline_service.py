import os
import sys
import asyncio
from pathlib import Path

# Add app/agent to sys.path so agent imports work
agent_dir = Path(__file__).parent.parent / "agent"
if str(agent_dir) not in sys.path:
    sys.path.insert(0, str(agent_dir))

from google import genai
from models.runner import RunnerProfile
from agents.coach_agent import CoachAgent
from agents.race_search_agent import RaceSearchAgent
from agents.recommendation_agent import RecommendationAgent
from tools.parkrun_local_list_tool import ParkrunLocalListTool
from models.race import RunmateReport
from utils.retry import is_credits_depleted

async def run_pipeline(profile_data: dict, enable_search: bool = True):
    """
    Asynchronous generator running the RunMate agent pipeline step-by-step.
    Yields status messages during execution and the final result upon completion,
    or handles exceptions (e.g. billing depletion).
    """
    try:
        yield {"type": "status", "message": "Analyzing profile & resolving parameters..."}
        # Run validation
        profile = RunnerProfile(**profile_data)
        
        # 1. Coach Agent
        coach = CoachAgent()
        coach_decision = await asyncio.to_thread(coach.run, profile)
        
        # 2. Race Search Agent
        yield {"type": "status", "message": f"Searching for races in {profile.location}..."}
        api_key = os.getenv("GOOGLE_API_KEY", "").strip()
        client = genai.Client(api_key=api_key)
        
        searcher = RaceSearchAgent(client=client, enable_search_grounding=enable_search)
        search_result, used_parkrun, historical_races, historical_insight, travel_tip = await asyncio.to_thread(
            searcher.run,
            profile,
            coach_decision.distances,
            coach_decision.months_to_search
        )
        
        # 3. Recommendation Agent
        recommendations = []
        has_historical = len(historical_races) > 0
        if not has_historical:
            yield {"type": "status", "message": "Generating personalized recommendations..."}
            recommender = RecommendationAgent(client=client)
            recommendations = await asyncio.to_thread(
                recommender.run,
                profile,
                coach_decision,
                search_result,
                used_parkrun
            )
        
        # 4. Local Parkruns (if relevant)
        parkrun_local_events = []
        has_historical = len(historical_races) > 0
        show_parkrun_list = (
            (profile.level.value == "STARTER" or used_parkrun)
            and not has_historical
        )
        if show_parkrun_list:
            yield {"type": "status", "message": f"Fetching local parkrun events near {profile.location}..."}
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
        
        # Output result
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
