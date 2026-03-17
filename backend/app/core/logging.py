import logging
import sys


def setup_logging() -> None:
    """
    Configure structured logging for the application.
    Enterprise-ready basic logging setup.
    """

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
    )

    # Reduce noise from external libraries if necessary
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
