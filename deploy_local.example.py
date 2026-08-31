"""Where this app deploys to. Copy to deploy_local.py and fill in.

deploy_local.py is gitignored: the repo is public, the addresses are not.
Nothing secret belongs here either — no keys, no passwords — only which host to
reach and which key file to reach it with.
"""

# The box, and the account on it.
HOST = "your-server.example.net"
USER = "ubuntu"
PROJECT_DIR = "/home/ubuntu/nickonline"

# The public name the app is served under (usually the same as HOST).
DOMAIN = "your-server.example.net"

# A line that already exists in the enabled nginx vhost you want to extend.
# The deploy splices its own location blocks in just before every occurrence,
# so this identifies which vhost to edit. Include the trailing brace.
NGINX_ANCHOR = "location /SomeOtherApp/ {"

# Key files to look for in ~/.ssh, first match wins.
SSH_KEYS = ("nickonline_vps",)

# Note: the deploy needs passwordless sudo on the box for `nginx -t`,
# `systemctl reload nginx` and `systemctl restart nickonline-api`. The accounts
# API runs as a systemd service on 127.0.0.1:8008 (see API_PORT in deploy.py);
# its database and session secret live in PROJECT_DIR/data, which the deploy
# creates mode 700 and never rsyncs over.
