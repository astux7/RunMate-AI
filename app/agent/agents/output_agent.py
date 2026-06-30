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

        if report.used_parkrun_fallback and not report.historical_races:
            self._render_parkrun_notice()

        if report.recommendations:
            self._render_recommendations(report)
        elif report.historical_races:
            self._render_historical_races(report)
            if report.travel_tip:
                self._render_travel_tip(report.travel_tip, report.profile.location)
        else:
            self._render_no_results(report)

        if report.parkrun_local_events:
            self._render_parkrun_local_list(report)

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
                "[dim]No races could be found for your criteria.\n"
                "Try broadening your location or removing the month filter.[/dim]",
                title="[bold red]No Results[/bold red]",
                border_style="red",
            )
        )
        self._console.print()

    def _render_historical_races(self, report: RunmateReport) -> None:
        """Render historically/typically held races when no upcoming events were found."""
        country = report.profile.location.split(",")[-1].strip()

        # Insight panel
        if report.historical_insight:
            self._console.print(
                Panel(
                    f"[yellow]{report.historical_insight}[/yellow]",
                    title=f"[bold yellow]🌍 Running in {country}[/bold yellow]",
                    border_style="yellow",
                    padding=(1, 2),
                )
            )
            self._console.print()

        self._console.print(
            Rule(
                "[bold yellow]📅 Races Typically Held Here[/bold yellow]",
                style="yellow",
            )
        )
        self._console.print(
            Padding(
                "[dim italic]These races are historically held in this region. "
                "Dates shown are typical — confirm current-year editions "
                "directly with the organiser before booking.[/dim italic]",
                (0, 2),
            )
        )
        self._console.print()

        for race in report.historical_races:
            details: list[str] = []
            if race.date:
                details.append(f"📅  [dim]Typical date:[/dim]  {race.date}")
            details.append(f"📍  [dim]Location:[/dim]     {race.location}")
            details.append(f"🏃  [dim]Distance:[/dim]     {race.distance}")
            if race.url:
                details.append(f"🔗  [dim]More info:[/dim]    [link={race.url}]{race.url}[/link]")
            if race.description:
                details.append(f"\n{race.description}")

            self._console.print(
                Panel(
                    "\n".join(details),
                    title=f"[bold yellow]{race.name}[/bold yellow]  [dim](historically held)[/dim]",
                    border_style="yellow",
                    padding=(1, 2),
                )
            )
            self._console.print()

    def _render_travel_tip(self, travel_tip: str, location: str) -> None:
        """Render a travel planning suggestion panel."""
        self._console.print(
            Panel(
                f"[bold]{travel_tip}[/bold]",
                title="[bold]✈️  Plan Your Trip[/bold]",
                border_style="bright_yellow",
                padding=(1, 2),
                subtitle="[dim]Adjust your travel dates to catch these events[/dim]",
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

    def _render_parkrun_local_list(self, report: RunmateReport) -> None:
        """Render a table of all local parkrun events with links."""
        city = report.profile.location.split(",")[0].strip()
        events = report.parkrun_local_events

        self._console.print(
            Rule(f"[bold green]🏃 Parkrun events in {city}[/bold green]", style="green")
        )
        self._console.print()

        table = Table(
            box=box.ROUNDED,
            border_style="green",
            show_header=True,
            header_style="bold green",
            expand=True,
        )
        table.add_column("#", style="dim", width=3, justify="right")
        table.add_column("Event", style="bold")
        table.add_column("Start", style="cyan", width=18)
        table.add_column("Link", style="blue")

        for i, event in enumerate(events, start=1):
            table.add_row(
                str(i),
                event.name,
                event.start_time,
                f"[link={event.url}]{event.url}[/link]",
            )

        self._console.print(table)
        self._console.print(
            Padding(
                "[dim]All parkrun events are free. Register once at "
                "[link=https://www.parkrun.org.uk/register/]parkrun.org.uk/register[/link][/dim]",
                (1, 2),
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

        if report.parkrun_local_events:
            city = report.profile.location.split(",")[0].strip()
            lines += [f"--- parkrun events in {city} ---", ""]
            for i, event in enumerate(report.parkrun_local_events, start=1):
                lines.append(f"  {i}. {event.name}")
                lines.append(f"     Start: {event.start_time}")
                lines.append(f"     URL:   {event.url}")
            lines.append("")
            lines.append(
                "Register free at: https://www.parkrun.org.uk/register/"
            )
            lines.append("")

        if report.historical_races:
            lines += ["--- Races Typically Held Here (historical / not confirmed) ---", ""]
            if report.historical_insight:
                lines += [report.historical_insight, ""]
            for race in report.historical_races:
                lines += [f"  {race.name}"]
                lines.append(f"     Typical date: {race.date or 'varies'}")
                lines.append(f"     Location:     {race.location}")
                lines.append(f"     Distance:     {race.distance}")
                if race.url:
                    lines.append(f"     More info:    {race.url}")
                if race.description:
                    lines.append(f"     {race.description}")
                lines.append("")

        if report.travel_tip:
            lines += ["--- ✈️  Travel Planning ---", "", report.travel_tip, ""]

        lines += ["---", report.disclaimer]

        filepath.write_text("\n".join(lines), encoding="utf-8")
        self._console.print(f"[dim]📄 Report saved to {filepath}[/dim]")
