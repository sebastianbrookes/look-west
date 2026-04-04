"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { splitMessageParts } from "./alertEmails";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function computeDigestWindow(timezone: string): {
  startTime: number;
  endTime: number;
  dateLabel: string;
} {
  const now = new Date();
  const endTime = now.getTime();

  // Get today's date in the admin's timezone as YYYY-MM-DD
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(now);

  // Parse to get midnight in that timezone
  // Create a date string at midnight in the target timezone, then convert to UTC ms
  const parts = todayStr.split("-");
  const midnightLocal = new Date(
    `${parts[0]}-${parts[1]}-${parts[2]}T00:00:00`
  );
  // Adjust for timezone offset: find what UTC time corresponds to midnight in the target tz
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const nowParts = formatter.formatToParts(now);
  const get = (type: string) =>
    nowParts.find((p) => p.type === type)?.value ?? "0";
  const localHours = Number(get("hour"));
  const localMinutes = Number(get("minute"));
  const localSeconds = Number(get("second"));
  const msSinceMidnight =
    (localHours * 3600 + localMinutes * 60 + localSeconds) * 1000;
  const startTime = endTime - msSinceMidnight;

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);

  // Short date for subject line: "Mar 31"
  void midnightLocal; // used only for reference

  return { startTime, endTime, dateLabel };
}

function formatShortDate(timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  }).format(new Date());
}

// ---------------------------------------------------------------------------
// Retry helper for transient errors (e.g. WorkerOverloaded)
// ---------------------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelayMs = 1000 } = {}
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("WorkerOverloaded") ||
          error.message.includes("overloaded"));
      if (!isRetryable || attempt === retries) throw error;
      const delayMs = baseDelayMs * 2 ** attempt;
      console.warn(
        `Transient error (attempt ${attempt + 1}/${retries + 1}), retrying in ${delayMs}ms: ${error.message}`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("unreachable");
}

// ---------------------------------------------------------------------------
// Email Template
// ---------------------------------------------------------------------------

