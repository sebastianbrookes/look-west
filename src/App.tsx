import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import "./App.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type LocationData = {
  latitude: number;
  longitude: number;
  locationName: string;
  timezone: string;
};

type BrowserGeoStatus = "idle" | "requesting" | "denied" | "unsupported";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const NOMINATIM_HEADERS = { "User-Agent": "LookWest/1.0" };

function parseAddress(
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

  const iso = addr["ISO3166-2-lvl4"] || "";
  const state = iso.startsWith("US-") ? iso.slice(3) : addr.state;
  return state ? `${city}, ${state}` : city;
}

async function reverseGeocode(lat: number, lon: number): Promise<LocationData> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
    { headers: NOMINATIM_HEADERS }
  );
  const data = await res.json();
  return {
    latitude: lat,
    longitude: lon,
    locationName: parseAddress(data.address || {}, data.display_name),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function App() {
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [locationInput, setLocationInput] = useState("");
  const [browserGeoStatus, setBrowserGeoStatus] =
    useState<BrowserGeoStatus>("idle");
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  const [name, setName] = useState("");
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const nameTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [confirmedLocation, setConfirmedLocation] = useState("");
  const [copied, setCopied] = useState(false);

  // Confirm the name check after 1s of inactivity or on blur
  useEffect(() => {
    if (nameTimer.current) clearTimeout(nameTimer.current);
    if (!name.trim()) {
      setNameConfirmed(false);
      return;
    }
    nameTimer.current = setTimeout(() => setNameConfirmed(true), 1000);
    return () => { if (nameTimer.current) clearTimeout(nameTimer.current); };
  }, [name]);

  const addUser = useMutation(api.users.addUser);

  const requestBrowserLocation = useCallback(async () => {
    setGeocodeError(null);
    if (!navigator.geolocation) {
      setBrowserGeoStatus("unsupported");
      return;
    }

    // Check permission state first so we can show a helpful message
    // instead of letting Chrome silently block the request.
    if (navigator.permissions) {
      try {
        const perm = await navigator.permissions.query({ name: "geolocation" });
        if (perm.state === "denied") {
          setBrowserGeoStatus("denied");
          return;
        }
      } catch {
        // permissions.query not supported — fall through to getCurrentPosition
      }
    }

    setBrowserGeoStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const data = await reverseGeocode(latitude, longitude);
          setLocationData(data);
          setLocationInput(data.locationName);
          setBrowserGeoStatus("idle");
        } catch {
          setGeocodeError("Couldn't determine your location.");
          setBrowserGeoStatus("idle");
        }
      },
      () => {
        setBrowserGeoStatus("denied");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  const geocodeManual = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setGeocoding(true);
    setGeocodeError(null);
    try {
      const trimmed = q.trim();
      const isZip = /^\d{5}(-\d{4})?$/.test(trimmed);
      const params = new URLSearchParams({
        format: "json",
        limit: "1",
        addressdetails: "1",
        ...(isZip
          ? { postalcode: trimmed.slice(0, 5), countrycodes: "us" }
          : { q: trimmed }),
      });
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        { headers: NOMINATIM_HEADERS }
      );
      const results = await res.json();
      if (!results.length) {
        setGeocodeError(
          "Couldn't find that location. Try a city name or zip code."
        );
        setLocationData(null);
        return;
      }
      const r = results[0];
      const data: LocationData = {
        latitude: parseFloat(r.lat),
        longitude: parseFloat(r.lon),
        locationName: parseAddress(r.address || {}, r.display_name),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      setLocationData(data);
      setLocationInput(data.locationName);
    } catch {
      setGeocodeError("Something went wrong looking up that location.");
      setLocationData(null);
    } finally {
      setGeocoding(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setEmailError("");

    if (!locationData) {
      setSubmitError("Please set your location first.");
      return;
    }
    if (!name.trim()) {
      setSubmitError("We'll need your name.");
      return;
    }
    if (!validateEmail(email)) {
      setEmailError("Enter a valid email address");
      return;
    }

    setSubmitting(true);
    try {
      await addUser({
        name: name.trim(),
        email: email.trim(),
        ...locationData,
      });
      setConfirmedEmail(email.trim());
      setConfirmedLocation(locationData.locationName);
      setSubmitted(true);
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may not be available — fail silently */
    }
  };

  /* ================================================================ */
  /*  Confirmation view                                                */
  /* ================================================================ */

  if (submitted) {
    return (
      <div className="page">
        <div className="card confirmation">
          <h1 className="headline">You're in.</h1>
          <p className="body">
            We'll email you at <strong>{confirmedEmail}</strong> whenever the
            sunset in <strong>{confirmedLocation}</strong> will be beautiful.
          </p>
          <p className="body dim">
            Your first alert could come as early as tonight.
          </p>
          <button type="button" className="link-btn" onClick={copyLink}>
            {copied ? (
              <>
                <svg
                  className="link-icon copied-check"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                Tell a friend
                <svg
                  className="link-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Sign-up form                                                     */
  /* ================================================================ */

  return (
    <div className="page">
      <div className="card">
        <h1 className="headline">Look West</h1>
        <p className="tagline">
          We'll email you when the sunset's worth watching.
        </p>

        <form onSubmit={handleSubmit} className="form">
          {/* ---------- location ---------- */}
          <div className="field field-location">
            <div className="input-with-icon">
              <input
                id="location-input"
                type="text"
                className="input"
                placeholder="City or zip code"
                value={locationInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setLocationInput(v);
                  setGeocodeError(null);
                  if (!v.trim()) setLocationData(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!locationInput.trim()) {
                      setLocationData(null);
                      return;
                    }
                    geocodeManual(locationInput);
                  }
                }}
                onBlur={() => {
                  if (!locationInput.trim()) {
                    setLocationData(null);
                    setGeocodeError(null);
                    return;
                  }
                  geocodeManual(locationInput);
                }}
                disabled={geocoding || browserGeoStatus === "requesting"}
                autoComplete="address-level2"
                aria-invalid={!!geocodeError}
                aria-describedby={geocodeError ? "location-geocode-error" : undefined}
              />
              {geocoding && <span className="input-spinner" aria-hidden />}
              {!geocoding && locationData && (
                <svg className="input-check" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <circle cx="9" cy="9" r="9" fill="#F9DE8E" />
                  <path d="M5.5 9.2L8 11.7L12.5 6.5" stroke="#5c4030" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            {geocodeError && (
              <p className="field-error" id="location-geocode-error">{geocodeError}</p>
            )}
            {browserGeoStatus === "denied" && !locationData && (
              <p className="field-hint">Location permission denied. Enter your city or ZIP code above instead.</p>
            )}
            {browserGeoStatus !== "unsupported" && browserGeoStatus !== "denied" && !locationData && (
              <button
                type="button"
                className="geo-link"
                onClick={requestBrowserLocation}
                disabled={browserGeoStatus === "requesting" || geocoding}
              >
                {browserGeoStatus === "requesting" ? (
                  <>
                    <span className="geo-link-spinner" aria-hidden />
                    Finding you…
                  </>
                ) : (
                  "Use my current location"
                )}
              </button>
            )}
          </div>

          <div className="field">
            <div className="input-with-icon">
              <input
                type="text"
                className="input"
                placeholder="Your first name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameConfirmed(false);
                }}
                onBlur={() => { if (name.trim()) setNameConfirmed(true); }}
                autoComplete="given-name"
              />
              {nameConfirmed && (
                <svg className="input-check" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <circle cx="9" cy="9" r="9" fill="#F9DE8E" />
                  <path d="M5.5 9.2L8 11.7L12.5 6.5" stroke="#5c4030" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>

          <div className="field">
            <div className="input-with-icon">
              <input
                type="email"
                className={`input${emailError ? " input-error" : ""}`}
                placeholder="Email address"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError("");
                }}
                autoComplete="email"
              />
              {!emailError && validateEmail(email) && (
                <svg className="input-check" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <circle cx="9" cy="9" r="9" fill="#F9DE8E" />
                  <path d="M5.5 9.2L8 11.7L12.5 6.5" stroke="#5c4030" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            {emailError && <p className="field-error">{emailError}</p>}
          </div>

          {submitError && <p className="field-error">{submitError}</p>}

          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? (
              <>
                <span className="spinner" />
                <span>Signing up...</span>
              </>
            ) : (
              "Sign me up"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
