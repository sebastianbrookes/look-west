"use node";

/**
 * Alert email rendering and sending via Resend.
 * Follows the same pattern as convex/emails.ts (welcome email).
 */

const BACKGROUND_IMAGE_URL =
  process.env.EMAIL_BACKGROUND_URL ??
  "https://golookwest.com/background.webp";

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
  const metadataHtml = escapeHtml(metadata).replace(/\n/g, "<br>");
  const loc = escapeHtml(args.location);
  const time = escapeHtml(args.sunsetTime);
  const unsub = escapeHtml(args.unsubscribeUrl || "#");
  const changeLocation = escapeHtml(args.changeLocationUrl || "#");
  const bg = BACKGROUND_IMAGE_URL;
  // Strip curly quotes from quote text for a clean preheader
  const preheaderQuote = quoteText.replace(/[\u201c\u201d]/g, "").slice(0, 120);
  const preheader = escapeHtml(`${loc} \u00B7 Sunset at ${time} \u2014 ${preheaderQuote}`);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Look West \u2014 Sunset Alert</title>
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
      font-style: normal;
      font-weight: 400;
      src: url(https://fonts.gstatic.com/s/ebgaramond/v27/SlGDmQSNjdsmc35JDF1K5E55YMjF_7DPuGi-6_RUA4V-e6yHgQ.woff2) format('woff2');
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
    .message-text { font-family: 'EB Garamond', Georgia, 'Times New Roman', serif !important; }
    @media (prefers-color-scheme: dark) {
      .body-bg { background-color: #2a1e16 !important; }
      .card-bg { background-color: #2a1e16 !important; }
      .brand-text { color: #e8c4a0 !important; }
      .message-text { color: #e8d8c8 !important; }
      .attribution-text { color: #b8a898 !important; }
      .meta-text { color: #c4967a !important; }
      .footer-text { color: #7a6a5a !important; }
      .divider { background-color: #3a2a1e !important; }
      .pill-bg { background-color: #3a2a1e !important; }
      .pill-text { color: #d4a880 !important; }
    }
    @media only screen and (max-width: 520px) {
      .card-inner { padding-left: 22px !important; padding-right: 22px !important; }
      .hero-img { height: 180px !important; }
      .brand-text { font-size: 24px !important; }
      .message-text { font-size: 15px !important; }
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

          <tr>
            <td class="hero-img" style="height: 200px; background-image: url('${bg}'); background-size: cover; background-position: center 40%; background-color: #d4935c;" valign="bottom">
              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:480px;height:200px;">
                <v:fill type="tile" src="${bg}" color="#d4935c" />
                <v:textbox inset="0,0,0,0">
              <![endif]-->
              <div style="height: 200px;"></div>
              <!--[if gte mso 9]>
                </v:textbox>
              </v:rect>
              <![endif]-->
            </td>
          </tr>

          <tr>
            <td style="height: 3px; background: linear-gradient(90deg, #e8a87c 0%, #d4785c 35%, #c4967a 65%, #e8c4a0 100%); background-color: #d4785c;"></td>
          </tr>

          <tr>
            <td class="card-bg" style="background-color: #faf5ef;">

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 28px 34px 0;">
                    <p class="brand-text" style="margin: 0 0 16px; font-family: 'Shadows Into Light', Georgia, 'Times New Roman', serif; font-size: 28px; font-weight: 400; color: #7a5636; letter-spacing: 0.04em;">Look West</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="pill-bg" style="background-color: #ede0d2; border-radius: 20px; padding: 6px 14px; vertical-align: middle;">
                          <span class="pill-text" style="font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 12.5px; line-height: 1; color: #8b6244; white-space: nowrap;">&#128205; ${loc}</span>
                        </td>
                        <td style="width: 8px;"></td>
                        <td class="pill-bg" style="background-color: #ede0d2; border-radius: 20px; padding: 6px 14px; vertical-align: middle;">
                          <span class="pill-text" style="font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 12.5px; line-height: 1; color: #8b6244; white-space: nowrap;">&#127749; ${time}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 24px 34px ${attribution ? "6px" : "28px"};">
                    <p class="message-text" style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 19px; line-height: 1.65; color: #3d2b1f; font-style: italic;">${quoteHtml}</p>
                  </td>
                </tr>
              </table>${attribution ? `

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 16px 34px 28px;">
                    <p class="attribution-text" style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 13.5px; line-height: 1.4; color: #8b7a6a; letter-spacing: 0.01em;">${attributionHtml}</p>
                  </td>
                </tr>
              </table>` : ""}

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 0 34px;">
                    <div class="divider" style="height: 1px; background-color: #e6d5c3;"></div>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 14px 34px 14px;">
                    <p class="meta-text" style="margin: 0; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 11.5px; line-height: 1; color: #a89080; letter-spacing: 0.02em;">${metadataHtml}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 0 34px;">
                    <div class="divider" style="height: 1px; background-color: #e6d5c3;"></div>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 18px 34px 26px;">
                    <p class="footer-text" style="margin: 0; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 11.5px; color: #a89080; line-height: 1.65;">
                      You signed up for sunset alerts at <a href="https://golookwest.com" style="color: #a89080; text-decoration: underline;">golookwest.com</a>.<br />
                      <a href="https://buymeacoffee.com/sebastianbrookes" style="color: #a89080; text-decoration: underline;">Buy me a coffee</a> &middot;
                      <a href="${changeLocation}" style="color: #a89080; text-decoration: underline;">Change location</a> &middot;
                      <a href="${unsub}" style="color: #a89080; text-decoration: underline;">Unsubscribe</a>
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
