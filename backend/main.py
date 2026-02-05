from fastapi import FastAPI, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import os
from contextlib import asynccontextmanager
from backend.services.translation_memory import TranslationMemoryService
from google.genai import GoogleGenAI

# Environment Variable or Default to None (Force fallback to local file if not in Docker)
REDIS_URL = os.getenv("REDIS_URL", None)
tm_service = TranslationMemoryService(redis_url=REDIS_URL)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await tm_service.connect()
    yield
    # Shutdown
    await tm_service.close()

app = FastAPI(title="Subtitle Studio API", lifespan=lifespan)

# Allow CORS for development (when React runs on 3000 and Py on 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# --- API Endpoints ---

@app.get("/api/health")
def read_root():
    return {"status": "ok", "service": "Subtitle Studio API", "mode": "Desktop" if tm_service.use_local_store else "Server"}

@app.post("/api/tm")
async def save_to_tm(entry: TMUpdateEntry):
    success = await tm_service.save_manual_translation(
        text=entry.text,
        translation=entry.translation,
        target_lang=entry.target_lang
    )
    if not success:
        return {"status": "warning", "message": "Failed to save to Memory"}
    return {"status": "ok"}

@app.post("/api/translate", response_model=TranslationResponse)
async def translate_text(req: TranslationRequest):
    async def call_ai_generation() -> str:
        try:
            client = GoogleGenAI(api_key=req.api_key)
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

    try:
        result = await tm_service.get_or_compute(
            text=req.text,
            target_lang=req.target_lang,
            ai_callback=call_ai_generation
        )
        return {"translated_text": result, "cached": False} 
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Serve Static Files (React Build) ---
# This allows FastAPI to serve the frontend in Desktop mode without Nginx
dist_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")

if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")
else:
    # Fallback for dev mode if dist doesn't exist yet
    @app.get("/")
    def read_root_index():
        return {"message": "Frontend not built. Run 'npm run build' first."}
