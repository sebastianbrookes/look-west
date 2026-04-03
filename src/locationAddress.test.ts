import { describe, expect, it } from "vitest";
import { parseNominatimAddress } from "./locationAddress";

describe("parseNominatimAddress", () => {
  it("formats US cities as City, ST", () => {
    expect(
      parseNominatimAddress({
        city: "Boston",
        state: "Massachusetts",
        country_code: "us",
        "ISO3166-2-lvl4": "US-MA",
      })
    ).toBe("Boston, MA");
  });

  it("formats European cities as City, Country", () => {
    expect(
      parseNominatimAddress({
        city: "Prague",
        country: "Czechia",
        country_code: "cz",
      })
    ).toBe("Prague, Czechia");
  });

  it("falls back to display_name when city is missing", () => {
    expect(
      parseNominatimAddress({}, "Oslo, Norway")
    ).toBe("Oslo, Norway");
  });

  it("uses country code when country name is absent (non-US)", () => {
    expect(
      parseNominatimAddress({
        city: "Berlin",
        country_code: "de",
      })
    ).toBe("Berlin, DE");
  });
});
