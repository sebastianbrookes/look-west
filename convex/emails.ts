"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";

const WELCOME_MESSAGE =
  "Welcome to Look West! You\u2019ve successfully signed up for sunset alerts. Whenever the sunset near you is predicted to be beautiful, we\u2019ll send you a heads-up so you don\u2019t miss it.";

const BACKGROUND_IMAGE_URL =
  process.env.EMAIL_BACKGROUND_URL ??
  "https://look-west.vercel.app/background.webp";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function buildWelcomeHtml(location: string, unsubscribeUrl: string): string {
  const loc = escapeHtml(location);
  const unsub = escapeHtml(unsubscribeUrl);
  const bg = BACKGROUND_IMAGE_URL;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Look West — Welcome</title>
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
      font-family: 'Inter';
      font-style: normal;
      font-weight: 400;
      src: url(https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2) format('woff2');
    }
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 500;
      src: url(https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZFhiJ-Ek-_EeA.woff2) format('woff2');
    }

    /* Reset */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }

    /* Dark mode overrides */
    @media (prefers-color-scheme: dark) {
      .body-bg { background-color: #3a2a1e !important; }
      .card-bg { background-color: #3a2a1e !important; }
      .hero-img { border-radius: 0 !important; }
      .brand-text { color: #e8c4a0 !important; }
      .message-text { color: #f0e0d0 !important; }
      .meta-text { color: #c4967a !important; }
      .footer-text { color: #8b7060 !important; }
      .divider { background-color: #4a3728 !important; }
      .pill-bg { background-color: #4a3728 !important; }
      .pill-text { color: #d4a880 !important; }
    }

    /* Mobile adjustments */
    @media only screen and (max-width: 520px) {
      .card-inner { padding-left: 24px !important; padding-right: 24px !important; }
      .hero-img { height: 180px !important; }
      .brand-text { font-size: 24px !important; }
      .message-text { font-size: 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #faf5ef; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">

  <!-- Preheader (hidden preview text) -->
  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #faf5ef;">
    You're signed up for ${loc} sunset alerts
    &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="body-bg" style="background-color: #faf5ef;">
    <tr>
      <td align="center" class="card-wrapper" style="padding: 0;">

        <!-- Main card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 480px;">

          <!-- Hero sunset image -->
          <tr>
            <td class="hero-img" style="height: 180px; background-image: url('${bg}'); background-size: cover; background-position: center 40%; background-color: #d4935c; border-radius: 0 0 0 0;" valign="bottom">
              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:480px;height:180px;">
                <v:fill type="tile" src="${bg}" color="#d4935c" />
                <v:textbox inset="0,0,0,0">
              <![endif]-->
              <div style="height: 180px;"></div>
              <!--[if gte mso 9]>
                </v:textbox>
              </v:rect>
              <![endif]-->
            </td>
          </tr>

          <!-- Card body -->
          <tr>
            <td class="card-bg" style="background-color: #faf5ef;">

              <!-- Header: brand + location pill -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 28px 32px 0;">

                    <!-- Brand name -->
                    <p class="brand-text" style="margin: 0 0 16px; font-family: 'Shadows Into Light', Georgia, cursive; font-size: 26px; font-weight: 400; color: #8b6244; letter-spacing: 0.03em;">Look West</p>

                    <!-- Location + signed-up pill row -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <!-- Location pill -->
                        <td class="pill-bg" style="background-color: #f0e0d0; border-radius: 20px; padding: 6px 14px;">
                          <span class="pill-text" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 13px; color: #996b4a; white-space: nowrap;">&#128205; ${loc}</span>
                        </td>

                        <td style="width: 8px;"></td>

                        <!-- Signed-up pill -->
                        <td class="pill-bg" style="background-color: #f0e0d0; border-radius: 20px; padding: 6px 14px;">
                          <span class="pill-text" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 13px; color: #996b4a; white-space: nowrap;">&#10003; Signed up</span>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

              <!-- Message body -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 24px 32px 28px;">
                    <p class="message-text" style="margin: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.75; color: #4a3728;">${WELCOME_MESSAGE}</p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 0 32px;">
                    <div class="divider" style="height: 1px; background-color: #ecddd0;"></div>
                  </td>
                </tr>
              </table>

              <!-- Footer -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 18px 32px 24px;">
                    <p class="footer-text" style="margin: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 12px; color: #b8a090; line-height: 1.6;">
                      You signed up for sunset alerts at <a href="https://golookwest.com" style="color: #b8a090; text-decoration: underline;">golookwest.com</a>.<br>
                      <a href="https://buymeacoffee.com/sebastianbrookes" style="color: #b8a090; text-decoration: underline;">Buy me a coffee</a> &middot;
                      <a href="${unsub}" style="color: #b8a090; text-decoration: underline;">Unsubscribe</a>
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

        </table>
        <!-- End card -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}

export const sendWelcomeEmail = internalAction({
  args: {
    name: v.string(),
    email: v.string(),
    locationName: v.string(),
    unsubscribeToken: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const baseUrl = (process.env.APP_BASE_URL ?? "https://golookwest.com").replace(/\/+$/, "");

    if (!apiKey || !fromEmail) {
      console.error("Missing RESEND_API_KEY or RESEND_FROM_EMAIL env var — skipping welcome email");
      return;
    }

    const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${encodeURIComponent(args.unsubscribeToken)}`;
    const html = buildWelcomeHtml(args.locationName, unsubscribeUrl);
    const plainText = `${WELCOME_MESSAGE}\n\nUnsubscribe: ${unsubscribeUrl}`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [args.email],
        subject: "You're in! \u{1F305}",
        text: plainText,
        html,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Failed to send welcome email to ${args.email}: ${response.status} ${body}`);
    } else {
      console.log(`Welcome email sent to ${args.email}`);
    }
  },
});
