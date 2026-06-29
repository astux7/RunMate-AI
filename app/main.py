import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

# Load .env variables
load_dotenv()

# Resolve path and insert app/agent to sys.path so existing codebase imports work
base_dir = Path(__file__).parent.parent
sys.path.insert(0, str(base_dir / "app" / "agent"))

from app.api.search import router as search_router

app = FastAPI(
    title="RunMate AI",
    description="Your AI-powered running race companion",
    version="1.0.0"
)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

@app.get("/", response_class=HTMLResponse)
async def get_index():
    """Serve the main HTML frontend."""
    template_path = Path(__file__).parent / "templates" / "index.html"
    if not template_path.exists():
        return HTMLResponse(
            content="<h1>Frontend file not found</h1>",
            status_code=404
        )
    return HTMLResponse(content=template_path.read_text(encoding="utf-8"))

@app.get("/health")
async def health_check():
    """Simple health check endpoint."""
    api_key_set = bool(os.getenv("GOOGLE_API_KEY", "").strip())
    return {
        "status": "healthy",
        "api_key_configured": api_key_set
    }

# Include routers
app.include_router(search_router, prefix="/api")
