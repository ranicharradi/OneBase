from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.datastructures import MutableHeaders

from app.config import settings, validate_production_secrets
from app.database import SessionLocal
from app.logging_config import RequestIDMiddleware, configure_logging
from app.rate_limit import limiter
from app.routers import auth, canonical, matching, review, sources, unified, upload, users, ws


class SecurityHeadersMiddleware:
    """Adds security headers to all HTTP responses (pure ASGI)."""

    HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "X-XSS-Protection": "0",
    }

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", [])
                headers = MutableHeaders(scope=message)
                for key, value in self.HEADERS.items():
                    headers[key] = value
            await send(message)

        await self.app(scope, receive, send_with_headers)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle handler."""
    # Configure structured logging for production
    configure_logging(settings.environment)

    # Fail fast if production secrets are insecure
    validate_production_secrets(settings)

    # Startup: create initial admin user if configured
    db = SessionLocal()
    try:
        from app.services.auth import create_initial_user

        create_initial_user(db)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
    yield
    # Shutdown: nothing to clean up


app = FastAPI(
    title="OneBase",
    description="Enterprise Supplier Data Unification Platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)

# Include routers
app.include_router(auth.router)
app.include_router(canonical.router)
app.include_router(users.router)
app.include_router(sources.router)
app.include_router(upload.router)
app.include_router(matching.router)
app.include_router(review.router)
app.include_router(unified.router)
app.include_router(ws.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
