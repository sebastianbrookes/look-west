#!/usr/bin/env python3
"""Render email_template.html with sample data and open in browser for preview."""

import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
TEMPLATE = (SCRIPT_DIR / "email_template.html").read_text()
BACKGROUND = (PROJECT_ROOT / "public" / "background.webp").resolve().as_uri()

html = (
    TEMPLATE.replace("{{background_url}}", BACKGROUND)
    .replace("{{location}}", "Charleston, SC")
    .replace("{{sunset_time}}", "7:42 PM")
    .replace(
        "{{message}}",
        "Sky's looking real good tonight — scattered clouds "
        "should catch some nice color right around sunset. "
        "Might be worth stepping outside around 7:15 if you can.",
    )
    .replace("{{unsubscribe_url}}", "#")
)

out = Path(tempfile.mktemp(suffix=".html"))
out.write_text(html)
print(f"Preview written to {out}")
subprocess.run(["open", str(out)] if sys.platform == "darwin" else ["xdg-open", str(out)])
