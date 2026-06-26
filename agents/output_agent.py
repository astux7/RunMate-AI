"""
OutputAgent — renders a polished Rich terminal report from a RunmateReport.

This is the only agent that interacts with the terminal.  All other agents
work with Pydantic models only, keeping business logic decoupled from display.

Responsibilities:
  - Render the header / runner profile summary
  - Render beginner guidance (STARTER runners)
  - Render each recommendation as a Rich panel
  - Render the Parkrun fallback notice when applicable
  - Render the safety disclaimer
  - Optionally save the report as a plain-text file in output/
"""

import os
from datetime import datetime
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich import box
from rich.rule import Rule
from rich.padding import Padding

from agents.base_agent import BaseAgent
from models.race import RunmateReport


_OUTPUT_DIR = Path(__file__).parent.parent / "output"

_MEDAL_EMOJI = {1: "🥇", 2: "🥈", 3: "🥉"}
_LEVEL_COLOUR = {"STARTER": "green", "RUNNER": "cyan"}


class OutputAgent(BaseAgent):
    """
    Renders the RunmateReport to the terminal using Rich.

    Parameters
    ----------
    console:
        Optional Rich Console to use (creates a default one if not supplied).
    """

    prompt_file = ""  # No LLM calls — pure Rich rendering

    def __init__(self, console: Console | None = None) -> None:
        super().__init__()
        self._console = console or Console()

    def run(self, report: RunmateReport, save: bool = False) -> None:
        """
        Render the report to the terminal and optionally save to file.

        Parameters
        ----------
        report:
            The complete RunmateReport from the pipeline.
        save:
            When True, also save a plain-text report to output/.
        """
        self._render_header(report)
        self._render_profile(report)

        if report.coach_decision.beginner_guidance:
            self._render_beginner_guidance(report.coach_decision.beginner_guidance)

        if report.used_parkrun_fallback:
            self._render_parkrun_notice()

        if report.recommendations:
            self._render_recommendations(report)
        else:
            self._render_no_results(report)

        self._render_disclaimer(report.disclaimer)

        if save or os.getenv("SAVE_REPORTS", "").lower() == "true":
            self._save_report(report)

    # ------------------------------------------------------------------
    # Rendering helpers
    # ------------------------------------------------------------------

    def _render_header(self, report: RunmateReport) -> None:
        self._console.print()
        self._console.print(
            Panel(
                Text("🏃 RunMate AI", justify="center", style="bold white"),
                subtitle="[dim]Your AI-powered running companion[/dim]",
                style="bold blue",
                border_style="blue",
                padding=(1, 4),
            )
        )
        self._console.print()

    def _render_profile(self, report: RunmateReport) -> None:
        p = report.profile
        cd = report.coach_decision
        colour = _LEVEL_COLOUR.get(p.level.value, "white")

        table = Table(box=box.ROUNDED, show_header=False, border_style="dim")
        table.add_column("Field", style="dim", width=18)
        table.add_column("Value", style="bold")

        table.add_row("Level", f"[{colour}]{p.level.value}[/{colour}]")
        table.add_row("Location", p.location)
        table.add_row(
            "Distance(s)", ", ".join(cd.distances)
        )
        table.add_row(
            "Searching",
            ", ".join(cd.months_to_search) if cd.months_to_search else "next 3 months",
        )

        self._console.print(
            Panel(table, title="[bold]Your Profile[/bold]", border_style="blue")
        )
        self._console.print()

    def _render_beginner_guidance(self, guidance: str) -> None:
        self._console.print(
            Panel(
                Text(guidance, justify="left"),
                title="[bold green]💚 Beginner Guidance[/bold green]",
                border_style="green",
                padding=(1, 2),
            )
        )
        self._console.print()

    def _render_parkrun_notice(self) -> None:
        self._console.print(
            Panel(
                "[yellow]No official races were found for your criteria.\n"
                "Showing nearby [bold]Parkrun[/bold] events instead — "
                "free, weekly, welcoming 5K runs every Saturday![/yellow]",
                title="[bold yellow]📍 Parkrun Fallback[/bold yellow]",
                border_style="yellow",
                padding=(0, 2),
            )
        )
        self._console.print()

    def _render_recommendations(self, report: RunmateReport) -> None:
        self._console.print(Rule("[bold]🏅 Race Recommendations[/bold]", style="blue"))
        self._console.print()

        for rec in report.recommendations:
            medal = _MEDAL_EMOJI.get(rec.rank, f"#{rec.rank}")
            race = rec.race

            # Build detail lines
            details: list[str] = []
            if race.date:
                details.append(f"📅  [dim]Date:[/dim]     {race.date}")
            details.append(f"📍  [dim]Location:[/dim]  {race.location}")
            details.append(f"🏃  [dim]Distance:[/dim]  {race.distance}")
            if race.url:
                details.append(f"🔗  [dim]URL:[/dim]       [link={race.url}]{race.url}[/link]")

            body = "\n".join(details)
            body += f"\n\n{rec.explanation}"

            border = "yellow" if race.is_parkrun else "cyan"
            parkrun_tag = " [yellow][Parkrun][/yellow]" if race.is_parkrun else ""

            self._console.print(
                Panel(
                    body,
                    title=f"{medal}  [bold]{race.name}[/bold]{parkrun_tag}",
                    border_style=border,
                    padding=(1, 2),
                )
            )
            self._console.print()

    def _render_no_results(self, report: RunmateReport) -> None:
        self._console.print(
            Panel(
                "[dim]No races or Parkrun events could be found for your criteria.\n"
                "Try broadening your location or removing the month filter.[/dim]",
                title="[bold red]No Results[/bold red]",
                border_style="red",
            )
        )
        self._console.print()

    def _render_disclaimer(self, disclaimer: str) -> None:
        self._console.print(Rule(style="dim"))
        self._console.print(
            Padding(
                f"[dim italic]{disclaimer}[/dim italic]",
                (0, 2),
            )
        )
        self._console.print()

    # ------------------------------------------------------------------
    # File output
    # ------------------------------------------------------------------

    def _save_report(self, report: RunmateReport) -> None:
        _OUTPUT_DIR.mkdir(exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        slug = report.profile.location.lower().replace(" ", "_").replace(",", "")
        filename = f"runmate_{slug}_{timestamp}.txt"
        filepath = _OUTPUT_DIR / filename

        lines: list[str] = [
            "RunMate AI Report",
            "=" * 60,
            f"Level:    {report.profile.level.value}",
            f"Location: {report.profile.location}",
            f"Searched: {', '.join(report.coach_decision.months_to_search)}",
            "",
        ]

        if report.coach_decision.beginner_guidance:
            lines += ["--- Beginner Guidance ---", report.coach_decision.beginner_guidance, ""]

        if report.used_parkrun_fallback:
            lines += ["[Parkrun fallback was used — no official races found]", ""]

        lines += ["--- Recommendations ---", ""]
        for rec in report.recommendations:
            r = rec.race
            lines += [
                f"#{rec.rank}  {r.name}",
                f"    Distance: {r.distance}",
                f"    Location: {r.location}",
            ]
            if r.date:
                lines.append(f"    Date:     {r.date}")
            if r.url:
                lines.append(f"    URL:      {r.url}")
            lines += [f"    {rec.explanation}", ""]

        lines += ["---", report.disclaimer]

        filepath.write_text("\n".join(lines), encoding="utf-8")
        self._console.print(f"[dim]📄 Report saved to {filepath}[/dim]")
