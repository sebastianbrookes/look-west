/**
 * Format a human-readable label from Nominatim `address` + optional `display_name`.
 * US: "City, ST"; other countries: "City, Country".
 */
export function parseNominatimAddress(
  addr: Record<string, string>,
  displayName?: string
): string {
  const city =
    addr.city_district ||
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.suburb ||
    addr.hamlet ||
    addr.county;

  if (!city) {
    if (displayName) {
      const parts = displayName.split(", ");
      return parts.length >= 2 ? `${parts[0]}, ${parts[1]}` : parts[0];
    }
    return "Your area";
  }

  const countryCode = (addr.country_code || "").toLowerCase();
  if (countryCode === "us") {
    const iso = addr["ISO3166-2-lvl4"] || "";
    const state = iso.startsWith("US-") ? iso.slice(3) : addr.state;
    return state ? `${city}, ${state}` : city;
  }

  const country = addr.country || (addr.country_code?.toUpperCase() ?? "");
  return country ? `${city}, ${country}` : city;
}
