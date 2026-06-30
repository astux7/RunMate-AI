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

## Multi-Agent Architecture

RunMate AI utilizes a decoupled, orchestrator-driven multi-agent architecture designed to process runner requirements, aggregate official races, fall back to weekly community runs (parkruns) or historical events, rank recommendations, and stream intermediate progress in real-time to the web client.

```mermaid
graph TD
    User["Client App (Web/CLI)"] -->|1. Profile| Pipe["Pipeline Service (Orchestrator)"]
    
    %% Coach Phase
    Pipe -->|2. Profile| Coach["Coach Agent (Deterministic)"]
    Coach -->|3. Scope & Advice| Pipe
    
    %% Search Phase
    Pipe -->|4. Queries| Search["Race Search Agent (Orchestrator)"]
    subgraph SearchAgent ["Search fallback Chain"]
        Search -->|A. Live Search| RST["RaceSearchTool (Grounding)"]
        Search -->|B. Fallback 1| PT["ParkrunTool (Grounding)"]
        Search -->|C. Fallback 2| YRT["YearRoundFallbackTool (Historical)"]
    end
    RST -->|Races| Search
    PT -->|Races| Search
    YRT -->|Races| Search
    Search -->|5. Results| Pipe
    
    %% Recommendations Phase
    Pipe -->|6. Candidates| Recommender["Recommendation Agent (LLM)"]
    Recommender -->|7. Ranked & Tagged| Pipe
    
    %% Parkrun List Tool
    Pipe -->|8. Map & Table Locations| PLT["ParkrunLocalListTool (Capped to 5)"]
    PLT -->|Local Parkruns| Pipe
    
    %% Outputs
    Pipe -->|9. Format| Output["Output Agent (CLI)"]
    Pipe -->|10. Save / Cache| Disk["Disk / Browser Cache"]
    Pipe -.->|SSE Stream| User
```

### Core Agents & Orchestrators

* **⚡ Pipeline Service** ([pipeline_service.py](file:///Users/astux/.gemini/antigravity/scratch/runmate-agent/app/services/pipeline_service.py)): The top-level asynchronous orchestrator coordinating agent execution, profile validation, local parkrun list loading, and real-time SSE stream events.
* **🧠 Coach Agent** ([coach_agent.py](file:///Users/astux/.gemini/antigravity/scratch/runmate-agent/app/agent/agents/coach_agent.py)): Pure Python / Deterministic logic. Resolves search scope, target months, defaults target distances, and compiles beginner guidance.
* **🔍 Race Search Agent** ([race_search_agent.py](file:///Users/astux/.gemini/antigravity/scratch/runmate-agent/app/agent/agents/race_search_agent.py)): Search orchestrator coordinating a 3-tier fallback chain (Official Upcoming → Parkrun Fallback → Year-Round Historical fallback).
* **🌟 Recommendation Agent** ([recommendation_agent.py](file:///Users/astux/.gemini/antigravity/scratch/runmate-agent/app/agent/agents/recommendation_agent.py)): LLM-based (`gemini-2.5-flash`). Sorts candidates, prioritizing target-city races at the top, and tags Abbott World Marathon Majors and SuperHalfs Series.
* **📝 Output Agent** ([output_agent.py](file:///Users/astux/.gemini/antigravity/scratch/runmate-agent/app/agent/agents/output_agent.py)): Formatter for CLI panels.

### Integrated Tools

* **🌐 RaceSearchTool** ([race_search_tool.py](file:///Users/astux/.gemini/antigravity/scratch/runmate-agent/app/agent/tools/race_search_tool.py)): Google Search Grounded crawler for upcoming official race listings.
* **🌳 ParkrunTool** ([parkrun_tool.py](file:///Users/astux/.gemini/antigravity/scratch/runmate-agent/app/agent/tools/parkrun_tool.py)): Grounded finder for parkruns in the search area to use as a primary race-listing fallback.
* **📅 YearRoundFallbackTool** ([year_round_fallback_tool.py](file:///Users/astux/.gemini/antigravity/scratch/runmate-agent/app/agent/tools/year_round_fallback_tool.py)): Crawls historical/typical dates for local runs if no upcoming dates exist.
* **🗺️ ParkrunLocalListTool** ([parkrun_local_list_tool.py](file:///Users/astux/.gemini/antigravity/scratch/runmate-agent/app/agent/tools/parkrun_local_list_tool.py)): Grounded builder returning the closest central parkruns (capped at 5) for map coordinates and local table grids.

### Real-Time SSE Stream & Data Saving

1. **SSE Connection:** Dashboard connects to `/api/search` via EventSource.
2. **Progress streaming:** Yields status events as agents work (e.g. *"🏃‍♀️🏃‍♂️ Jogging around the web..."*).
3. **Save & Cache:** Final reports are automatically saved to output files (CLI mode) or cached in the browser's `localStorage` (Web mode) for instant offline reloading.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_API_KEY` | — | **Required.** Gemini API key |
| `MODEL_NAME` | `gemini-2.5-flash` | Gemini model to use |
| `ENABLE_SEARCH_GROUNDING` | `true` | Use Google Search for real race data |
| `SAVE_REPORTS` | `false` | Auto-save reports to `output/` |

## Roadmap

- [x] Web UI / REST API (FastAPI and JavaScript Dashboard)
- [x] Interactive Event Map (Leaflet integration showing green/orange event markers)
- [x] Parkrun integration (free Saturday morning 5K mapping & zero-judgment walk alerts)
- [x] Destination race suggestions (Abbott World Marathon Majors, SuperHalfs series highlights)
- [ ] Training plan generation
- [ ] Strava integration
- [ ] Garmin Connect integration
- [ ] Weather-aware recommendations

## Safety

RunMate AI provides **informational recommendations only**. It is not a medical or coaching authority. Always consult a healthcare professional before starting a new exercise programme.

## Licence

Apache 2.0
