"""
RunMate AI — CLI entry point.

Usage examples:

  # Minimum query:
  python runmate.py --level STARTER --location "Leeds, United Kingdom"

  # Maximum query (all options):
  python runmate.py \
    --level RUNNER \
    --location "Berlin, Germany" \
    --distance "5K" \
    --distance "10K" \
    --distance "Half Marathon" \
    --distance "Marathon" \
    --month "October" \
    --month "November" \
    --save

Short flags:
  -l   --level
  -loc --location
  -d   --distance     (repeatable)
  -m   --month        (repeatable)
  -s   --save
"""

import os
import sys
from pathlib import Path
from typing import Optional

# Set up paths so agent components can import correctly from their new home
sys.path.insert(0, str(Path(__file__).parent / "app" / "agent"))

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel

from models.runner import RunnerProfile, RunnerLevel
from models.race import RunmateReport
import asyncio
import json
from agents.output_agent import OutputAgent
from tools.parkrun_local_list_tool import ParkrunLocalListTool
from utils.retry import is_credits_depleted

# Load .env before anything else
load_dotenv()

app = typer.Typer(
    name="runmate",
    help="🏃 RunMate AI — your AI-powered running race companion.",
    add_completion=False,
)
console = Console()


def _get_api_key() -> str:
    """Retrieve and validate the Google API key from the environment."""
    key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not key:
        console.print(
            Panel(
                "[bold red]GOOGLE_API_KEY is not set.[/bold red]\n\n"
                "Copy [bold].env.example[/bold] to [bold].env[/bold] and add your key.\n"
                "Get a free key at: [link]https://aistudio.google.com[/link]",
                title="[red]Configuration Error[/red]",
                border_style="red",
            )
        )
        raise typer.Exit(code=1)
    return key


