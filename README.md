# RunMate AI 🏃

An AI-powered running companion that helps runners discover races appropriate to their experience level and location. Now featuring a modern local web application.

## Features

- **Race Discovery** — finds official races matching your level, location, distance, and month
- **Parkrun Fallback** — automatically searches for nearby Parkrun events when no official races are found
- **AI Recommendations** — explains why each race suits you, with beginner-friendly guidance
- **Multi-Agent Architecture** — Coach, Race Search, Recommendation, and Output agents work together
- **Web Dashboard** — Interactive responsive layout with runner profile settings, search history, and live SSE progress streaming
- **Cloud-Ready** — business logic is decoupled for both web interface and CLI usage

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

### 3. Run the Web Application

Start the FastAPI local server:

```bash
uvicorn app.main:app --reload
```

Open your browser at:
[http://localhost:8000](http://localhost:8000)

---

### 4. Run the CLI Tool (Optional)

You can also search directly from the terminal:

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
| `--distance` | ❌ | `5K`, `10K`, `Half Marathon`, `Marathon` (repeatable) |
| `--month` | ❌ | Month name, e.g. `October`. Defaults to next 3 months (repeatable) |
| `--save` | ❌ | Save the report to `output/` |

## Project Layout

```
runmate-agent/
│
├── app/
│   ├── api/
│   │   └── search.py           REST API router for /api/search (SSE stream)
│   │
│   ├── services/
│   │   └── pipeline_service.py Asynchronous worker orchestration service
│   │
│   ├── agent/                  Core RunMate agent logic
│   │   ├── agents/             Coach, RaceSearch, Recommendation, Output agents
│   │   ├── tools/              RaceSearch, Parkrun, LocalList, Fallback tools
│   │   ├── models/             Runner profile and race data models
│   │   ├── utils/              Retry logic and helper methods
│   │   └── prompts/            Plain text agent system prompts
│   │
│   ├── templates/
│   │   └── index.html          Main single-page HTML dashboard
│   │
│   ├── static/
│   │   ├── style.css           Custom responsive design stylesheet
│   │   └── app.js              FastAPI SSE connection client
│   │
│   └── main.py                 FastAPI server entry point
│
├── runmate.py                  CLI runner entry point
├── .env.example                Environment variable template
└── requirements.txt            Project dependency manifest
```

### Agent Flow

```
1. Client Form      → Gathers preferences (level, location, distances, months)
2. FastAPI /search  → Establishes SSE stream connection
3. CoachAgent       → Resolves target distances and beginner advice
4. RaceSearchAgent  → Queries official races (Google Search Grounding)
                    → Falls back to Parkruns or year-round historical events
5. RecommenderAgent → Ranks races and generates explanation text
6. Client JS        → Updates UI with beautiful responsive cards in real-time
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
