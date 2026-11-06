"""FastAPI factory + env settings (FRONTEND_ORIGIN, DATA_ROOT)."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router, startup_db
from backend.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    startup_db(settings)
    app = FastAPI(title="EMBERLENS API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()
