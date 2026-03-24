import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation } from "convex/react";
import tzLookup from "tz-lookup";
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
const DUPLICATE_EMAIL_ERROR = "Email already registered";
const GENERIC_SUBMIT_ERROR = "Something went wrong. Please try again.";
const INVALID_UNSUBSCRIBE_TOKEN_ERROR = "Invalid unsubscribe link.";

function resolveTimezone(lat: number, lon: number): string {
  try {
    return tzLookup(lat, lon);
  } catch {
    return "UTC";
  }
}

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
    timezone: resolveTimezone(lat, lon),
  };
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function getReadableErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return GENERIC_SUBMIT_ERROR;

  const convexMessageMatch = err.message.match(
    /Uncaught Error:\s*(.+?)(?:\s+at handler|\s+Called by client|$)/s
  );

  return convexMessageMatch?.[1].trim() || err.message || GENERIC_SUBMIT_ERROR;
}

function getUnsubscribeTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("token")?.trim() ?? "";
}

function CheckIcon() {
  return (
    <svg className="input-check" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="9" fill="#F9DE8E" />
      <path
        d="M5.5 9.2L8 11.7L12.5 6.5"
        stroke="#5c4030"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function App() {
  const isUnsubscribePage = window.location.pathname === "/unsubscribe";
  const unsubscribeToken = useMemo(getUnsubscribeTokenFromUrl, []);
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [locationInput, setLocationInput] = useState("");
  const [browserGeoStatus, setBrowserGeoStatus] =
    useState<BrowserGeoStatus>("idle");
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  const [name, setName] = useState("");
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [email, setEmail] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [duplicateEmailModalOpen, setDuplicateEmailModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [confirmedLocation, setConfirmedLocation] = useState("");
  const [copied, setCopied] = useState(false);
  const manualGeocodeInFlightRef = useRef(false);
  const [unsubscribeState, setUnsubscribeState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [unsubscribeError, setUnsubscribeError] = useState("");

  const addUser = useMutation(api.users.addUser);
  const unsubscribeByToken = useMutation(api.users.unsubscribeByToken);
  const hasLocationChangedSinceLastGeocode = (value: string) => {
    const normalizedInput = value.trim().toLowerCase();
    const normalizedGeocodedLocation =
      locationData?.locationName.trim().toLowerCase() ?? "";

    return !!normalizedInput && normalizedInput !== normalizedGeocodedLocation;
  };

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
    if (!q.trim() || manualGeocodeInFlightRef.current) return;

    manualGeocodeInFlightRef.current = true;
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
      const latitude = parseFloat(r.lat);
      const longitude = parseFloat(r.lon);
      const data: LocationData = {
        latitude,
        longitude,
        locationName: parseAddress(r.address || {}, r.display_name),
        timezone: resolveTimezone(latitude, longitude),
      };
      setLocationData(data);
      setLocationInput(data.locationName);
    } catch {
      setGeocodeError("Something went wrong looking up that location.");
      setLocationData(null);
    } finally {
      manualGeocodeInFlightRef.current = false;
      setGeocoding(false);
    }
  }, []);

useEffect(() => {
  if (name.trim().length < 2) {
    setNameConfirmed(false);
    return;
  }

  const timeoutId = window.setTimeout(() => {
    setNameConfirmed(true);
  }, 500);

  return () => window.clearTimeout(timeoutId);
}, [name]);

useEffect(() => {
  if (!email.trim() || !validateEmail(email)) {
    setEmailConfirmed(false);
    return;
  }

  const timeoutId = window.setTimeout(() => {
    setEmailConfirmed(true);
  }, 500);

  return () => window.clearTimeout(timeoutId);
}, [email]);

const resolveManualLocation = useCallback(() => {
  const trimmed = locationInput.trim();
  if (!trimmed) {
    setLocationData(null);
    setGeocodeError(null);
    return;
  }
  if (locationData?.locationName === trimmed) return;
  geocodeManual(trimmed);
}, [geocodeManual, locationData, locationInput]);

  const closeDuplicateEmailModal = useCallback(() => {
    setDuplicateEmailModalOpen(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setEmailError("");
    setDuplicateEmailModalOpen(false);

    if (!locationData) {
      setSubmitError("Please set your location first.");
      return;
    }
    if (name.trim().length < 2) {
      setSubmitError("Name must be at least 2 characters.");
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
      const readableError = getReadableErrorMessage(err);

      if (readableError === DUPLICATE_EMAIL_ERROR) {
        setDuplicateEmailModalOpen(true);
        return;
      }

      setSubmitError(readableError);
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

  const handleUnsubscribe = async () => {
    if (!unsubscribeToken) {
      setUnsubscribeState("error");
      setUnsubscribeError(INVALID_UNSUBSCRIBE_TOKEN_ERROR);
      return;
    }

    setUnsubscribeState("submitting");
    setUnsubscribeError("");

    try {
      await unsubscribeByToken({ token: unsubscribeToken });
      setUnsubscribeState("success");
    } catch (err: unknown) {
      setUnsubscribeState("error");
      setUnsubscribeError(getReadableErrorMessage(err));
    }
  };

  if (isUnsubscribePage) {
    return (
      <div className="page">
        <div className="card confirmation unsubscribe-card">
          {unsubscribeState === "success" ? (
            <>
              <h1 className="headline">You're unsubscribed.</h1>
              <p className="body">
                You won't receive any more sunset alerts from Look West.
              </p>
              <p className="body dim">
                If you change your mind later, you can sign up again from the home page.
              </p>
              <a href="/" className="link-btn unsubscribe-home-link">
                Back to Look West
              </a>
            </>
          ) : (
            <>
              <h1 className="headline">Unsubscribe from alerts?</h1>
              <p className="body">
                Confirm below to stop receiving sunset alert emails for this address.
              </p>
              <p className="body dim">
                This action is one-way, but you can always sign up again later.
              </p>
              {unsubscribeError && <p className="field-error">{unsubscribeError}</p>}
              <button
                type="button"
                className="submit-btn"
                onClick={handleUnsubscribe}
                disabled={unsubscribeState === "submitting"}
              >
                {unsubscribeState === "submitting" ? (
                  <>
                    <span className="spinner" />
                    <span>Unsubscribing...</span>
                  </>
                ) : (
                  "Unsubscribe"
                )}
              </button>
              <a href="/" className="link-btn unsubscribe-home-link">
                Keep my alerts
              </a>
            </>
          )}
        </div>
      </div>
    );
  }

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
          <div className="confirmation-links">
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
            <a
              href="https://buymeacoffee.com/sebastianbrookes"
              target="_blank"
              rel="noopener noreferrer"
              className="link-btn"
            >
              Buy me a coffee
            </a>
          </div>
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
                    resolveManualLocation();
                  }
                }}
                onBlur={resolveManualLocation}
                disabled={geocoding || browserGeoStatus === "requesting"}
                autoComplete="address-level2"
                enterKeyHint="search"
                aria-invalid={!!geocodeError}
                aria-describedby={geocodeError ? "location-geocode-error" : undefined}
              />
              {geocoding && <span className="input-spinner" aria-hidden />}
              {!geocoding && locationData && <CheckIcon />}
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
                onBlur={() => {
                  setNameConfirmed(name.trim().length >= 2);
                }}
                autoComplete="given-name"
                enterKeyHint="next"
              />
              {nameConfirmed && <CheckIcon />}
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
                  setEmailConfirmed(false);
                  setEmailError("");
                }}
                onBlur={() => {
                  setEmailConfirmed(validateEmail(email));
                }}
                autoComplete="email"
                enterKeyHint="done"
              />
              {!emailError && emailConfirmed && <CheckIcon />}
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

      {duplicateEmailModalOpen && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={closeDuplicateEmailModal}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="duplicate-email-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title" id="duplicate-email-title">
              Email already registered
            </h2>
            <p className="modal-body">
              That email is already registered with an active account.
            </p>
            <button
              type="button"
              className="modal-btn"
              onClick={closeDuplicateEmailModal}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
