import os
import sys

# Allow running ingestion scripts from the project root.
# The backend code uses bare `app.*` imports (designed for Docker where
# backend/ is the working directory), so we add it to sys.path here.
_backend_path = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, os.path.abspath(_backend_path))
