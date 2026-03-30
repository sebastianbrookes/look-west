#!/usr/bin/env python3
"""Helpers for safely rendering the HTML email template."""

import os
import re
from html import escape
from pathlib import Path

BACKGROUND_IMAGE_URL = os.getenv(
    "EMAIL_BACKGROUND_URL",
    "https://look-west.vercel.app/background.webp",
)
_TEMPLATE_PATH = Path(__file__).with_name("email_template.html")
_EMAIL_TEMPLATE: str | None = None


def _load_email_template() -> str:
    """Load and cache the HTML email template from disk."""
    global _EMAIL_TEMPLATE
    if _EMAIL_TEMPLATE is None:
        _EMAIL_TEMPLATE = _TEMPLATE_PATH.read_text(encoding="utf-8")
    return _EMAIL_TEMPLATE


def _split_message_parts(message: str) -> tuple[str, str, str]:
    """Split message into (quote_text, attribution, metadata) on '---' separator.

    Attribution is identified as lines starting with an em dash (\u2014).
    """
    quote_block = message
    metadata = ""

    parts = re.split(r"\n[ \t]*---[ \t]*\n", message, maxsplit=1)
    if len(parts) == 2:
        quote_block, metadata = parts[0].strip(), parts[1].strip()
    else:
        parts = re.split(r"\n[ \t]*---[ \t]*$", message, maxsplit=1)
        if len(parts) == 2:
            quote_block, metadata = parts[0].strip(), parts[1].strip()

    lines = quote_block.split("\n")
    attr_index = next(
        (i for i, l in enumerate(lines) if l.lstrip().startswith("\u2014")), -1
    )
    if attr_index >= 0:
        quote_text = "\n".join(lines[:attr_index]).strip()
        attribution = "\n".join(lines[attr_index:]).strip()
    else:
        quote_text = quote_block
        attribution = ""

    return quote_text, attribution, metadata


def render_email_html(
    message: str,
    location: str,
    sunset_time: str,
    unsubscribe_url: str = "",
    change_location_url: str = "",
    quality_score: int | str = "",
) -> str:
    """Render the HTML email while escaping untrusted text content."""
    quote_text, attribution, metadata = _split_message_parts(message)
    html = _load_email_template()
    replacements = {
        "{{quote_text}}": escape(quote_text).replace("\n", "<br>"),
        "{{attribution}}": escape(attribution),
        "{{metadata}}": escape(metadata).replace("\n", "<br>"),
        "{{location}}": escape(location),
        "{{sunset_time}}": escape(sunset_time),
        "{{quality_score}}": (
            escape(str(int(quality_score))) if quality_score != "" else ""
        ),
        "{{unsubscribe_url}}": escape(unsubscribe_url or "#", quote=True),
        "{{change_location_url}}": escape(change_location_url or "#", quote=True),
        "{{background_url}}": BACKGROUND_IMAGE_URL,
    }
    for placeholder, value in replacements.items():
        html = html.replace(placeholder, value)
    return html
