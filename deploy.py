#!/usr/bin/env python3
"""NickOnline deploy — one idempotent command.

    python3 deploy.py             # test, build, rsync, (nginx), verify, push
    python3 deploy.py --no-build  # ship the existing dist/ as-is
    python3 deploy.py --no-push   # skip the git commit and push

Each step is safe to re-run. The app is a static bundle with no backend, so
there is no port to claim, no systemd unit and no .env on the VPS — nginx serves
dist/ directly with an alias in a shared catch-all vhost, reusing its TLS cert.

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
REPO = Path(__file__).resolve().parent
DIST = REPO / "dist"

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


def build() -> None:
    """Parity with the workbook is the whole product, so never ship a red suite."""
    log("Running the parity test suite")
    if subprocess.run(["npm", "test"], cwd=REPO).returncode != 0:
        fail("Tests failed — refusing to deploy.")
    log("Building")
    if subprocess.run(["npm", "run", "build"], cwd=REPO).returncode != 0:
        fail("Build failed")


def ensure_dirs() -> None:
    ssh(f"mkdir -p {PROJECT_DIR}/dist")


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
    # nginx runs as www-data and needs to traverse into the home directory.
    ssh(f"chmod o+x /home/{USER} && chmod -R o+rX {PROJECT_DIR}")


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
    site = find_nginx_site()
    marker = f"location {BASE_PATH}/ {{"
    has = ssh(
        f"grep -qF '{marker}' {site} && echo yes || echo no", capture=True
    ).stdout.strip()
    if has == "yes":
        log(f"nginx {BASE_PATH} block already present in {site}")
        return
    log(f"Adding nginx {BASE_PATH} location to {site}")
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
block = {NGINX_BLOCK!r}
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


def verify() -> None:
    """Never fails the deploy — a bad response is a warning to go and look."""
    log(f"Verifying {APP_URL}")
    code = ssh(
        f"curl -s -o /dev/null -w '%{{http_code}}' {APP_URL}", capture=True, check=False
    ).stdout.strip()
    if code.startswith(("2", "3")):
        log(f"OK ({code})")
        return

    # Distinguish "the app is broken" from "this host's TLS cert is expired",
    # which is a shared-vhost problem affecting every app on the box.
    insecure = ssh(
        f"curl -sk -o /dev/null -w '%{{http_code}}' {APP_URL}", capture=True, check=False
    ).stdout.strip()
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
    if "--no-build" not in sys.argv:
        build()
    ensure_dirs()
    rsync_dist()
    ensure_nginx()
    verify()
    if "--no-push" not in sys.argv:
        git_push()
    log(f"Done — {APP_URL}")


if __name__ == "__main__":
    main()