function buildDigestHtml(args: {
  dateLabel: string;
  alertsSent: number;
  newSignups: number;
  totalActiveUsers: number;
  quotes: Array<{ text: string; attribution: string }>;
}): string {
  const { dateLabel, alertsSent, newSignups, totalActiveUsers, quotes } = args;
  const date = escapeHtml(dateLabel);

  const quotesHtml =
    quotes.length > 0
      ? quotes
          .map(
            (q) => `
                <tr>
                  <td style="padding: 0 0 16px;">
                    <p style="margin: 0; font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.6; color: #3d2b1f; font-style: italic;">${escapeHtml(q.text)}</p>
                    ${q.attribution ? `<p style="margin: 4px 0 0; font-family: Georgia, 'Times New Roman', serif; font-size: 12.5px; line-height: 1.4; color: #8b7a6a;">${escapeHtml(q.attribution)}</p>` : ""}
                  </td>
                </tr>`
          )
          .join("")
      : "";

  const moreCount = alertsSent - quotes.length;
  const moreHtml =
    moreCount > 0
      ? `<tr><td style="padding: 0 0 8px;"><p style="margin: 0; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 12.5px; color: #a89080; font-style: italic;">...and ${moreCount} more</p></td></tr>`
      : "";

  const quietHtml =
    alertsSent === 0
      ? `<tr><td style="padding: 0 0 8px;"><p style="margin: 0; font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.6; color: #8b7a6a; font-style: italic;">No alerts today \u2014 the skies were quiet.</p></td></tr>`
      : "";

  const preheader = escapeHtml(
    `${alertsSent} alert${alertsSent !== 1 ? "s" : ""} sent \u00B7 ${newSignups} new signup${newSignups !== 1 ? "s" : ""} \u00B7 ${totalActiveUsers} active subscribers`
  );

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Look West \u2014 Daily Digest</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @font-face {
      font-family: 'Shadows Into Light';
      font-style: normal;
      font-weight: 400;
      src: url(https://fonts.gstatic.com/s/shadowsintolight/v19/UqyNK9UOIntux_czAvDQx_ZcHqZXBNQzdcD55TecYQ.woff2) format('woff2');
    }
    @font-face {
      font-family: 'EB Garamond';
      font-style: italic;
      font-weight: 400;
      src: url(https://fonts.gstatic.com/s/ebgaramond/v27/SlGFmQSNjdsmc35JDF1K5GRwUjcdlttVFm-rI7e8QI96WamXgXFI.woff2) format('woff2');
    }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }
    @media (prefers-color-scheme: dark) {
      .body-bg { background-color: #2a1e16 !important; }
      .card-bg { background-color: #2a1e16 !important; }
      .brand-text { color: #e8c4a0 !important; }
      .subtitle-text { color: #c4967a !important; }
      .stat-number { color: #e8a87c !important; }
      .stat-label { color: #b8a898 !important; }
      .message-text { color: #e8d8c8 !important; }
      .attribution-text { color: #b8a898 !important; }
      .section-heading { color: #c4967a !important; }
      .footer-text { color: #7a6a5a !important; }
      .divider { background-color: #3a2a1e !important; }
      .pill-bg { background-color: #3a2a1e !important; }
      .pill-text { color: #d4a880 !important; }
      .stat-card { background-color: #3a2a1e !important; }
    }
    @media only screen and (max-width: 520px) {
      .card-inner { padding-left: 22px !important; padding-right: 22px !important; }
      .brand-text { font-size: 24px !important; }
      .stat-number { font-size: 26px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #faf5ef; font-family: Georgia, 'Times New Roman', serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">

  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #faf5ef;">
    ${preheader}
    ${"&#847;&zwnj;&nbsp;".repeat(80)}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="body-bg" style="background-color: #faf5ef; font-family: Georgia, 'Times New Roman', serif;">
    <tr>
      <td align="center" style="padding: 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 480px;">

          <!-- Gradient strip -->
          <tr>
            <td style="height: 3px; background: linear-gradient(90deg, #e8a87c 0%, #d4785c 35%, #c4967a 65%, #e8c4a0 100%); background-color: #d4785c;"></td>
          </tr>

          <tr>
            <td class="card-bg" style="background-color: #faf5ef;">

              <!-- Header -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 28px 34px 0;">
                    <p class="brand-text" style="margin: 0 0 4px; font-family: 'Shadows Into Light', Georgia, 'Times New Roman', serif; font-size: 28px; font-weight: 400; color: #7a5636; letter-spacing: 0.04em;">Look West</p>
                    <p class="subtitle-text" style="margin: 0 0 16px; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 400; color: #a89080; letter-spacing: 0.08em; text-transform: uppercase;">Daily Digest</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="pill-bg" style="background-color: #ede0d2; border-radius: 20px; padding: 6px 14px; vertical-align: middle;">
                          <span class="pill-text" style="font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 12.5px; line-height: 1; color: #8b6244; white-space: nowrap;">&#128197; ${date}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Stats -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 24px 34px 8px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td class="stat-card" align="center" width="33%" style="background-color: #ede0d2; border-radius: 12px; padding: 18px 8px;">
                          <p class="stat-number" style="margin: 0; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 30px; font-weight: 600; color: #b8704a; line-height: 1;">${alertsSent}</p>
                          <p class="stat-label" style="margin: 6px 0 0; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 11px; color: #8b7a6a; line-height: 1.3; text-transform: uppercase; letter-spacing: 0.04em;">alerts sent</p>
                        </td>
                        <td style="width: 10px;"></td>
                        <td class="stat-card" align="center" width="33%" style="background-color: #ede0d2; border-radius: 12px; padding: 18px 8px;">
                          <p class="stat-number" style="margin: 0; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 30px; font-weight: 600; color: #b8704a; line-height: 1;">${newSignups}</p>
                          <p class="stat-label" style="margin: 6px 0 0; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 11px; color: #8b7a6a; line-height: 1.3; text-transform: uppercase; letter-spacing: 0.04em;">new signups</p>
                        </td>
                        <td style="width: 10px;"></td>
                        <td class="stat-card" align="center" width="33%" style="background-color: #ede0d2; border-radius: 12px; padding: 18px 8px;">
                          <p class="stat-number" style="margin: 0; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 30px; font-weight: 600; color: #b8704a; line-height: 1;">${totalActiveUsers}</p>
                          <p class="stat-label" style="margin: 6px 0 0; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 11px; color: #8b7a6a; line-height: 1.3; text-transform: uppercase; letter-spacing: 0.04em;">active subscribers</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 16px 34px 0;">
                    <div class="divider" style="height: 1px; background-color: #e6d5c3;"></div>
                  </td>
                </tr>
              </table>

              <!-- Quotes section -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 20px 34px 4px;">
                    <p class="section-heading" style="margin: 0 0 16px; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 500; color: #7a5636; letter-spacing: 0.06em; text-transform: uppercase;">Quotes shared today</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      ${quotesHtml || quietHtml}
                      ${moreHtml}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 8px 34px 0;">
                    <div class="divider" style="height: 1px; background-color: #e6d5c3;"></div>
                  </td>
                </tr>
              </table>

              <!-- Footer -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 18px 34px 26px;">
                    <p class="footer-text" style="margin: 0; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 11.5px; color: #a89080; line-height: 1.65;">
                      Your daily Look West admin digest.<br />
                      <a href="https://golookwest.com" style="color: #a89080; text-decoration: underline;">golookwest.com</a>
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Plain Text
// ---------------------------------------------------------------------------

function buildDigestPlainText(args: {
  dateLabel: string;
  alertsSent: number;
  newSignups: number;
  totalActiveUsers: number;
  quotes: Array<{ text: string; attribution: string }>;
}): string {
  const { dateLabel, alertsSent, newSignups, totalActiveUsers, quotes } = args;

  const lines = [
    "Look West \u2014 Daily Digest",
    dateLabel,
    "",
    `Alerts sent today: ${alertsSent}`,
    `New signups today: ${newSignups}`,
    `Active subscribers: ${totalActiveUsers}`,
    "",
    "Quotes shared today:",
  ];

  if (quotes.length === 0) {
    lines.push("No alerts today \u2014 the skies were quiet.");
  } else {
    quotes.forEach((q, i) => {
      const attr = q.attribution ? ` ${q.attribution}` : "";
      lines.push(`${i + 1}. \u201c${q.text}\u201d${attr}`);
    });
    const more = alertsSent - quotes.length;
    if (more > 0) {
      lines.push(`(and ${more} more)`);
    }
  }

  lines.push("", "---", "golookwest.com");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export const sendDailyDigest = internalAction({
  args: {},
  handler: async (ctx) => {
    const adminEmail = process.env.ADMIN_DIGEST_EMAIL;
    if (!adminEmail) {
      console.warn(
        "ADMIN_DIGEST_EMAIL not set \u2014 skipping daily digest"
      );
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !fromEmail) {
      console.error(
        "Missing RESEND_API_KEY or RESEND_FROM_EMAIL \u2014 skipping daily digest"
      );
      return;
    }

    const timezone = process.env.ADMIN_DIGEST_TIMEZONE ?? "America/New_York";
    const { startTime, endTime, dateLabel } = computeDigestWindow(timezone);

    console.log(
      `Computing daily digest for ${dateLabel} (${startTime} \u2013 ${endTime})`
    );

    const [sentAlerts, newSignups, totalActiveUsers] = await withRetry(() =>
      Promise.all([
        ctx.runQuery(internal.digestQueries.getAlertsSentInRange, {
          startTime,
          endTime,
        }),
        ctx.runQuery(internal.digestQueries.getNewSignupsInRange, {
          startTime,
          endTime,
        }),
        ctx.runQuery(internal.digestQueries.getTotalActiveUsers, {}),
      ])
    );

    // Extract and deduplicate quotes from sent alerts
    const seenQuotes = new Set<string>();
    const quotes: Array<{ text: string; attribution: string }> = [];
    for (const alert of sentAlerts) {
      if (!alert.messageSent || !alert.messageSent.trim()) continue;
      const { quoteText, attribution } = splitMessageParts(alert.messageSent);
      // Strip curly quotes for dedup key
      const key = quoteText.replace(/[\u201c\u201d]/g, "").trim();
      if (key && !seenQuotes.has(key)) {
        seenQuotes.add(key);
        // Clean up curly quotes for display
        const cleanText = quoteText
          .replace(/^\u201c/, "")
          .replace(/\u201d$/, "");
        quotes.push({ text: cleanText, attribution });
      }
    }

    // Cap at 5 quotes
    const displayQuotes = quotes.slice(0, 5);

    const templateArgs = {
      dateLabel,
      alertsSent: sentAlerts.length,
      newSignups: newSignups.length,
      totalActiveUsers,
      quotes: displayQuotes,
    };

    const html = buildDigestHtml(templateArgs);
    const plainText = buildDigestPlainText(templateArgs);
    const shortDate = formatShortDate(timezone);
    const subject = `Look West Daily Digest \u2014 ${shortDate}`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [adminEmail],
        subject,
        text: plainText,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Failed to send daily digest: ${response.status} ${body}`);
    } else {
      console.log(
        `Daily digest sent to ${adminEmail} \u2014 ${sentAlerts.length} alerts, ${newSignups.length} signups, ${totalActiveUsers} active`
      );
    }
  },
});
