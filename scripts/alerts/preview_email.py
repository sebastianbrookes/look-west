#!/usr/bin/env python3
"""Render email_template.html with sample data and open in browser for preview."""

import subprocess
import sys
import tempfile
from pathlib import Path

import email_renderer

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
email_renderer.BACKGROUND_IMAGE_URL = (
    (PROJECT_ROOT / "public" / "background.webp").resolve().as_uri()
)

html = email_renderer.render_email_html(
    location="Charleston, SC",
    sunset_time="7:42 PM",
    message=(
        "Sky's looking real good tonight — scattered clouds "
        "should catch some nice color right around sunset. "
        "Might be worth stepping outside around 7:15 if you can."
    ),
    unsubscribe_url="#",
    change_location_url="#",
)

out = Path(tempfile.mktemp(suffix=".html"))
out.write_text(html)
print(f"Preview written to {out}")
subprocess.run(
    ["open", str(out)] if sys.platform == "darwin" else ["xdg-open", str(out)]
)
