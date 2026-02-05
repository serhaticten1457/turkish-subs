import hashlib
import logging
import json
import os
import asyncio
from typing import Callable, Awaitable, Optional

# Redis is optional now
try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

# Configure logger
logger = logging.getLogger("TranslationMemory")

class TranslationMemoryService:
    def __init__(self, redis_url: str = None, ttl_seconds: int = 2592000, local_file: str = "tm_store.json"):
        self.redis_url = redis_url
        self.ttl_seconds = ttl_seconds
        self.redis: Optional[redis.Redis] = None
        self.use_local_store = False
        self.local_file = local_file
        self.local_cache = {}

    async def connect(self):
        # 1. Try Redis First (If URL provided and module available)
        if REDIS_AVAILABLE and self.redis_url and "localhost" not in self.redis_url: # Skip localhost default for desktop default
            try:
                self.redis = redis.from_url(
                    self.redis_url, 
                    decode_responses=True, 
                    encoding="utf-8",
                    socket_timeout=2.0
                )
                await self.redis.ping()
                logger.info("TranslationMemory: Connected to Redis successfully.")
                return
            except Exception as e:
                logger.warning(f"TranslationMemory: Redis connection failed ({e}). Switching to Local File Store.")
        
        # 2. Fallback to Local JSON File (Desktop Mode)
        self.use_local_store = True
        self._load_local_store()
        logger.info(f"TranslationMemory: Running in Desktop Mode (File: {self.local_file})")

    async def close(self):
        if self.redis:
            await self.redis.close()
        if self.use_local_store:
            self._save_local_store()

    def _load_local_store(self):
        if os.path.exists(self.local_file):
            try:
                with open(self.local_file, 'r', encoding='utf-8') as f:
                    self.local_cache = json.load(f)
            except:
                self.local_cache = {}

    def _save_local_store(self):
        try:
            with open(self.local_file, 'w', encoding='utf-8') as f:
                json.dump(self.local_cache, f, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save local TM: {e}")

    def _normalize_text(self, text: str) -> str:
        if not text:
            return ""
        return text.strip().lower()

    def _generate_key(self, text: str, target_lang: str) -> str:
        normalized_text = self._normalize_text(text)
        hash_object = hashlib.sha256(normalized_text.encode('utf-8'))
        text_hash = hash_object.hexdigest()
        return f"tm:{target_lang.lower()}:{text_hash}"

    async def save_manual_translation(self, text: str, translation: str, target_lang: str = "tr") -> bool:
        if not text or not translation:
            return False
        
        key = self._generate_key(text, target_lang)

        if self.redis:
            try:
                await self.redis.set(key, translation, ex=self.ttl_seconds)
                return True
            except Exception as e:
                logger.error(f"Redis WRITE Error: {e}")
                return False
        elif self.use_local_store:
            self.local_cache[key] = translation
            # Save asynchronously/periodically in real app, but here immediate for safety
            self._save_local_store() 
            return True
            
        return False

    async def get_or_compute(self, text: str, target_lang: str, ai_callback: Callable[[], Awaitable[str]]) -> str:
        if not text or not text.strip():
            return ""

        key = self._generate_key(text, target_lang)

        # --- READ CACHE ---
        cached_val = None
        if self.redis:
            try:
                cached_val = await self.redis.get(key)
            except: pass
        elif self.use_local_store:
            cached_val = self.local_cache.get(key)

        if cached_val:
            return cached_val

        # --- COMPUTE (AI) ---
        translation = await ai_callback()

        # --- WRITE CACHE ---
        if translation:
            if self.redis:
                try:
                    await self.redis.set(key, translation, ex=self.ttl_seconds)
                except: pass
            elif self.use_local_store:
                self.local_cache[key] = translation
                self._save_local_store()

        return translation