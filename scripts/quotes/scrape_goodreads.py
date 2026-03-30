#!/usr/bin/env python3
"""Scrape sunset-related quotes from Goodreads and store them in Convex."""

import logging
import os
import sys
import time

import requests
from bs4 import BeautifulSoup
from convex import ConvexClient
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("scrape_goodreads")

CONVEX_URL = os.getenv("CONVEX_URL")
CONVEX_ADMIN_KEY = os.getenv("CONVEX_ADMIN_KEY", "")

BASE_URL = "https://www.goodreads.com/quotes/tag/sunset"
MAX_QUOTE_LENGTH = 280
DELAY_BETWEEN_PAGES = 2  # seconds
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    )
}


def get_convex_client():
    """Connect to Convex, exit on failure."""
    if not CONVEX_URL:
        logger.error("CONVEX_URL not set")
        sys.exit(1)
    client = ConvexClient(CONVEX_URL)
    client.set_admin_auth(CONVEX_ADMIN_KEY)
    return client


def parse_quotes(html):
    """Extract quotes from a Goodreads page HTML string."""
    soup = BeautifulSoup(html, "html.parser")
    results = []

    for quote_div in soup.select(".quote"):
        quote_text_div = quote_div.select_one(".quoteText")
        if not quote_text_div:
            continue

        # Quote text is the direct text content before the <br> tag.
        # It's wrapped in unicode curly quotes which we strip.
        raw_parts = []
        for child in quote_text_div.children:
            if child.name == "br":
                break
            if isinstance(child, str):
                raw_parts.append(child)
        raw_text = " ".join(raw_parts).strip()
        # Strip surrounding curly quotes and dash prefix
        text = raw_text.strip('\u201c\u201d"')
        text = " ".join(text.split())  # normalize whitespace

        if not text:
            continue

        # Author: first span.authorOrTitle
        author_span = quote_text_div.select_one("span.authorOrTitle")
        author = author_span.get_text(strip=True).rstrip(",") if author_span else ""

        # Source/book: a.authorOrTitle inside a quote_book_link span
        source = None
        book_link = quote_text_div.select_one('[id^="quote_book_link"] a.authorOrTitle')
        if book_link:
            source = book_link.get_text(strip=True)

        results.append(
            {
                "text": text,
                "author": author,
                "source": source,
            }
        )

    # Check if there's a next page (last page has next_page element with no href)
    next_page = soup.select_one("a.next_page[href]")
    has_next = next_page is not None

    return results, has_next


def fetch_page(url, retries=3):
    """Fetch a URL with retry on timeout."""
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            return resp
        except requests.exceptions.ReadTimeout:
            if attempt < retries:
                wait = DELAY_BETWEEN_PAGES * attempt
                logger.warning(
                    f"  Timeout on attempt {attempt}, retrying in {wait}s..."
                )
                time.sleep(wait)
            else:
                raise


def scrape_all_pages():
    """Scrape all pages of sunset quotes from Goodreads."""
    all_quotes = []
    page = 1

    while True:
        url = f"{BASE_URL}?page={page}"
        logger.info(f"Fetching page {page}: {url}")

        resp = fetch_page(url)

        quotes, has_next = parse_quotes(resp.text)
        if not quotes:
            logger.info(f"No quotes found on page {page}, stopping.")
            break

        all_quotes.extend(quotes)
        logger.info(f"  Found {len(quotes)} quotes (total so far: {len(all_quotes)})")

        if not has_next:
            logger.info("Reached last page.")
            break

        page += 1
        time.sleep(DELAY_BETWEEN_PAGES)

    return all_quotes


def main():
    logger.info("Starting Goodreads sunset quotes scrape")

    # Scrape
    all_quotes = scrape_all_pages()
    logger.info(f"Scraped {len(all_quotes)} total quotes")

    # Filter by length
    filtered = [q for q in all_quotes if len(q["text"]) <= MAX_QUOTE_LENGTH]
    logger.info(
        f"After filtering (≤{MAX_QUOTE_LENGTH} chars): {len(filtered)} quotes "
        f"({len(all_quotes) - len(filtered)} removed)"
    )

    # Insert into Convex
    client = get_convex_client()
    inserted = 0
    skipped = 0

    for i, quote in enumerate(filtered):
        args = {"text": quote["text"], "author": quote["author"]}
        if quote["source"]:
            args["source"] = quote["source"]

        result = client.mutation("quotes:insertQuote", args)
        if result["inserted"]:
            inserted += 1
        else:
            skipped += 1

        if (i + 1) % 50 == 0:
            logger.info(f"  Progress: {i + 1}/{len(filtered)} processed")

    logger.info(
        f"Done. Inserted: {inserted}, Skipped (duplicates): {skipped}, "
        f"Total in filter: {len(filtered)}"
    )


if __name__ == "__main__":
    main()
