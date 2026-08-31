"""gunicorn entry point: `gunicorn wsgi:app` from server/."""

from app import app  # noqa: F401
