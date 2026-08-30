"""Minimal .xlsx reader built on the stdlib only (no openpyxl on this machine).

Reads cached cell values and formulas straight out of the sheet XML. Enough for
extracting the Simulator workbook's lookup tables and golden fixture.
"""

import re
import zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

SHEETS = {
    "simulator": "xl/worksheets/sheet1.xml",
    "lkup_simul": "xl/worksheets/sheet2.xml",
    "conv_Kstars": "xl/worksheets/sheet3.xml",
    "hts_calculator": "xl/worksheets/sheet4.xml",
    "version_notes": "xl/worksheets/sheet5.xml",
    "dfk_pk": "xl/worksheets/sheet6.xml",
}


def col_to_num(letters):
    """'A' -> 1, 'Z' -> 26, 'AA' -> 27."""
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def num_to_col(n):
    """1 -> 'A', 27 -> 'AA'."""
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def split_ref(ref):
    m = re.match(r"([A-Z]+)(\d+)", ref)
    return col_to_num(m.group(1)), int(m.group(2))


REF_RE = re.compile(r"(\$?)([A-Z]{1,3})(\$?)(\d{1,7})")


def translate(formula, dcol, drow):
    """Shift the relative parts of every A1 reference in a formula."""

    def repl(m):
        cdollar, letters, rdollar, digits = m.groups()
        col = col_to_num(letters)
        row = int(digits)
        if not cdollar:
            col += dcol
        if not rdollar:
            row += drow
        if col < 1 or row < 1:
            return "#REF!"
        return "%s%s%s%d" % (cdollar, num_to_col(col), rdollar, row)

    # Don't rewrite inside quoted strings.
    out, i = [], 0
    for part in re.split(r'("[^"]*")', formula):
        out.append(part if part.startswith('"') else REF_RE.sub(repl, part))
    return "".join(out)


class Workbook:
    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        self.shared = []
        try:
            root = ET.fromstring(self.z.read("xl/sharedStrings.xml"))
            for si in root:
                self.shared.append("".join(t.text or "" for t in si.iter(NS + "t")))
        except KeyError:
            pass
        self._cache = {}

    def sheet(self, name):
        """{(col, row): {'v': value, 'f': formula or None}} for a sheet."""
        if name in self._cache:
            return self._cache[name]
        root = ET.fromstring(self.z.read(SHEETS[name]))
        cells = {}
        shared = {}  # si -> (formula text, anchor col, anchor row)
        for c in root.iter(NS + "c"):
            fnode = c.find(NS + "f")
            if fnode is not None and fnode.get("t") == "shared" and fnode.text:
                ci, ri = split_ref(c.get("r"))
                shared[fnode.get("si")] = (fnode.text, ci, ri)
        for c in root.iter(NS + "c"):
            ci, ri = split_ref(c.get("r"))
            t = c.get("t")
            vnode = c.find(NS + "v")
            fnode = c.find(NS + "f")
            val = None
            if t == "s" and vnode is not None:
                val = self.shared[int(vnode.text)]
            elif t == "inlineStr":
                isn = c.find(NS + "is")
                val = "".join(x.text or "" for x in isn.iter(NS + "t")) if isn is not None else None
            elif t == "e":
                val = ("#ERR", vnode.text if vnode is not None else None)
            elif t == "str":
                val = vnode.text if vnode is not None else None
            elif vnode is not None:
                try:
                    val = float(vnode.text)
                except (TypeError, ValueError):
                    val = vnode.text
            if val is None and fnode is None:
                continue
            formula = None
            if fnode is not None:
                if fnode.text:
                    formula = fnode.text
                elif fnode.get("t") == "shared" and fnode.get("si") in shared:
                    text, ac, ar = shared[fnode.get("si")]
                    formula = translate(text, ci - ac, ri - ar)
            cells[(ci, ri)] = {"v": val, "f": formula}
        self._cache[name] = cells
        return cells

    def val(self, name, ref):
        """Value at e.g. wb.val('simulator', 'P2')."""
        ci, ri = split_ref(ref)
        cell = self.sheet(name).get((ci, ri))
        return cell["v"] if cell else None

    def column(self, name, letter, r0, r1):
        """List of values down one column, inclusive row range (None for blanks)."""
        ci = col_to_num(letter)
        cells = self.sheet(name)
        out = []
        for r in range(r0, r1 + 1):
            cell = cells.get((ci, r))
            out.append(cell["v"] if cell else None)
        return out

    def block(self, name, c0, c1, r0, r1):
        """2-D list of values over a rectangular range, given column letters."""
        a, b = col_to_num(c0), col_to_num(c1)
        cells = self.sheet(name)
        rows = []
        for r in range(r0, r1 + 1):
            row = []
            for c in range(a, b + 1):
                cell = cells.get((c, r))
                row.append(cell["v"] if cell else None)
            rows.append(row)
        return rows
