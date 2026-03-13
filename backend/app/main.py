from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import SessionLocal
from app.routers import auth, users, sources


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle handler."""
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
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(sources.router)
