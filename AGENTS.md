# RunMate AI — Standing Rules

These rules apply to all work in this project.

## Architecture
- Business logic must remain in `agents/` and `tools/`. The CLI (`runmate.py`) only handles argument parsing and display delegation.
- Agents must never scrape websites directly. All external data must go through tools in `tools/`.
- Each agent must have its own prompt file in `prompts/` as a plain `.txt` file.
- Each agent must be independently testable without the CLI.

## Data
- All data flowing between agents must be Pydantic models defined in `models/`.
- `RunnerProfile` is the canonical input model — never pass raw strings between agents.

## Technology
- Python 3.12+
- Typer for CLI, Rich for terminal output, Pydantic for models, python-dotenv for config
- `google-genai` (Gemini SDK) for all LLM calls
- Google Search grounding enabled by default for race search tools

## Testing
- Model validation is the first line of defence — test it without mocking the LLM
- CoachAgent distance resolution logic must be testable without an API key

## Safety
- Always include the disclaimer in RunmateReport
- Never present AI race data as guaranteed fact
