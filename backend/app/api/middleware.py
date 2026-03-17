import logging
import time
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("app.middleware")


class AuditMiddleware(BaseHTTPMiddleware):
    """
    Middleware for auditing HTTP requests.
    Adds correlation ID and logs request lifecycle.
    """

    async def dispatch(self, request: Request, call_next):
        correlation_id = str(uuid.uuid4())
        start_time = time.time()

        request.state.correlation_id = correlation_id

        logger.info(
            f"[START] {request.method} {request.url.path} | correlation_id={correlation_id}"
        )

        response = await call_next(request)

        process_time = round((time.time() - start_time) * 1000, 2)

        logger.info(
            f"[END] {request.method} {request.url.path} | "
            f"status={response.status_code} | "
            f"time_ms={process_time} | "
            f"correlation_id={correlation_id}"
        )

        response.headers["X-Correlation-ID"] = correlation_id

        return response
