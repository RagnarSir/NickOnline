#!/usr/bin/env python3
"""Strip personal identifiers from Simulator_v5_1.xlsx.

The workbook is committed as the source of truth, so its file metadata is
published too. Excel records the author's real name and the absolute path of the
folder it was last saved in — neither of which belongs in a public repo, and the
name is meant to read as "nickarana" everywhere.

Only metadata is touched. Every sheet, formula and lookup table is copied
through byte-for-byte, and the parity suite is the proof:

    python3 tools/scrub_workbook.py            # rewrite in place (makes a .bak)
    python3 tools/scrub_workbook.py --check    # report only, change nothing
"""

import os
import re
import shutil
import sys
import zipfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(REPO, "Simulator_v5_1.xlsx")
HANDLE = "nickarana"


def findings(z):
    """What is currently identifying in the archive."""
    out = []
    core = z.read("docProps/core.xml").decode("utf8")
    for tag in ("dc:creator", "cp:lastModifiedBy"):
        m = re.search(rf"<{tag}>([^<]*)</{tag}>", core)
        if m and m.group(1) and m.group(1) != HANDLE:
            out.append((tag, m.group(1)))
    wb = z.read("xl/workbook.xml").decode("utf8")
    m = re.search(r'absPath url="([^"]*)"', wb)
    if m:
        out.append(("absPath", m.group(1)))
    return out


def scrub_core(xml: str) -> str:
    for tag in ("dc:creator", "cp:lastModifiedBy"):
        xml = re.sub(rf"<{tag}>[^<]*</{tag}>", f"<{tag}>{HANDLE}</{tag}>", xml)
    return xml


def scrub_workbook(xml: str) -> str:
    # The whole AlternateContent block exists only to carry absPath; Excel
    # regenerates it on the next save.
    return re.sub(
        r"<mc:AlternateContent\b.*?</mc:AlternateContent>", "", xml, flags=re.S
    )


def main():
    check = "--check" in sys.argv

    with zipfile.ZipFile(XLSX) as z:
        found = findings(z)

    if not found:
        print("workbook is already clean")
        return
    for what, value in found:
        print(f"  {what:16} {value}")
    if check:
        print("\n--check: nothing written")
        sys.exit(1)

    bak = XLSX + ".bak"
    shutil.copy2(XLSX, bak)

    tmp = XLSX + ".tmp"
    with zipfile.ZipFile(XLSX) as src, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as dst:
        for item in src.infolist():
            data = src.read(item.filename)
            if item.filename == "docProps/core.xml":
                data = scrub_core(data.decode("utf8")).encode("utf8")
            elif item.filename == "xl/workbook.xml":
                data = scrub_workbook(data.decode("utf8")).encode("utf8")
            # Preserve the original entry metadata so the diff stays minimal.
            dst.writestr(item, data)

    os.replace(tmp, XLSX)

    with zipfile.ZipFile(XLSX) as z:
        left = findings(z)
    if left:
        shutil.copy2(bak, XLSX)
        print("\nscrub incomplete, restored the backup:", left)
        sys.exit(1)

    print(f"\nscrubbed. backup at {os.path.basename(bak)}")
    print("now run:  npm run tables && npm test")


if __name__ == "__main__":
    main()
