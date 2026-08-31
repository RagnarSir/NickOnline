#!/usr/bin/env python3
"""NickOnline deploy — one idempotent command.

    python3 deploy.py             # test, build, rsync, venv, systemd, nginx, verify, push
    python3 deploy.py --no-build  # ship the existing dist/ as-is (still runs the tests)
    python3 deploy.py --no-test   # skip the suites — say so deliberately
    python3 deploy.py --no-push   # skip the git commit and push
    python3 deploy.py --logs      # tail the API service log and exit

Each step is safe to re-run. Two things ship: the static bundle, which nginx
serves from dist/ with an alias, and the accounts API, which runs as a systemd
service on 127.0.0.1:API_PORT with nginx proxying BASE_PATH/api/ to it. Both go
into a shared catch-all vhost, reusing its TLS cert.

The SQLite database and the session secret live in PROJECT_DIR/data, a *sibling*
of the two rsync targets rather than a child of either — so `rsync --delete` is
structurally incapable of reaching them, with no --filter rule to remember.

Which server, and where in its nginx config, lives in `deploy_local.py`, which is
untracked — this file is public, and the addresses are not. Copy
`deploy_local.example.py` to `deploy_local.py` and fill it in.
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

BASE_PATH = "/NickOnline"      # served at https://DOMAIN/NickOnline/
# Next free port in the fleet registry (~/.claude/skills/deploy-vps/conventions.md).
# Not a secret — it is a loopback port and the registry is shared — so it stays
# here rather than in deploy_local.py, which vite.config.ts could not import.
API_PORT = 8008
SERVICE = "nickonline-api"
REPO = Path(__file__).resolve().parent
DIST = REPO / "dist"
SERVER = REPO / "server"

try:
    from deploy_local import HOST, USER, PROJECT_DIR, DOMAIN, NGINX_ANCHOR, SSH_KEYS
except ImportError:
    print(
        "\033[1;31mxx\033[0m No deploy_local.py — copy deploy_local.example.py to\n"
        "   deploy_local.py and fill in the host you deploy to. It is gitignored\n"
        "   on purpose: this repo is public and the addresses are not."
    )
    raise SystemExit(1)

APP_URL = f"https://{DOMAIN}{BASE_PATH}/"
API_URL = f"{APP_URL}api"
REMOTE_SERVER = f"{PROJECT_DIR}/server"
REMOTE_DATA = f"{PROJECT_DIR}/data"


def log(m: str) -> None:
    print(f"\033[1;32m==>\033[0m {m}")


def warn(m: str) -> None:
    print(f"\033[1;33m!!\033[0m {m}")


def fail(m: str) -> None:
    print(f"\033[1;31mxx\033[0m {m}")
    sys.exit(1)


def pick_key() -> Path:
    for name in SSH_KEYS:
        p = Path.home() / ".ssh" / name
        if p.exists():
            return p
    fail(f"No SSH key found (looked for {', '.join(SSH_KEYS)} in ~/.ssh).")
    raise SystemExit


SSH_KEY = pick_key()
SSH = [
    "ssh",
    "-i", str(SSH_KEY),
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
]


def ssh(cmd: str, *, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess[str]:
    r = subprocess.run([*SSH, f"{USER}@{HOST}", cmd], text=True, capture_output=capture)
    if check and r.returncode != 0:
        if capture:
            print(r.stdout, r.stderr)
        fail(f"remote command failed: {cmd}")
    return r


def test() -> None:
    """Two things must never regress: parity with the workbook, which is the whole
    product, and isolation between groups, which is the whole point of accounts.

    This runs even with --no-build. Shipping an untested bundle is a decision, so
    skipping it takes --no-test rather than falling out of another flag.
    """
    venv_py = SERVER / "venv" / "bin" / "python"
    py = str(venv_py) if venv_py.exists() else sys.executable
    log("Running the API test suite (auth, groups, isolation)")
    if subprocess.run([py, "-m", "pytest", "-q", "server/tests"], cwd=REPO).returncode != 0:
        fail("API tests failed — refusing to deploy.")
    log("Running the parity test suite")
    if subprocess.run(["npm", "test"], cwd=REPO).returncode != 0:
        fail("Tests failed — refusing to deploy.")


def build() -> None:
    log("Building")
    if subprocess.run(["npm", "run", "build"], cwd=REPO).returncode != 0:
        fail("Build failed")


def ensure_dirs() -> None:
    # data/ is a sibling of dist/ and server/, never inside either.
    ssh(f"mkdir -p {PROJECT_DIR}/dist {REMOTE_SERVER} {REMOTE_DATA} && chmod 700 {REMOTE_DATA}")


def rsync_dist() -> None:
    if not (DIST / "index.html").exists():
        fail("dist/index.html missing — run without --no-build.")
    log("Syncing dist/ to VPS")
    cmd = [
        "rsync", "-az", "--delete",
        "-e", " ".join(SSH),
        f"{DIST}/",
        f"{USER}@{HOST}:{PROJECT_DIR}/dist/",
    ]
    if subprocess.run(cmd).returncode != 0:
        fail("rsync failed")
    # nginx runs as www-data and needs to traverse into the home directory. Only
    # dist/ is made world-readable: a recursive chmod over PROJECT_DIR would
    # publish data/ — the SQLite database, every password hash, and the session
    # secret — to every other app and user on this shared box.
    ssh(f"chmod o+x /home/{USER} && chmod o+x {PROJECT_DIR} && chmod -R o+rX {PROJECT_DIR}/dist")


def rsync_server() -> None:
    """--delete is safe here: data/ is a sibling of server/, not a child."""
    log("Syncing server/ to VPS")
    cmd = [
        "rsync", "-az", "--delete",
        "-e", " ".join(SSH),
        "--exclude", "venv", "--exclude", "__pycache__", "--exclude", "*.pyc",
        "--exclude", ".devdata", "--exclude", "tests",
        f"{SERVER}/",
        f"{USER}@{HOST}:{REMOTE_SERVER}/",
    ]
    if subprocess.run(cmd).returncode != 0:
        fail("rsync of server/ failed")


def venv_and_deps() -> None:
    log("Installing API dependencies")
    ssh(f"test -d {REMOTE_SERVER}/venv || python3 -m venv {REMOTE_SERVER}/venv")
    ssh(f"{REMOTE_SERVER}/venv/bin/pip install --quiet --upgrade pip")
    ssh(f"{REMOTE_SERVER}/venv/bin/pip install --quiet -r {REMOTE_SERVER}/requirements.txt")


def init_db() -> None:
    """Create the schema before the service starts, so two gunicorn workers never
    race each other on CREATE TABLE."""
    log("Preparing the database")
    ssh(
        f"cd {REMOTE_SERVER} && NICKONLINE_DATA_DIR={REMOTE_DATA} "
        f"{REMOTE_SERVER}/venv/bin/python -m cli initdb"
    )


def admin_hint() -> None:
    """Never auto-promote. Sign-up is open, so a self-disabling "first user becomes
    admin" page would hand the instance to whoever found the URL first."""
    out = ssh(
        f"cd {REMOTE_SERVER} && NICKONLINE_DATA_DIR={REMOTE_DATA} "
        f"{REMOTE_SERVER}/venv/bin/python -m cli users",
        capture=True, check=False,
    ).stdout
    if " admin " in out:
        return
    warn(
        "No admin account yet. Sign up in the app, then run:\n"
        f'   ssh {USER}@{HOST} "cd {REMOTE_SERVER} && NICKONLINE_DATA_DIR={REMOTE_DATA} \\\n'
        f'      {REMOTE_SERVER}/venv/bin/python -m cli promote <username>"'
    )