@app.command()
def run(
    level: str = typer.Option(
        ...,
        "--level",
        "-l",
        help="Your running experience level: STARTER or RUNNER.",
        metavar="LEVEL",
    ),
    location: str = typer.Option(
        ...,
        "--location",
        "-loc",
        help='Your location, e.g. "Leeds, United Kingdom" or "Berlin, Germany".',
        metavar="LOCATION",
    ),
    distance: Optional[list[str]] = typer.Option(
        None,
        "--distance",
        "-d",
        help=(
            "Preferred race distance(s). Repeat to add more. "
            "e.g. -d 5K -d 10K -d \"Half Marathon\" -d Marathon. "
            "Defaults to level-appropriate distance if not set."
        ),
        metavar="DISTANCE",
    ),
    month: Optional[list[str]] = typer.Option(
        None,
        "--month",
        "-m",
        help=(
            "Target month(s) to search. Repeat to add more. "
            "e.g. -m October -m November. "
            "Defaults to the next 3 upcoming months if not set."
        ),
        metavar="MONTH",
    ),
    save: bool = typer.Option(
        False,
        "--save",
        "-s",
        help="Save the full report to the output/ directory as a text file.",
    ),
    no_grounding: bool = typer.Option(
        False,
        "--no-grounding",
        help="Disable Google Search grounding (useful for offline testing).",
        is_flag=True,
    ),
) -> None:
    """Find running races suited to your experience level and location.

    \b
    Examples:
      # Beginner in Leeds looking for any upcoming 5K:
      python runmate.py -l STARTER -loc \"Leeds, United Kingdom\"

      # Maximum query — all options specified:
      python runmate.py \\
        --level RUNNER \\
        --location \"Berlin, Germany\" \\
        --distance 5K \\
        --distance 10K \\
        --distance \"Half Marathon\" \\
        --distance Marathon \\
        --month October \\
        --month November \\
        --save
    """

    # ── 1. Validate inputs ──────────────────────────────────────────────
    # Normalise distance/month: flatten optional lists, deduplicate, title-case months
    distances_input: Optional[str] = ", ".join(distance) if distance else None
    months_input: Optional[str] = ", ".join(month) if month else None

    try:
        profile = RunnerProfile(
            level=level,
            location=location,
            distance=distances_input,
            month=months_input,
        )
    except ValueError as exc:
        console.print(f"[red]Input error:[/red] {exc}")
        raise typer.Exit(code=1) from exc

    # ── 2. Initialise Gemini client ──────────────────────────────────────
    api_key = _get_api_key()
    enable_search = (
        not no_grounding
        and os.getenv("ENABLE_SEARCH_GROUNDING", "true").lower() == "true"
    )

    try:
        from google import genai

        client = genai.Client(api_key=api_key)
    except Exception as exc:  # noqa: BLE001
        console.print(f"[red]Failed to initialise Gemini client:[/red] {exc}")
        raise typer.Exit(code=1) from exc

    # Helper function to run the ADK sequential runner
    async def run_adk_pipeline():
        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService
        from google.genai import types
        from agent import root_agent
        
        session_service = InMemorySessionService()
        session_id = "runmate_cli_session"
        user_id = "cli_user"
        app_name = "app"
        
        session = await session_service.create_session(
            app_name=app_name, 
            user_id=user_id, 
            session_id=session_id,
            state={
                "level": profile.level.value,
                "location": profile.location,
                "distance": distances_input or "",
                "month": months_input or ""
            }
        )
        
        runner = Runner(agent=root_agent, app_name=app_name, session_service=session_service)
        
        # Run sequential ADK pipeline
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=types.Content(role="user", parts=[types.Part.from_text(text="run")])
        ):
            pass
            
        final_session = await session_service.get_session(
            app_name=app_name, 
            user_id=user_id, 
            session_id=session_id
        )
        return final_session.state

    # ── 3. Run the ADK agent pipeline ────────────────────────────────────
    try:
        with console.status("[bold blue]🏃 RunMate AI agent pipeline is running…[/bold blue]"):
            state = asyncio.run(run_adk_pipeline())
            
        # Reconstruct models from session state
        from models.runner import CoachDecision
        coach_decision = CoachDecision(
            distances=state.get("coach_distances", []),
            months_to_search=state.get("coach_months", []),
            beginner_guidance=state.get("coach_guidance") or None,
            reasoning=state.get("coach_reasoning", "")
        )
        
        # Reconstruct search results
        races_list_raw = state.get("races_found", "[]")
        races_data = json.loads(races_list_raw)
        from models.race import Race, RaceSearchResult, Recommendation
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

    except KeyboardInterrupt:
        console.print("\n[yellow]Cancelled.[/yellow]")
        raise typer.Exit(code=0)
    except Exception as exc:  # noqa: BLE001
        if is_credits_depleted(str(exc)):
            console.print(
                Panel(
                    "[bold red]Your Gemini API prepay credits are depleted.[/bold red]\n\n"
                    "Top up your balance at:\n"
                    "[bold cyan][link=https://aistudio.google.com/projects]"
                    "https://aistudio.google.com/projects[/link][/bold cyan]\n\n"
                    "[dim]Once topped up, re-run the same command.[/dim]",
                    title="[red]💳 Billing Error[/red]",
                    border_style="red",
                    padding=(1, 2),
                )
            )
        else:
            console.print(f"\n[red]An error occurred:[/red] {exc}")
            if os.getenv("RUNMATE_DEBUG", "").lower() == "true":
                import traceback
                console.print(traceback.format_exc())
        raise typer.Exit(code=1) from exc

    # ── 4. Fetch local parkrun list when relevant ────────────────────────
    #       Only show for STARTER runners or when parkrun fallback was used.
    #       Skip when year-round historical fallback was triggered (no parkrun
    #       in countries like North Korea).
    parkrun_local_events = []
    has_historical = len(historical_races) > 0
    show_parkrun_list = (
        (profile.level == RunnerLevel.STARTER or used_parkrun)
        and not has_historical
    )
    if show_parkrun_list:
        with console.status(
            "[bold blue]🗺️  Fetching local parkrun events…[/bold blue]"
        ):
            lister = ParkrunLocalListTool(
                client=client,
                enable_search_grounding=enable_search,
            )
            parkrun_local_events = lister.fetch(profile.location)

    # ── 5. Build the report and render ──────────────────────────────────
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

    output = OutputAgent(console=console)
    output.run(report=report, save=save)


if __name__ == "__main__":
    app()
