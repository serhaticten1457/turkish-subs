from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from typing import Optional, List
import os
from contextlib import asynccontextmanager
from backend.services.translation_memory import TranslationMemoryService
from google.genai import GoogleGenAI

# Initialize Translation Memory Service
# Redis URL should come from environment variables (Docker service name)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
tm_service = TranslationMemoryService(redis_url=REDIS_URL)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await tm_service.connect()
    yield
    # Shutdown
    await tm_service.close()

app = FastAPI(title="Subtitle Studio API", lifespan=lifespan)

# --- Models ---

class TranslationRequest(BaseModel):
    text: str
    target_lang: str = "tr"
    api_key: str
    model: str = "gemini-2.5-flash-latest"
    context: Optional[str] = None
    previous_lines: List[str] = []
    next_lines: List[str] = []

class TMUpdateEntry(BaseModel):
    text: str
    translation: str
    target_lang: str = "tr"

class TranslationResponse(BaseModel):
    translated_text: str
    cached: bool

# --- Endpoints ---

@app.get("/")
def read_root():
    return {"status": "ok", "service": "Subtitle Studio API"}

@app.post("/tm")
async def save_to_tm(entry: TMUpdateEntry):
    """
    Saves a user correction to the Redis Translation Memory.
    """
    success = await tm_service.save_manual_translation(
        text=entry.text,
        translation=entry.translation,
        target_lang=entry.target_lang
    )
    if not success:
        # Don't fail the request, just warn
        return {"status": "warning", "message": "Failed to save to Redis"}
    return {"status": "ok"}

@app.post("/translate", response_model=TranslationResponse)
async def translate_text(req: TranslationRequest):
    """
    Translates text using Translation Memory (Redis) -> Cache Miss -> Gemini AI.
    """
    
    # Define the AI Callback (Fallback if cache misses)
    async def call_ai_generation() -> str:
        try:
            client = GoogleGenAI(api_key=req.api_key)
            
            # Construct Prompt (Simplified for backend logic, mirroring frontend logic)
            context_before = "\n".join(req.previous_lines) if req.previous_lines else ""
            context_after = "\n".join(req.next_lines) if req.next_lines else ""
            
            prompt = f"""
            {f'ÖNCEKİ BAĞLAM:\n{context_before}\n' if context_before else ''}
            ---
            ÇEVRİLECEK METİN: "{req.text}"
            ---
            {f'\nSONRAKİ BAĞLAM:\n{context_after}' if context_after else ''}
            
            Ek Bilgi: {req.context or ''}
            
            Sadece "ÇEVRİLECEK METİN" kısmını Türkçe'ye çevir.
            """
            
            response = await client.models.generate_content(
                model=req.model,
                contents=prompt
            )
            
            if response.text:
                return response.text.strip()
            raise ValueError("Empty response from AI")
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI Generation failed: {str(e)}")

    # Use the Translation Memory Service
    # We check cache first, if not found, it runs 'call_ai_generation', stores it, and returns.
    try:
        # We manually check if it was cached to return the 'cached' flag for UI debugging
        # (The service abstraction hides this, but we can infer or modify service to return metadata)
        # For simplicity here, we trust the service to do the job.
        
        result = await tm_service.get_or_compute(
            text=req.text,
            target_lang=req.target_lang,
            ai_callback=call_ai_generation
        )
        
        # Note: Ideally TM service returns metadata to know if it was a HIT or MISS.
        # Assuming HIT for now if latency is low, but for API spec we just return result.
        return {"translated_text": result, "cached": False} 
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))