// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildAlertHtml } from "./alertEmails";

const args = {
  location: "Brooklyn, NY",
  sunsetTime: "6:46 PM",
  unsubscribeUrl: "https://example.com/unsubscribe?token=abc&mode=email",
  changeLocationUrl: "https://example.com/change-location?token=abc",
};

describe("alert email rendering", () => {
  it("renders queued conditions as labeled details and retains optional peak time", () => {
    const html = buildAlertHtml({ ...args, message: "“A sunset.”\n— An Author\n\n---\n\nView at 6:16 PM  ·  Peak at 6:40 PM  ·  34°F  ·  Quality 48%" });
    for (const value of ["Head outside", "6:16 PM", "Peak color", "6:40 PM", "Temperature", "34°F", "Quality", "48%", "— An Author"]) {
      expect(html).toContain(value);
    }
    expect(html).toContain('href="https://example.com/unsubscribe?token=abc&amp;mode=email"');
    expect(html).toContain(`href="${args.changeLocationUrl}"`);
    expect(html).not.toContain("Sample email");
    expect(html).not.toContain("background.webp");
  });

  it("escapes content once, including the preheader and unfamiliar metadata", () => {
    const html = buildAlertHtml({ ...args, location: "A & B <city>", message: '“<script>alert("x")</script>”\n— A & B\n---\nWind < 5 mph' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("A &amp; B &lt;city&gt;");
    expect(html).not.toContain("&amp;amp;");
    expect(html).toContain("Wind &lt; 5 mph");
  });

  it("supports messages without attribution or conditions", () => {
    const html = buildAlertHtml({ ...args, message: "A quiet evening." });
    expect(html).toContain("A quiet evening.");
    expect(html).not.toContain("Head outside");
    expect(html).not.toContain("undefined");
  });
});
