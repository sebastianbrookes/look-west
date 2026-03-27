"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";

const WELCOME_MESSAGE =
  "You\u2019re almost signed up for sunset alerts! Click the button below to confirm your email and start receiving alerts whenever the sunset near you is predicted to be beautiful.";

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

function buildWelcomeHtml(location: string, confirmUrl: string, unsubscribeUrl: string): string {
  const loc = escapeHtml(location);
  const confirm = escapeHtml(confirmUrl);
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
    /* Progressive enhancement — renders in Apple Mail, Thunderbird, Samsung Mail */
    @font-face {
      font-family: 'Shadows Into Light';
      font-style: normal;
      font-weight: 400;
      src: url(https://fonts.gstatic.com/s/shadowsintolight/v19/UqyNK9UOIntux_czAvDQx_ZcHqZXBNQzdcD55TecYQ.woff2) format('woff2');
    }
    @font-face {
      font-family: 'Figtree';
      font-style: normal;
      font-weight: 400;
      src: url(https://fonts.gstatic.com/s/figtree/v9/_Xmz-HUzqDCFdgfMsYiV_F7wfS-Bs_d_QF5e.ttf) format('truetype');
    }
    @font-face {
      font-family: 'Figtree';
      font-style: normal;
      font-weight: 500;
      src: url(https://fonts.gstatic.com/s/figtree/v9/_Xmz-HUzqDCFdgfMsYiV_F7wfS-Bs_dNQF5e.ttf) format('truetype');
    }

    /* Reset */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }

    /* Dark mode overrides */
    @media (prefers-color-scheme: dark) {
      .body-bg { background-color: #2a1e16 !important; }
      .card-bg { background-color: #2a1e16 !important; }
      .brand-text { color: #e8c4a0 !important; }
      .message-text { color: #e8d8c8 !important; }
      .meta-text { color: #c4967a !important; }
      .footer-text { color: #7a6a5a !important; }
      .divider { background-color: #3a2a1e !important; }
      .pill-bg { background-color: #3a2a1e !important; }
      .pill-text { color: #d4a880 !important; }
    }

    /* Mobile adjustments */
    @media only screen and (max-width: 520px) {
      .card-inner { padding-left: 22px !important; padding-right: 22px !important; }
      .hero-img { height: 160px !important; }
      .brand-text { font-size: 24px !important; }
      .message-text { font-size: 15px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #faf5ef; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">

  <!-- Preheader (hidden preview text) -->
  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #faf5ef;">
    Confirm your email to get ${loc} sunset alerts
    &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="body-bg" style="background-color: #faf5ef;">
    <tr>
      <td align="center" style="padding: 0;">

        <!-- Main card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 480px;">

          <!-- Hero sunset image -->
          <tr>
            <td class="hero-img" style="height: 180px; background-image: url('${bg}'); background-size: cover; background-position: center 40%; background-color: #d4935c;" valign="bottom">
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

          <!-- Warm gradient transition strip -->
          <tr>
            <td style="height: 3px; background: linear-gradient(90deg, #e8a87c 0%, #d4785c 35%, #c4967a 65%, #e8c4a0 100%); background-color: #d4785c;"></td>
          </tr>

          <!-- Card body -->
          <tr>
            <td class="card-bg" style="background-color: #faf5ef;">

              <!-- Header: brand + location pill -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 28px 34px 0;">

                    <!-- Brand name -->
                    <p class="brand-text" style="margin: 0 0 16px; font-family: 'Shadows Into Light', Georgia, 'Times New Roman', serif; font-size: 28px; font-weight: 400; color: #7a5636; letter-spacing: 0.04em;">Look West</p>

                    <!-- Location + pending pill row -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <!-- Location pill -->
                        <td class="pill-bg" style="background-color: #ede0d2; border-radius: 20px; padding: 6px 14px; vertical-align: middle;">
                          <span class="pill-text" style="font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 12.5px; line-height: 1; color: #8b6244; white-space: nowrap;">&#128205; ${loc}</span>
                        </td>

                        <td style="width: 8px;"></td>

                        <!-- Pending pill -->
                        <td class="pill-bg" style="background-color: #ede0d2; border-radius: 20px; padding: 6px 14px; vertical-align: middle;">
                          <span class="pill-text" style="font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 12.5px; line-height: 1; color: #8b6244; white-space: nowrap;">&#9679; Pending confirmation</span>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

              <!-- Message body -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 22px 34px 28px;">
                    <p class="message-text" style="margin: 0; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 15.5px; line-height: 1.7; color: #3d2b1f;">${WELCOME_MESSAGE}</p>
                  </td>
                </tr>
              </table>

              <!-- Confirm CTA button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 0 34px 24px;" align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${confirm}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="17%" fillcolor="#b8704a" stroke="f">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:15.5px;font-weight:500;">Confirm your email</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${confirm}" style="display: inline-block; background-color: #b8704a; color: #ffffff; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 15.5px; font-weight: 500; text-decoration: none; padding: 14px 40px; border-radius: 10px; text-align: center;">Confirm your email</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 0 34px;">
                    <div class="divider" style="height: 1px; background-color: #e6d5c3;"></div>
                  </td>
                </tr>
              </table>

              <!-- Footer -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="card-inner" style="padding: 18px 34px 26px;">
                    <p class="footer-text" style="margin: 0; font-family: 'Figtree', 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size: 11.5px; color: #a89080; line-height: 1.65;">
                      You signed up for sunset alerts at <a href="https://golookwest.com" style="color: #a89080; text-decoration: underline;">golookwest.com</a>.<br />
                      <a href="https://buymeacoffee.com/sebastianbrookes" style="color: #a89080; text-decoration: underline;">Buy me a coffee</a> &middot;
                      <a href="${unsub}" style="color: #a89080; text-decoration: underline;">Unsubscribe</a>
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

    const confirmUrl = `${baseUrl}/confirm?token=${encodeURIComponent(args.unsubscribeToken)}`;
    const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${encodeURIComponent(args.unsubscribeToken)}`;
    const html = buildWelcomeHtml(args.locationName, confirmUrl, unsubscribeUrl);
    const plainText = `${WELCOME_MESSAGE}\n\nConfirm your email: ${confirmUrl}\n\nUnsubscribe: ${unsubscribeUrl}`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [args.email],
        subject: "Confirm your signup",
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
