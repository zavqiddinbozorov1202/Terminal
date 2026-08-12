#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TraderPro — bitta HTML faylni bo'lish (split) va siqish (gzip) skripti.

Ishlatish:
    python3 build_split.py                 # ../index.html -> ./dist/
    python3 build_split.py index.html out  # boshqa manba/chiqish papkasi

Nima qiladi:
  1. Ichki <style> bloklarini  dist/assets/style-N.css  ga chiqaradi
  2. Ichki klassik <script> bloklarini dist/assets/app-N.js ga chiqaradi
  3. HTML ichida ularning o'rniga <link> / <script src> qo'yadi (tartib saqlanadi)
  4. Har bir faylning .gz nusxasini yaratadi (server uchun)
  5. esbuild yoki terser topilsa — JS/CSS ni minify qiladi

MUHIM:
  - type="module" skriptlari (Firebase) JOYIDA qoldiriladi, chunki modul fayllari
    file:// orqali ochilganda CORS sababli ishlamaydi.
  - Natija HTTPS/HTTP server orqali ochilishi kerak (Netlify, Vercel, GitHub Pages,
    Firebase Hosting yoki `python3 -m http.server`).
  - Bitta fayl varianti (index.html) baribir saqlanib qoladi — uni o'chirmang.
"""

import gzip
import os
import re
import shutil
import subprocess
import sys

SCRIPT_RE = re.compile(r"<script\b([^>]*)>(.*?)</script\s*>", re.S | re.I)
STYLE_RE = re.compile(r"<style\b([^>]*)>(.*?)</style\s*>", re.S | re.I)


def has_attr(attrs, name):
    return re.search(r"\b" + name + r"\s*=", attrs, re.I) is not None


def attr_val(attrs, name):
    m = re.search(r"\b" + name + r'\s*=\s*["\']([^"\']*)["\']', attrs, re.I)
    return m.group(1) if m else ""


def which(cmd):
    return shutil.which(cmd)


def minify(path, kind):
    """esbuild yoki terser bo'lsa minify qiladi. Bo'lmasa — tegmaydi."""
    if which("esbuild"):
        try:
            out = subprocess.run(
                ["esbuild", path, "--minify", "--charset=utf8"],
                capture_output=True, timeout=180,
            )
            if out.returncode == 0 and out.stdout:
                with open(path, "wb") as f:
                    f.write(out.stdout)
                return "esbuild"
        except Exception:
            pass
    if kind == "js" and which("terser"):
        try:
            out = subprocess.run(
                ["terser", path, "-c", "-m"], capture_output=True, timeout=300
            )
            if out.returncode == 0 and out.stdout:
                with open(path, "wb") as f:
                    f.write(out.stdout)
                return "terser"
        except Exception:
            pass
    return ""


def gz(path):
    with open(path, "rb") as f:
        raw = f.read()
    with gzip.open(path + ".gz", "wb", compresslevel=9) as f:
        f.write(raw)
    return len(raw), os.path.getsize(path + ".gz")


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__) or ".", "..", "index.html")
    outdir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__) or ".", "dist")
    assets = os.path.join(outdir, "assets")

    if not os.path.exists(src):
        print("XATO: manba topilmadi:", src)
        return 1

    os.makedirs(assets, exist_ok=True)
    with open(src, "r", encoding="utf-8") as f:
        html = f.read()

    orig_bytes = len(html.encode("utf-8"))
    counters = {"js": 0, "css": 0, "skipped_module": 0, "skipped_src": 0}
    written = []

    def css_repl(m):
        attrs, body = m.group(1), m.group(2)
        if len(body.strip()) < 400:
            return m.group(0)
        counters["css"] += 1
        name = "style-%02d.css" % counters["css"]
        p = os.path.join(assets, name)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(body)
        written.append((p, "css"))
        sid = attr_val(attrs, "id")
        idpart = ' data-from-id="%s"' % sid if sid else ""
        return '<link rel="stylesheet" href="assets/%s"%s>' % (name, idpart)

    def js_repl(m):
        attrs, body = m.group(1), m.group(2)
        if has_attr(attrs, "src"):
            counters["skipped_src"] += 1
            return m.group(0)
        t = attr_val(attrs, "type").lower()
        if t and t not in ("text/javascript", "application/javascript"):
            # module / importmap / application-ld+json — tegmaymiz
            counters["skipped_module"] += 1
            return m.group(0)
        if len(body.strip()) < 400:
            return m.group(0)
        counters["js"] += 1
        name = "app-%02d.js" % counters["js"]
        p = os.path.join(assets, name)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(body)
        written.append((p, "js"))
        return '<script src="assets/%s"></script>' % name

    html = STYLE_RE.sub(css_repl, html)
    html = SCRIPT_RE.sub(js_repl, html)

    index_out = os.path.join(outdir, "index.html")
    with open(index_out, "w", encoding="utf-8") as f:
        f.write(html)
    written.append((index_out, "html"))

    # PWA fayllarini yonига ko'chiramiz (bor bo'lsa)
    here = os.path.dirname(os.path.abspath(__file__))
    for extra in ("sw.js", "manifest.webmanifest", "icon.svg"):
        p = os.path.join(here, extra)
        if os.path.exists(p):
            shutil.copy2(p, os.path.join(outdir, extra))

    print("manba:      %s (%s bayt)" % (src, format(orig_bytes, ",")))
    print("chiqish:    %s" % outdir)
    print("ajratildi:  %d ta JS, %d ta CSS" % (counters["js"], counters["css"]))
    print("tegilmadi:  %d ta modul skript, %d ta tashqi skript" % (counters["skipped_module"], counters["skipped_src"]))
    print("-" * 62)

    total_raw = 0
    total_gz = 0
    for p, kind in written:
        tool = minify(p, kind) if kind in ("js", "css") else ""
        raw, gzs = gz(p)
        total_raw += raw
        total_gz += gzs
        print("%-26s %10s B  gz %9s B  %s" % (os.path.basename(p), format(raw, ","), format(gzs, ","), tool))

    print("-" * 62)
    print("JAMI:  %s B   gz: %s B  (%.1f%% tejaldi)" % (
        format(total_raw, ","), format(total_gz, ","),
        (1 - total_gz / float(total_raw or 1)) * 100.0))
    print("")
    print("Eslatma: dist/ ni HTTP(S) server orqali oching. Bitta faylli index.html ham ishlayveradi.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