SYSTEMD_UNIT = f"""[Unit]
Description=NickOnline accounts API
After=network.target

[Service]
Type=simple
User={USER}
Group={USER}
WorkingDirectory={REMOTE_SERVER}
Environment=PYTHONUNBUFFERED=1
Environment=NICKONLINE_DATA_DIR={REMOTE_DATA}
Environment=NICKONLINE_BASE_PATH={BASE_PATH}
Environment=NICKONLINE_COOKIE_SECURE=1
ExecStart={REMOTE_SERVER}/venv/bin/gunicorn \\
    --bind 127.0.0.1:{API_PORT} \\
    --workers 2 --threads 4 --timeout 30 --graceful-timeout 10 \\
    --access-logfile - --error-logfile - \\
    wsgi:app
Restart=always
RestartSec=3

# The only writable path is the data directory. A compromised API process must
# not be able to touch dist/, which nginx serves to everyone.
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths={REMOTE_DATA}
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes

[Install]
WantedBy=multi-user.target
"""


def install_systemd() -> None:
    log(f"Installing and restarting {SERVICE}")
    ssh(f"cat > /tmp/{SERVICE}.service <<'UNITEOF'\n{SYSTEMD_UNIT}UNITEOF")
    ssh(
        f"sudo cp /tmp/{SERVICE}.service /etc/systemd/system/{SERVICE}.service "
        f"&& rm /tmp/{SERVICE}.service && sudo systemctl daemon-reload "
        f"&& sudo systemctl enable --now {SERVICE} && sudo systemctl restart {SERVICE}"
    )
    time.sleep(2)
    state = ssh(f"systemctl is-active {SERVICE}", capture=True, check=False).stdout.strip()
    if state != "active":
        print(ssh(f"journalctl -u {SERVICE} -n 30 --no-pager", capture=True, check=False).stdout)
        fail(f"{SERVICE} is {state or 'not running'} — see the log above.")


