"""Local dev server. Production runs gunicorn against wsgi:app instead."""

import os

from app import BASE_PATH, app
from db import init_db

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("NICKONLINE_API_PORT", 8008))
    print(f"NickOnline API on http://127.0.0.1:{port}{BASE_PATH}/api/health")
    app.run(host="127.0.0.1", port=port, debug=False)
