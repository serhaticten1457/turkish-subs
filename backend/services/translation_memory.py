import hashlib
import logging
from typing import Callable, Awaitable, Optional
import redis.asyncio as redis

# Configure logger
logger = logging.getLogger("TranslationMemory")

class TranslationMemoryService:
    """
    A robust Translation Memory & Caching Layer using Redis.
    Designed for High-Performance FastAPI architectures.
    
    Features:
    - Asyncio support (non-blocking).
    - Composite Hashing (Text + Lang).
    - Fail-safe (works even if Redis goes down).
    - Text Normalization (deduplication).
    
    Usage Example in FastAPI:
    -------------------------
    
    # 1. In main.py / lifespan:
    tm_service = TranslationMemoryService(redis_url="redis://localhost:6379")
    await tm_service.connect()
    
    # 2. In your endpoint:
    async def call_ai():
        return await gemini.generate_content(...)
        
    translation = await tm_service.get_or_compute(
        text="Hello world", 
        target_lang="es", 
        ai_callback=call_ai
    )
    """

    def __init__(self, redis_url: str, ttl_seconds: int = 2592000):
        """
        Initialize the service.
        
        :param redis_url: Redis connection string (e.g., 'redis://localhost:6379/0')
        :param ttl_seconds: Cache TTL in seconds. Default is 30 days (2,592,000s).
        """
        self.redis_url = redis_url
        self.ttl_seconds = ttl_seconds
        self.redis: Optional[redis.Redis] = None

    async def connect(self):
        """
        Establishes the Redis connection pool. 
        Should be called on application startup.
        """
        try:
            # decode_responses=True ensures we receive strings, not bytes
            self.redis = redis.from_url(
                self.redis_url, 
                decode_responses=True, 
                encoding="utf-8",
                socket_timeout=5.0
            )
            # Quick health check
            await self.redis.ping()
            logger.info("TranslationMemory: Connected to Redis successfully.")
        except Exception as e:
            logger.error(f"TranslationMemory: FAILED to connect to Redis. Running in degraded mode (No Cache). Error: {e}")
            self.redis = None

    async def close(self):
        """
        Closes the Redis connection.
        Should be called on application shutdown.
        """
        if self.redis:
            await self.redis.close()
            logger.info("TranslationMemory: Connection closed.")

    def _normalize_text(self, text: str) -> str:
        """
        Normalizes input text to improve cache hit rates.
        - Strips leading/trailing whitespace.
        - Converts to lowercase (assuming semantic equivalence for single sentences).
        """
        if not text:
            return ""
        return text.strip().lower()

    def _generate_key(self, text: str, target_lang: str) -> str:
        """
        Generates a unique, deterministic hash key for Redis.
        Format: tm:{target_lang}:{sha256_hash}
        """
        normalized_text = self._normalize_text(text)
        
        # Use SHA256 for a low collision probability
        hash_object = hashlib.sha256(normalized_text.encode('utf-8'))
        text_hash = hash_object.hexdigest()
        
        # Include target_lang in key to distinguish translations
        return f"tm:{target_lang.lower()}:{text_hash}"

    async def save_manual_translation(self, text: str, translation: str, target_lang: str = "tr") -> bool:
        """
        Explicitly saves a translation to the memory (e.g., user correction).
        """
        if not text or not translation or not self.redis:
            return False
            
        key = self._generate_key(text, target_lang)
        try:
            # Save with TTL
            await self.redis.set(key, translation, ex=self.ttl_seconds)
            logger.info(f"TM Updated: '{text}' -> '{translation}'")
            return True
        except Exception as e:
            logger.error(f"Redis WRITE Error for {key}: {e}")
            return False

    async def get_or_compute(
        self, 
        text: str, 
        target_lang: str, 
        ai_callback: Callable[[], Awaitable[str]]
    ) -> str:
        """
        The core caching method.
        
        :param text: Source text to translate.
        :param target_lang: Target language code.
        :param ai_callback: An async function that calls the AI if cache misses.
        :return: The translated text.
        """
        if not text or not text.strip():
            return ""

        key = self._generate_key(text, target_lang)

        # --- STEP 2: Check Redis (Cache HIT) ---
        if self.redis:
            try:
                cached_translation = await self.redis.get(key)
                if cached_translation:
                    logger.debug(f"Cache HIT for key: {key}")
                    return cached_translation
            except Exception as e:
                # FAIL SAFE: Log error but continue to AI generation
                logger.error(f"Redis READ Error for {key}: {e}")

        # --- STEP 4: Cache MISS (Call AI) ---
        logger.debug(f"Cache MISS for key: {key}. Executing AI callback...")
        
        try:
            translation = await ai_callback()
        except Exception as e:
            # If AI fails, re-raise. We can't do anything else.
            raise e

        # --- Store Result in Redis ---
        if self.redis and translation:
            try:
                # Set with TTL
                await self.redis.set(key, translation, ex=self.ttl_seconds)
            except Exception as e:
                # FAIL SAFE: Log error but return the translation we got
                logger.error(f"Redis WRITE Error for {key}: {e}")

        return translation