def logs() -> None:
    print(ssh(f"journalctl -u {SERVICE} -n 80 --no-pager", capture=True, check=False).stdout)


# Content-hashed assets are immutable; index.html must never be cached or the
# app pins itself to an old bundle. The longest matching prefix wins, so the
# assets block takes precedence regardless of order.
NGINX_BLOCK = f"""    location {BASE_PATH}/assets/ {{
        alias {PROJECT_DIR}/dist/assets/;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }}

    location {BASE_PATH}/ {{
        alias {PROJECT_DIR}/dist/;
        try_files $uri $uri/ {BASE_PATH}/index.html;
        add_header Cache-Control "no-cache";
    }}

"""


NGINX_API_BLOCK = f"""    location {BASE_PATH}/api/ {{
        proxy_pass http://127.0.0.1:{API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        # Appends the peer nginx actually saw. The API trusts the RIGHTMOST entry,
        # which is the one hop a client cannot forge.
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        client_max_body_size 1m;
    }}

"""


def find_nginx_site() -> str:
    """The enabled vhost carrying NGINX_ANCHOR — i.e. the shared catch-all."""
    out = ssh(
        f"grep -rlF '{NGINX_ANCHOR}' /etc/nginx/sites-enabled/ 2>/dev/null | head -1",
        capture=True,
    ).stdout.strip()
    if not out:
        fail(f"Couldn't find an nginx site containing '{NGINX_ANCHOR}'.")
    return out


def ensure_nginx() -> None:
    """Each location gets its OWN guard.

    A single guard on `location /NickOnline/ {` was already satisfied by the
    static block on any box deployed before the API existed — so the API block
    would never be inserted, and the deploy would report success while every API
    call 404'd. Order between them does not matter: nginx matches the longest
    prefix, so /NickOnline/api/ always beats /NickOnline/.
    """
    site = find_nginx_site()
    ensure_block(site, f"location {BASE_PATH}/ {{", NGINX_BLOCK, "static")
    ensure_block(site, f"location {BASE_PATH}/api/ {{", NGINX_API_BLOCK, "API")


def ensure_block(site: str, marker: str, block: str, what: str) -> None:
    has = ssh(
        f"grep -qF '{marker}' {site} && echo yes || echo no", capture=True
    ).stdout.strip()
    if has == "yes":
        log(f"nginx {what} block already present in {site}")
        return
    log(f"Adding nginx {what} location to {site}")
    # The catch-all vhost has two server blocks (:80 and :443), each carrying
    # the anchor line. Insert before EVERY exact anchor match (one per block) so
    # HTTPS is covered too. The anchor carries its trailing brace so it never
    # catches a longer path that starts the same way. Validate with `nginx -t`
    # (checking its own exit code) and roll back on failure. The backup lives
    # outside sites-enabled/ so nginx never tries to load it.
    remote = f"""sudo python3 - <<'PYEOF'
import shutil, time
path = "{site}"
src = open(path).read()
if {marker!r} in src:
    print("already present"); raise SystemExit
bak = "{PROJECT_DIR}.nginx.bak-" + time.strftime("%Y%m%d%H%M%S")
shutil.copy(path, bak)
print("BAK=" + bak)
block = {block!r}
anchor = {NGINX_ANCHOR!r}
out, i = [], 0
while True:
    j = src.find(anchor, i)
    if j == -1:
        out.append(src[i:]); break
    ls = src.rfind(chr(10), 0, j) + 1   # start of the anchor's line
    out.append(src[i:ls]); out.append(block); out.append(src[ls:j + len(anchor)])
    i = j + len(anchor)
result = "".join(out)
if {marker!r} not in result:
    raise SystemExit("anchor {NGINX_ANCHOR!r} not found — nothing inserted")
open(path, "w").write(result)
print("inserted %d block(s)" % result.count({marker!r}))
PYEOF
BAK=$(sudo ls -t {PROJECT_DIR}.nginx.bak-* | head -1)
if sudo nginx -t; then sudo systemctl reload nginx; else echo 'invalid config — rolling back'; sudo cp "$BAK" {site}; exit 1; fi"""
    ssh(remote)


