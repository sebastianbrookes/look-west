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

  it("returns just city when US location lacks ISO3166-2-lvl4", () => {
    expect(
      parseNominatimAddress({
        city: "Boston",
        state: "Massachusetts",
        country_code: "us",
      })
    ).toBe("Boston");
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

  it("returns 'Your area' when addr is empty and no displayName", () => {
    expect(parseNominatimAddress({})).toBe("Your area");
  });

  it("returns just city when non-US and both country fields are absent", () => {
    expect(
      parseNominatimAddress({ city: "SomeCity" })
    ).toBe("SomeCity");
  });

  it("resolves city from town key", () => {
    expect(
      parseNominatimAddress({
        town: "Faro",
        country: "Portugal",
        country_code: "pt",
      })
    ).toBe("Faro, Portugal");
  });

  it("resolves city from village key", () => {
    expect(
      parseNominatimAddress({
        village: "Hallstatt",
        country: "Austria",
        country_code: "at",
      })
    ).toBe("Hallstatt, Austria");
  });

  it("resolves city from suburb key", () => {
    expect(
      parseNominatimAddress({
        suburb: "Montmartre",
        country: "France",
        country_code: "fr",
      })
    ).toBe("Montmartre, France");
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
