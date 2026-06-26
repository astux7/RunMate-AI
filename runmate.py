"""
RunMate AI — CLI entry point.

Usage:
    python runmate.py --level STARTER --location "Leeds, United Kingdom"
    python runmate.py --level RUNNER --location "London" --distance "Half Marathon" --month "October"
    python runmate.py --level RUNNER --location "Berlin" --distance "Marathon" --save
"""

import os
import sys
from typing import Optional

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel

from models.runner import RunnerProfile, RunnerLevel
from models.race import RunmateReport
from agents.coach_agent import CoachAgent
from agents.race_search_agent import RaceSearchAgent
from agents.recommendation_agent import RecommendationAgent
from agents.output_agent import OutputAgent

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
        help='Your location, e.g. "Leeds, United Kingdom".',
        metavar="LOCATION",
    ),
    distance: Optional[str] = typer.Option(
        None,
        "--distance",
        "-d",
        help="Preferred race distance, e.g. 5K, 10K, Half Marathon, Marathon.",
        metavar="DISTANCE",
    ),
    month: Optional[str] = typer.Option(
        None,
        "--month",
        "-m",
        help="Target month, e.g. October. Defaults to next 3 months.",
        metavar="MONTH",
    ),
    save: bool = typer.Option(
        False,
        "--save",
        "-s",
        help="Save the report to the output/ directory.",
    ),
) -> None:
    """Find running races suited to your experience level and location."""

    # ── 1. Validate inputs ──────────────────────────────────────────────
    try:
        profile = RunnerProfile(
            level=level,
            location=location,
            distance=distance,
            month=month,
        )
    except ValueError as exc:
        console.print(f"[red]Input error:[/red] {exc}")
        raise typer.Exit(code=1) from exc

    # ── 2. Initialise Gemini client ──────────────────────────────────────
    api_key = _get_api_key()
    enable_search = os.getenv("ENABLE_SEARCH_GROUNDING", "true").lower() == "true"

    try:
        from google import genai

        client = genai.Client(api_key=api_key)
    except Exception as exc:  # noqa: BLE001
        console.print(f"[red]Failed to initialise Gemini client:[/red] {exc}")
        raise typer.Exit(code=1) from exc

    # ── 3. Run the agent pipeline ────────────────────────────────────────
    try:
        with console.status("[bold blue]🤔 Coach Agent is thinking…[/bold blue]"):
            coach = CoachAgent(client=client)
            coach_decision = coach.run(profile)

        with console.status(
            "[bold blue]🔍 Searching for races…[/bold blue]"
        ):
            searcher = RaceSearchAgent(
                client=client, enable_search_grounding=enable_search
            )
            search_result, used_parkrun = searcher.run(
                profile=profile,
                distances=coach_decision.distances,
                months=coach_decision.months_to_search,
            )

        with console.status("[bold blue]⭐ Generating recommendations…[/bold blue]"):
            recommender = RecommendationAgent(client=client)
            recommendations = recommender.run(
                profile=profile,
                coach_decision=coach_decision,
                search_result=search_result,
                used_parkrun_fallback=used_parkrun,
            )

    except KeyboardInterrupt:
        console.print("\n[yellow]Cancelled.[/yellow]")
        raise typer.Exit(code=0)
    except Exception as exc:  # noqa: BLE001
        console.print(f"\n[red]An error occurred:[/red] {exc}")
        if os.getenv("RUNMATE_DEBUG", "").lower() == "true":
            import traceback
            console.print(traceback.format_exc())
        raise typer.Exit(code=1) from exc

    # ── 4. Build the report and render ──────────────────────────────────
    report = RunmateReport(
        profile=profile,
        coach_decision=coach_decision,
        recommendations=recommendations,
        search_summary=search_result.query_summary,
        used_parkrun_fallback=used_parkrun,
    )

    output = OutputAgent(console=console)
    output.run(report=report, save=save)


if __name__ == "__main__":
    app()
