import sys
from pathlib import Path

# Add app and app/agent to sys.path so imports work
app_dir = Path(__file__).parent.parent
if str(app_dir) not in sys.path:
    sys.path.insert(0, str(app_dir))

agent_dir = app_dir / "agent"
if str(agent_dir) not in sys.path:
    sys.path.insert(0, str(agent_dir))

import pytest
from unittest.mock import MagicMock

from models.runner import RunnerProfile
from models.race import Race, RaceSearchResult
from agents.coach_agent import CoachAgent
from agents.race_search_agent import RaceSearchAgent


def test_coach_agent_starter_vs_runner():
    """
    Test that CoachAgent defaults distances and provides beginner guidance
    for STARTER level, and skips guidance for RUNNER level.
    """
    coach = CoachAgent()

    # 1. STARTER Profile
    profile_starter = RunnerProfile(
        level="STARTER",
        location="Leeds, UK",
        distances=[],
        months=[]
    )
    decision_starter = coach.run(profile_starter)
    assert "5K" in decision_starter.distances
    assert decision_starter.beginner_guidance is not None
    assert "starting" in decision_starter.beginner_guidance.lower() or "5k" in decision_starter.beginner_guidance.lower()

    # 2. RUNNER Profile
    profile_runner = RunnerProfile(
        level="RUNNER",
        location="Leeds, UK",
        distances=["Marathon"],
        months=["October"]
    )
    decision_runner = coach.run(profile_runner)
    assert "Marathon" in decision_runner.distances
    assert decision_runner.beginner_guidance is None


def test_race_search_agent_parkrun_fallback():
    """
    Test that RaceSearchAgent falls back to parkrun if official searches find nothing,
    setting used_parkrun = True.
    """
    client_mock = MagicMock()
    agent = RaceSearchAgent(client=client_mock, enable_search_grounding=False)

    # Mock tools
    agent._race_tool = MagicMock()
    # Official search returns nothing
    agent._race_tool.search.return_value = RaceSearchResult(races=[], source="upcoming", query_summary="No upcoming races")

    agent._parkrun_tool = MagicMock()
    # Parkrun search finds a parkrun
    mock_parkrun = Race(
        name="Woodhouse Moor parkrun",
        location="Leeds, UK",
        date="Weekly Saturday",
        distance="5K",
        url="https://parkrun.org.uk"
    )
    agent._parkrun_tool.search.return_value = RaceSearchResult(races=[mock_parkrun], source="parkrun", query_summary="Grounded parkruns")

    profile = RunnerProfile(level="STARTER", location="Leeds, UK")
    search_result, used_parkrun, historical_races, historical_insight, travel_tip = agent.run(
        profile,
        distances=["5K"],
        months=["July"]
    )

    assert used_parkrun is True
    assert len(search_result.races) == 1
    assert search_result.races[0].name == "Woodhouse Moor parkrun"
    assert len(historical_races) == 0


def test_race_search_agent_historical_fallback_north_korea():
    """
    Test that RaceSearchAgent falls back to historical races if official and parkrun
    searches both find nothing, setting used_parkrun = False and returning the historical
    races typically held in North Korea around April (e.g. Pyongyang Marathon).
    """
    client_mock = MagicMock()
    agent = RaceSearchAgent(client=client_mock, enable_search_grounding=False)

    # Mock tools
    agent._race_tool = MagicMock()
    # Official search returns nothing
    agent._race_tool.search.return_value = RaceSearchResult(races=[], source="upcoming", query_summary="No upcoming races")

    agent._parkrun_tool = MagicMock()
    # Parkrun search returns nothing
    agent._parkrun_tool.search.return_value = RaceSearchResult(races=[], source="parkrun", query_summary="No local parkruns")

    agent._yearround_tool = MagicMock()
    # Historical search returns Pyongyang Marathon typically held in April
    mock_historical = Race(
        name="Pyongyang Marathon",
        location="Pyongyang, North Korea",
        date="Typically April (annual)",
        distance="Marathon",
        url="https://koryogroup.com",
        is_historical=True
    )
    hist_search_result = RaceSearchResult(races=[mock_historical], source="historical", query_summary="Historical North Korea")
    hist_insight = "North Korea hosts the Pyongyang Marathon annually in April."
    travel_tip = "Best time to travel for running: April."
    agent._yearround_tool.search.return_value = (hist_search_result, hist_insight, travel_tip)

    profile = RunnerProfile(level="RUNNER", location="North Korea")
    search_result, used_parkrun, historical_races, historical_insight, travel_tip = agent.run(
        profile,
        distances=["Marathon"],
        months=["April"]
    )

    # Verify return parameters match correct fallback state
    assert used_parkrun is False
    assert len(search_result.races) == 1
    assert search_result.races[0].name == "Pyongyang Marathon"
    assert search_result.races[0].is_historical is True
    assert len(historical_races) == 1
    assert "April" in historical_insight
    assert "April" in travel_tip


