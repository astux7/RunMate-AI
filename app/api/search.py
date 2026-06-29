import json
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from app.services.pipeline_service import run_pipeline

router = APIRouter()

@router.post("/search")
async def search_races(request: Request):
    """
    POST endpoint to run the RunMate agent pipeline.
    Accepts search criteria and returns a streamed EventSource response (SSE)
    containing pipeline progress updates and the final structured result.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    level = body.get("level")
    location = body.get("location")
    distance = body.get("distance")
    month = body.get("month")
    no_grounding = body.get("no_grounding", False)
    
    if not level or not location:
        raise HTTPException(
            status_code=400,
            detail="Missing required parameters: level and location"
        )
        
    # Format distance and month lists to comma-separated strings for RunnerProfile validation
    distance_str = ", ".join(distance) if isinstance(distance, list) else distance
    month_str = ", ".join(month) if isinstance(month, list) else month
    
    profile_data = {
        "level": level.upper() if isinstance(level, str) else level,
        "location": location,
        "distance": distance_str,
        "month": month_str
    }
    
    enable_search = not no_grounding
    
    async def sse_generator():
        yield f"data: {json.dumps({'type': 'status', 'message': 'Initializing search parameters...'})}\n\n"
        
        async for event in run_pipeline(profile_data, enable_search=enable_search):
            yield f"data: {json.dumps(event)}\n\n"
            
    return StreamingResponse(
        sse_generator(),
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
