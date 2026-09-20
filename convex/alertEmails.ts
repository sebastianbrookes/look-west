"use node";

/**
 * Alert email rendering and sending via Resend.
 * Follows the same pattern as convex/emails.ts (welcome email).
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function splitMessageParts(message: string): {
  quoteText: string;
  attribution: string;
  metadata: string;
} {
  // Split on --- separator to get quote block and metadata
  let quoteBlock = message;
  let metadata = "";
  const parts = message.split(/\n[ \t]*---[ \t]*\n/);
  if (parts.length >= 2) {
    quoteBlock = parts[0].trim();
    metadata = parts[1].trim();
  } else {
    const parts2 = message.split(/\n[ \t]*---[ \t]*$/);
    if (parts2.length >= 2) {
      quoteBlock = parts2[0].trim();
      metadata = parts2[1].trim();
    }
  }

  // Split quote block into quote text and attribution (line starting with —)
  const lines = quoteBlock.split("\n");
  const attrIndex = lines.findIndex((l) => l.trimStart().startsWith("\u2014"));
  if (attrIndex >= 0) {
    return {
      quoteText: lines.slice(0, attrIndex).join("\n").trim(),
      attribution: lines.slice(attrIndex).join("\n").trim(),
      metadata,
    };
  }

  return { quoteText: quoteBlock, attribution: "", metadata };
}

export function buildAlertHtml(args: {
  message: string;
  location: string;
  sunsetTime: string;
  unsubscribeUrl: string;
  changeLocationUrl: string;
}): string {
  const { quoteText, attribution, metadata } = splitMessageParts(args.message);
  const quoteHtml = escapeHtml(quoteText).replace(/\n/g, "<br>");
  const attributionHtml = escapeHtml(attribution);
  const loc = escapeHtml(args.location);
  const time = escapeHtml(args.sunsetTime);
  const unsub = escapeHtml(args.unsubscribeUrl || "#");
  const changeLocation = escapeHtml(args.changeLocationUrl || "#");
  const preheaderQuote = quoteText.replace(/[\u201c\u201d]/g, "").slice(0, 120);
  const preheader = escapeHtml(`${args.location} · Sunset at ${args.sunsetTime} — ${preheaderQuote}`);
  const sans = "'Figtree', 'Segoe UI', Helvetica, Arial, sans-serif";

  // Keep the queued plain-text format compatible with both alert producers.
  // Unknown metadata is retained instead of silently discarding information.
  const details = metadata.split(/\s*·\s*|\n/).filter(Boolean).map((part) => {
    if (part.startsWith("View at ")) return { label: "Head outside", value: part.slice(8) };
    if (part.startsWith("Peak at ")) return { label: "Peak color", value: part.slice(8) };
    if (part.startsWith("Quality ")) return { label: "Quality", value: part.slice(8) };
    if (/^-?\d+(?:\.\d+)?°[FC]$/.test(part)) return { label: "Temperature", value: part };
    return { label: "Conditions", value: part };
  });
  // Up to three columns per row keeps optional peak-time details readable on phones.
  const detailRows: string[] = [];
  for (let i = 0; i < details.length; i += 3) {
    detailRows.push(`<tr>${details.slice(i, i + 3).map(({ label, value }) => `
      <td width="33.33%" valign="top" style="padding: 16px 8px 0 0; overflow-wrap: anywhere;">
        <p class="muted-text" style="margin: 0; font-family: ${sans}; font-size: 11px; line-height: 1.5; color: #806b59;">${escapeHtml(label)}</p>
        <p class="secondary-text" style="margin: 6px 0 0; font-family: ${sans}; font-size: 13px; line-height: 1.5; color: #5c4030;">${escapeHtml(value)}</p>
      </td>`).join("")}</tr>`);
  }

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Look West — Sunset Alert</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @font-face {
      font-family: 'Shadows Into Light'; font-style: normal; font-weight: 400;
      src: url(https://fonts.gstatic.com/s/shadowsintolight/v19/UqyNK9UOIntux_czAvDQx_ZcHqZXBNQzdcD55TecYQ.woff2) format('woff2');
    }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    body { margin: 0; padding: 0; width: 100% !important; }
    @media (prefers-color-scheme: dark) {
      .body-bg { background-color: #211912 !important; }
      .card-bg { background-color: #2a2019 !important; border-color: #49392c !important; }
      .rule { border-color: #49392c !important; }
      .primary-text, .message-text { color: #f0e2d4 !important; }
      .brand-text, .secondary-text { color: #dec5af !important; }
      .muted-text, .footer-text, .footer-text a { color: #bba591 !important; }
    }
    @media only screen and (max-width: 520px) {
      .outer { padding: 24px 16px !important; }
      .card-inner { padding-left: 20px !important; padding-right: 20px !important; }
    }
  </style>
</head>
<body class="body-bg" style="margin: 0; padding: 0; background-color: #fdf8f4;">
  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; mso-hide: all;">
    ${preheader}${"&#847;&zwnj;&nbsp;".repeat(80)}
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="body-bg" style="background-color: #fdf8f4;">
    <tr><td class="outer" align="center" style="padding: 40px 24px;">
      <!--[if mso]><table role="presentation" width="480" align="center"><tr><td><![endif]-->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="card-bg" style="max-width: 480px; background-color: #fffcf8; border: 1px solid #e9ddd0; border-radius: 12px; border-spacing: 0;">
        <tr><td class="card-inner rule" style="padding: 16px 28px; border-bottom: 1px solid #eee3d8;">
          <p class="brand-text" style="margin: 0; font-family: 'Shadows Into Light', Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.5; font-weight: 400; color: #5c4030;">Look West</p>
        </td></tr>
        <tr><td class="card-inner" style="padding: 24px 28px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            <td valign="middle" style="overflow-wrap: anywhere;">
              <h1 class="primary-text" style="margin: 0; font-family: ${sans}; font-size: 15px; line-height: 1.4; font-weight: 600; color: #2c1810;">${loc}</h1>
              <p class="secondary-text" style="margin: 4px 0 0; font-family: ${sans}; font-size: 13px; line-height: 1.5; color: #5c4030;">Sunset at ${time}</p>
            </td>
            <td width="48" align="right" valign="middle"><img src="https://golookwest.com/email-sunset.png" width="36" height="36" alt="" style="display: block; border: 0; width: 36px; height: 36px;"></td>
          </tr></table>
        </td></tr>
        <tr><td class="card-inner" style="padding: 28px;">
          <p class="message-text" style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.75; color: #3d2b1f; font-style: italic;">${quoteHtml}</p>
          ${attribution ? `<p class="muted-text" style="margin: 14px 0 0; font-family: ${sans}; font-size: 12px; line-height: 1.6; color: #806b59;">${attributionHtml}</p>` : ""}
        </td></tr>
        ${details.length ? `<tr><td class="card-inner" style="padding: 0 28px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="rule" style="table-layout: fixed; border-top: 1px solid #eee3d8;">${detailRows.join("")}</table>
        </td></tr>` : ""}
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 480px;">
        <tr><td align="center" style="padding: 22px 8px 0;">
          <p class="footer-text" style="margin: 0; font-family: ${sans}; font-size: 11px; color: #806b59; line-height: 1.8;">
            You signed up for sunset alerts at <a href="https://golookwest.com" style="color: #806b59; text-decoration: underline;">golookwest.com</a>.<br>
            <a href="https://buymeacoffee.com/sebastianbrookes" style="color: #806b59; text-decoration: underline;">Buy me a coffee</a> &middot;
            <a href="${changeLocation}" style="color: #806b59; text-decoration: underline;">Change location</a> &middot;
            <a href="${unsub}" style="color: #806b59; text-decoration: underline;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendAlertEmail(args: {
  to: string;
  subject: string;
  html: string;
  plainText: string;
  unsubscribeUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    throw new Error("Missing RESEND_API_KEY or RESEND_FROM_EMAIL env var");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [args.to],
      subject: args.subject,
      text: args.plainText,
      html: args.html,
      headers: {
        "List-Unsubscribe": `<${args.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend error: ${response.status} ${body}`);
  }
}
