# RunMate AI 🏃

An AI-powered running companion that helps runners discover races appropriate to their experience level and location.

## Features

- **Race Discovery** — finds official races matching your level, location, distance, and month
- **Parkrun Fallback** — automatically searches for nearby Parkrun events when no official races are found
- **AI Recommendations** — explains why each race suits you, with beginner-friendly guidance
- **Multi-Agent Architecture** — Coach, Race Search, Recommendation, and Output agents work together
- **Cloud-Ready** — business logic is decoupled from the CLI for future deployment

## Quick Start

### 1. Clone and set up

```bash
git clone <repo>
cd runmate-agent
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env and add your GOOGLE_API_KEY
```

Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com).

### 3. Run

```bash
# Starter runner in Leeds — will recommend 5K races and Parkruns
python runmate.py --level STARTER --location "Leeds, United Kingdom"

# Experienced runner targeting a Half Marathon in October
python runmate.py --level RUNNER --location "London" --distance "Half Marathon" --month "October"

# Marathon runner in Berlin — searches all upcoming months
python runmate.py --level RUNNER --location "Berlin" --distance "Marathon"

# Save the report to output/
python runmate.py --level STARTER --location "Edinburgh" --save
```

### CLI Options

| Option | Required | Description |
|---|---|---|
| `--level` | ✅ | `STARTER` or `RUNNER` |
| `--location` | ✅ | City/region, e.g. `"Leeds, United Kingdom"` |
| `--distance` | ❌ | `5K`, `10K`, `Half Marathon`, `Marathon` |
| `--month` | ❌ | Month name, e.g. `October`. Defaults to next 3 months |
| `--save` | ❌ | Save the report to `output/` |

## Architecture

```
runmate.py              CLI entry point (Typer)
│
├── agents/
│   ├── coach_agent.py          Resolves distances & beginner guidance
│   ├── race_search_agent.py    Finds races via tools
│   ├── recommendation_agent.py Ranks & explains races with LLM
│   └── output_agent.py         Rich terminal report rendering
│
├── tools/
│   ├── race_search_tool.py     Official race search (Gemini + Google Search)
│   └── parkrun_tool.py         Parkrun fallback search
│
├── models/
│   ├── runner.py               RunnerProfile, CoachDecision
│   └── race.py                 Race, Recommendation, RunmateReport
│
└── prompts/                    Agent system prompts (plain text files)
```

### Agent Flow

```
1. CoachAgent       → Resolves distances to search + beginner guidance
2. RaceSearchAgent  → Calls tools → falls back to Parkrun if needed
3. RecommendationAgent → LLM ranks races + writes explanations
4. OutputAgent      → Rich terminal report
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_API_KEY` | — | **Required.** Gemini API key |
| `MODEL_NAME` | `gemini-2.5-flash` | Gemini model to use |
| `ENABLE_SEARCH_GROUNDING` | `true` | Use Google Search for real race data |
| `SAVE_REPORTS` | `false` | Auto-save reports to `output/` |

## Roadmap

- [ ] Training plan generation
- [ ] Strava integration
- [ ] Garmin Connect integration
- [ ] Weather-aware recommendations
- [ ] Destination race suggestions (Abbott World Marathon Majors, Parkrun tourism)
- [ ] REST API / Cloud Run deployment
- [ ] Web UI

## Safety

RunMate AI provides **informational recommendations only**. It is not a medical or coaching authority. Always consult a healthcare professional before starting a new exercise programme.

## Licence

Apache 2.0
