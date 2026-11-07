"""FastAPI factory + env settings (FRONTEND_ORIGIN, DATA_ROOT)."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.api.routes import router, startup_db
from backend.config import get_settings

logger = logging.getLogger("emberlens.api")


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "") or uuid4().hex


def _error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    details: dict | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    request_id = _request_id(request)
    response_headers = dict(headers or {})
    response_headers["X-Request-ID"] = request_id
    return JSONResponse(
        status_code=status_code,
        headers=response_headers,
        content={
            "error": {
                "code": code,
                "message": message,
                "request_id": request_id,
                "details": details or {},
            }
        },
    )


def create_app() -> FastAPI:
    settings = get_settings()
    startup_db(settings)
    app = FastAPI(title="EMBERLENS API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.frontend_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        request.state.request_id = uuid4().hex
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException):
        detail = exc.detail
        if isinstance(detail, dict) and isinstance(detail.get("error"), dict):
            payload = detail["error"]
            return _error_response(
                request,
                status_code=exc.status_code,
                code=str(payload.get("code") or "HTTP_ERROR"),
                message=str(payload.get("message") or "The request could not be completed."),
                details=payload.get("details") if isinstance(payload.get("details"), dict) else {},
                headers=exc.headers,
            )
        defaults = {
            401: ("UNAUTHORIZED", "Authentication is required."),
            403: ("FORBIDDEN", "The request is not permitted."),
            404: ("NOT_FOUND", "The requested resource was not found."),
            405: ("METHOD_NOT_ALLOWED", "The request method is not supported for this resource."),
        }
        code, message = defaults.get(exc.status_code, ("HTTP_ERROR", "The request could not be completed."))
        return _error_response(
            request, status_code=exc.status_code, code=code, message=message,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError):
        issues = [
            {
                "location": [str(part) for part in item.get("loc", ())],
                "message": str(item.get("msg", "Invalid value.")),
                "type": str(item.get("type", "value_error")),
            }
            for item in exc.errors()
        ]
        return _error_response(
            request,
            status_code=422,
            code="VALIDATION_ERROR",
            message="Request validation failed.",
            details={"issues": issues},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception):
        logger.exception("Unhandled request failure request_id=%s", _request_id(request), exc_info=exc)
        return _error_response(
            request,
            status_code=500,
            code="INTERNAL_ERROR",
            message="An internal error occurred.",
        )

    # NOTE: DuckDB serialization lives in routes.locked_db (threadpool lock),
    # not middleware — async middleware deadlocks on the event loop.
    app.include_router(router)
    if os.environ.get("EMBERLENS_SERVE_FRONTEND", "").lower() == "true":
        frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
        if not frontend_dist.is_dir():
            raise RuntimeError(f"Frontend build output is missing: {frontend_dist}")
        app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
    return app


app = create_app()
