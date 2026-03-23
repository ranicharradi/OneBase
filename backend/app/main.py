from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings, validate_production_secrets
from app.database import SessionLocal
from app.routers import auth, users, sources, upload, matching, review, unified, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle handler."""
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

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