def curl(url: str, *, insecure: bool = False) -> str:
    flags = "-sk" if insecure else "-s"
    return ssh(
        f"curl {flags} -o /dev/null -w '%{{http_code}}' {url}", capture=True, check=False
    ).stdout.strip()


def verify_api() -> None:
    """Prove the API is both reachable and guarded.

    An unauthenticated 200 from /library would mean the login gate is not in the
    request path at all — every group's saved work readable by anyone who knows
    the URL. That is the one outcome worth failing a finished deploy over.
    """
    log(f"Verifying {API_URL}/")
    health = curl(f"{API_URL}/health")
    if not health.startswith("2"):
        warn(f"API health check returned {health or 'no response'} — check: python3 deploy.py --logs")
        return
    log(f"API healthy ({health})")

    guard = curl(f"{API_URL}/library")
    if guard == "401":
        log("Login gate confirmed (401 on /library without a session)")
    elif guard.startswith("2"):
        fail(
            f"/library returned {guard} WITHOUT a session — the login gate is not "
            "protecting the library. Every group's saved work is exposed. "
            f"Stop the service now: ssh {USER}@{HOST} 'sudo systemctl stop {SERVICE}'"
        )
    else:
        warn(f"/library returned {guard}, expected 401 — check: python3 deploy.py --logs")


def verify() -> None:
    """Never fails the deploy — a bad response is a warning to go and look."""
    log(f"Verifying {APP_URL}")
    code = curl(APP_URL)
    if code.startswith(("2", "3")):
        log(f"OK ({code})")
        return

    # Distinguish "the app is broken" from "this host's TLS cert is expired",
    # which is a shared-vhost problem affecting every app on the box.
    insecure = curl(APP_URL, insecure=True)
    if insecure.startswith(("2", "3")):
        warn(
            f"App responds {insecure} but the TLS certificate is not valid "
            f"(cert check failed). Renew it with: sudo certbot renew"
        )
    else:
        warn(f"Got HTTP {code or 'no response'} from {APP_URL} — check nginx logs and permissions.")


def git_push() -> None:
    """Keep GitHub in step with what is live. Never fails the deploy."""
    if not (REPO / ".git").exists():
        return
    dirty = subprocess.run(
        ["git", "status", "--porcelain"], cwd=REPO, capture_output=True, text=True
    ).stdout.strip()
    if dirty:
        log("Committing the deployed state")
        subprocess.run(["git", "add", "-A"], cwd=REPO)
        msg = "Deploy " + time.strftime("%Y-%m-%d %H:%M")
        if subprocess.run(["git", "commit", "-m", msg], cwd=REPO).returncode != 0:
            warn("Nothing committed.")
    r = subprocess.run(["git", "push"], cwd=REPO, capture_output=True, text=True)
    if r.returncode == 0:
        log("Pushed to GitHub")
    else:
        warn("Could not push to GitHub — commit is local only.\n" + r.stderr.strip())


def main() -> None:
    if "--logs" in sys.argv:
        logs()
        return
    if "--no-test" not in sys.argv:
        test()
    if "--no-build" not in sys.argv:
        build()
    ensure_dirs()
    rsync_dist()
    rsync_server()
    venv_and_deps()
    init_db()
    install_systemd()
    ensure_nginx()
    verify()
    verify_api()
    admin_hint()
    if "--no-push" not in sys.argv:
        git_push()
    log(f"Done — {APP_URL}")


if __name__ == "__main__":
    main()
