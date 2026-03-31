from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings, validate_production_secrets
from app.database import SessionLocal
from app.logging_config import RequestIDMiddleware, configure_logging
from app.rate_limit import limiter
from app.routers import auth, matching, review, sources, unified, upload, users, ws


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-XSS-Protection"] = "0"
        return response


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