@pytest.mark.asyncio
async def test_pipeline_service_bypasses_recommendations_on_historical():
    """
    Test that run_pipeline bypasses RecommendationAgent generation
    when historical races are returned, ensuring they don't appear
    in recommendations list.
    """
    import os
    os.environ["GOOGLE_API_KEY"] = "mock-api-key-value"

    from services.pipeline_service import run_pipeline
    from unittest.mock import patch

    profile_data = {
        "level": "RUNNER",
        "location": "North Korea",
        "distances": ["Marathon"],
        "months": ["April"]
    }

    mock_historical = Race(
        name="Pyongyang Marathon",
        location="Pyongyang, North Korea",
        date="Typically April (annual)",
        distance="Marathon",
        url="https://koryogroup.com",
        is_historical=True
    )
    hist_search_result = RaceSearchResult(races=[mock_historical], source="historical", query_summary="Historical NK")
    hist_insight = "North Korea hosts the Pyongyang Marathon annually in April."
    travel_tip = "Best time to travel for running: April."

    # Mock the searcher.run method inside run_pipeline
    with patch("services.pipeline_service.RaceSearchAgent") as MockSearchAgentClass:
        mock_agent_instance = MagicMock()
        mock_agent_instance.run.return_value = (hist_search_result, False, [mock_historical], hist_insight, travel_tip)
        MockSearchAgentClass.return_value = mock_agent_instance

        # Call run_pipeline and iterate to find the final result
        final_report = None
        async for event in run_pipeline(profile_data, enable_search=False):
            if event["type"] == "result":
                final_report = event["report"]

        assert final_report is not None
        # Assert historical races are present but recommendations are empty
        assert len(final_report["historical_races"]) == 1
        assert final_report["historical_races"][0]["name"] == "Pyongyang Marathon"
        assert len(final_report["recommendations"]) == 0
        
        # Explicitly verify the historical Pyongyang Marathon does NOT show up in recommendations
        recommended_names = [rec["race"]["name"] for rec in final_report["recommendations"]]
        assert "Pyongyang Marathon" not in recommended_names


# Shared Location Constant for journeys to prevent duplication
TEST_LOCATION = "Leeds, UK"


@pytest.mark.asyncio
async def test_pipeline_user_journeys():
    """
    Test the full sequential pipeline execution for two distinct user journeys:
    1. STARTER level journey in TEST_LOCATION.
    2. RUNNER level journey in TEST_LOCATION.
    """
    import os
    os.environ["GOOGLE_API_KEY"] = "mock-api-key"
    from services.pipeline_service import run_pipeline
    from unittest.mock import patch

    mock_race = Race(
        name="Leeds Abbey Dash",
        location=TEST_LOCATION,
        date="2026-10-25",
        distance="10K",
        url="https://leeds-abbey-dash.com"
    )
    search_result = RaceSearchResult(races=[mock_race], source="upcoming", query_summary="Mocked races")

    # Mock the searcher and recommender runs
    with patch("services.pipeline_service.RaceSearchAgent") as MockSearchAgentClass, \
         patch("services.pipeline_service.RecommendationAgent") as MockRecommenderClass:
        
        mock_agent_instance = MagicMock()
        mock_agent_instance.run.return_value = (search_result, False, [], "", "")
        MockSearchAgentClass.return_value = mock_agent_instance

        mock_recommender_instance = MagicMock()
        mock_recommendation = {
            "rank": 1,
            "race": mock_race.model_dump() if hasattr(mock_race, "model_dump") else mock_race.dict(),
            "explanation": "Great local race."
        }
        mock_recommender_instance.run.return_value = [mock_recommendation]
        MockRecommenderClass.return_value = mock_recommender_instance

        # Journey 1: STARTER Profile
        starter_data = {
            "level": "STARTER",
            "location": TEST_LOCATION,
            "distances": [],
            "months": []
        }
        starter_report = None
        async for event in run_pipeline(starter_data, enable_search=False):
            if event["type"] == "result":
                starter_report = event["report"]

        assert starter_report is not None
        assert starter_report["profile"]["level"] == "STARTER"
        assert "5K" in starter_report["coach_decision"]["distances"]
        assert starter_report["coach_decision"]["beginner_guidance"] is not None

        # Journey 2: RUNNER Profile
        runner_data = {
            "level": "RUNNER",
            "location": TEST_LOCATION,
            "distances": ["Marathon"],
            "months": ["October"]
        }
        runner_report = None
        async for event in run_pipeline(runner_data, enable_search=False):
            if event["type"] == "result":
                runner_report = event["report"]

        assert runner_report is not None
        assert runner_report["profile"]["level"] == "RUNNER"
        assert "Marathon" in runner_report["coach_decision"]["distances"]
        assert runner_report["coach_decision"]["beginner_guidance"] is None


def test_fastapi_endpoints():
    """
    Test FastAPI health endpoints and payload input validation errors.
    """
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)

    # 1. Health check endpoint test
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"

    # 2. Validation Failure - missing required parameters
    response = client.post("/api/search", json={"location": TEST_LOCATION})
    assert response.status_code == 400
    assert "Missing required parameters" in response.json()["detail"]

    response = client.post("/api/search", json={"level": "RUNNER"})
    assert response.status_code == 400
    assert "Missing required parameters" in response.json()["detail"]


def test_race_type_classification_and_serialization():
    """
    Test that the Race models correctly classify official races and parkruns
    with the is_parkrun flag, which determines orange/red label styling on the frontend.
    """
    # 1. Official Race Model
    official_race = Race(
        name="Leeds Abbey Dash",
        location=TEST_LOCATION,
        date="2026-10-25",
        distance="10K",
        url="https://leeds-abbey-dash.com",
        is_parkrun=False
    )
    assert official_race.is_parkrun is False

    # 2. Parkrun Model
    parkrun_race = Race(
        name="Woodhouse Moor parkrun",
        location=TEST_LOCATION,
        date="Weekly Saturday",
        distance="5K",
        url="https://parkrun.org.uk",
        is_parkrun=True
    )
    assert parkrun_race.is_parkrun is True

    # 3. Serialization
    data_off = official_race.model_dump() if hasattr(official_race, "model_dump") else official_race.dict()
    data_pk = parkrun_race.model_dump() if hasattr(parkrun_race, "model_dump") else parkrun_race.dict()
    assert data_off["is_parkrun"] is False
    assert data_pk["is_parkrun"] is True





