#!/usr/bin/env python3
"""Helpers for safely rendering the HTML email template."""

import os
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


def render_email_html(
    message: str,
    location: str,
    sunset_time: str,
    unsubscribe_url: str = "",
) -> str:
    """Render the HTML email while escaping untrusted text content."""
    html = _load_email_template()
    replacements = {
        "{{message}}": escape(message),
        "{{location}}": escape(location),
        "{{sunset_time}}": escape(sunset_time),
        "{{unsubscribe_url}}": escape(unsubscribe_url or "#", quote=True),
        "{{background_url}}": BACKGROUND_IMAGE_URL,
    }
    for placeholder, value in replacements.items():
        html = html.replace(placeholder, value)
    return html
