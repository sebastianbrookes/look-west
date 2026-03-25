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
/*  Sample email data                                                  */
/* ------------------------------------------------------------------ */

const SAMPLE_EMAILS = [
  {
    type: "alert",
    subject: "Tonight's sunset in Cape Cod, MA",
    location: "Cape Cod, MA",
    time: "7:04 PM",
    quality: "Great",
    qualityScore: 88,
    message:
      "Clouds are sitting at about 45% tonight \u2014 perfect for some color. Sun drops at 7:04 but worth heading out around 6:30 to catch the good stuff. It's hovering at 49\u00b0 so bring something with sleeves.",
  },
  {
    type: "alert",
    subject: "Sunset alert for Brooklyn, NY",
    location: "Brooklyn, NY",
    time: "7:18 PM",
    quality: "Good",
    qualityScore: 72,
    message:
      "Clouds are hanging around at 35% coverage tonight \u2014 should catch some color when the sun drops at 7:18. Get to your spot by 6:48 if you can. 58 degrees so you won't need much of a jacket.",
  },
  {
    type: "alert",
    subject: "San Francisco, CA — sunset at 7:31 PM",
    location: "San Francisco, CA",
    time: "7:31 PM",
    quality: "Fair",
    qualityScore: 63,
    message:
      "Clear skies tonight with sunset at 7:31 \u2014 should be a straightforward one, probably worth getting to a west-facing spot by 7. Nice evening at 61 degrees, light jacket should do it.",
  },
];

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

    if (navigator.permissions) {
      try {
        const perm = await navigator.permissions.query({ name: "geolocation" });
        if (perm.state === "denied") {
          setBrowserGeoStatus("denied");
          return;
        }
      } catch {
        // permissions.query not supported
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
      /* clipboard may not be available */
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

  /* ================================================================ */
  /*  Unsubscribe page                                                 */
  /* ================================================================ */

  if (isUnsubscribePage) {
    return (
      <div className="page">
        <div className="page-left">
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
                  You can always sign up again later.
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
        <div className="page-right" aria-hidden="true">
          <img src="/background.webp" alt="" className="hero-image" />
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
        <div className="page-left">
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
            </div>
          </div>
        </div>
        <div className="page-right" aria-hidden="true">
          <img src="/background.webp" alt="" className="hero-image" />
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Main landing page                                                */
  /* ================================================================ */

  return (
    <>
      {/* ---- Hero section ---- */}
      <section className="hero">
        <div className="hero-left">
          <div className="hero-content">
            <h1 className="hero-title">Look West</h1>
            <p className="hero-subtitle">
              Get an email whenever the sunset in your area is predicted to be beautiful.
            </p>

            <form onSubmit={handleSubmit} className="hero-form">
            {/* location */}
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
                      Finding you...
                    </>
                  ) : (
                    "Use my current location"
                  )}
                </button>
              )}
            </div>

            {/* name */}
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

            {/* email */}
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

          <p className="hero-fine-print">Free forever. Unsubscribe anytime.</p>
          </div>

          <a href="#how-it-works" className="scroll-hint" aria-label="Scroll to learn more">
            <span className="scroll-hint-text">See how it works</span>
            <svg className="scroll-hint-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </a>
        </div>

        <div className="hero-right" aria-hidden="true">
          <img src="/background.webp" alt="" className="hero-image" />
        </div>
      </section>

      {/* ---- Sample emails section ---- */}
      <section id="how-it-works" className="section section-emails">
        <div className="section-inner">
          <h2 className="section-title">What you'll get</h2>
          <p className="section-desc">
            When conditions are right, you'll receive an email like one of these. Each alert includes your local sunset time and a brief, AI-written note about what to expect in the sky.
          </p>

          <div className="email-samples">
            {SAMPLE_EMAILS.map((sample, i) => (
              <div className="email-card" key={i}>
                <div className="email-header">
                  <div className="email-subject">{sample.subject}</div>
                </div>
                <div className="email-gradient-strip" />
                <div className="email-body">
                  {sample.type === "alert" && (
                    <div className="email-pills">
                      <span className="email-pill">{sample.location}</span>
                      <span className="email-pill">{sample.time}</span>
                      <span className={`email-pill email-pill-${sample.quality?.toLowerCase()}`}>
                        {sample.quality} ({sample.qualityScore}%)
                      </span>
                    </div>
                  )}
                  <p className="email-message">{sample.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Scoring methodology section ---- */}
      <section className="section section-scoring">
        <div className="section-inner">
          <h2 className="section-title">How we predict beautiful sunsets</h2>
          <p className="section-desc">
            We use{" "}
            <a
              href="https://sunsethue.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              SunsetHue
            </a>{" "}
            to score each evening's sunset potential on a 0-100 scale. Their model analyzes atmospheric conditions like cloud cover, humidity, visibility, and air quality to predict how colorful and vivid the sunset will be.
          </p>

          <div className="scoring-grid">
            <div className="scoring-card">
              <div className="scoring-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                </svg>
              </div>
              <h3 className="scoring-card-title">Cloud cover</h3>
              <p className="scoring-card-desc">
                Partial clouds (30-70%) are ideal. They catch and scatter light, painting the sky in vivid oranges and pinks. Too few or too many mute the display.
              </p>
            </div>

            <div className="scoring-card">
              <div className="scoring-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
                </svg>
              </div>
              <h3 className="scoring-card-title">Humidity</h3>
              <p className="scoring-card-desc">
                Moderate humidity (40-70%) produces the richest colors. Water vapor in the air scatters shorter wavelengths, letting warm reds and oranges dominate.
              </p>
            </div>

            <div className="scoring-card">
              <div className="scoring-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" /><path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" /><path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
                </svg>
              </div>
              <h3 className="scoring-card-title">Visibility</h3>
              <p className="scoring-card-desc">
                Higher visibility means a cleaner light path from the horizon. This lets sunlight travel through more atmosphere, deepening the color spectrum.
              </p>
            </div>

            <div className="scoring-card">
              <div className="scoring-icon scoring-icon-aqi">
                <svg width="24" height="24" viewBox="35 35 135 125" fill="none">
                  <path d="m94.17 40.42c-0.87-0.91-2.7-0.17-2.26 1.6 0.13 0.53 0.94 1.47 4.92 5.89-26.53-0.13-44.13 16.7-50.84 34.38-5.35 14.23-4.41 31.62 2.93 47.88 0.61 1.36 1.26 2.99 2.66 3.32 1.61 0.42 3.24-1.26 2.3-2.97-8.14-12.17-10.16-29.36-5-43.46 7.13-19.78 24.21-34.78 48.28-35.03l-4.34 4.47c-0.94 0.98-0.64 1.88 0.04 2.49 0.72 0.62 1.7 0.49 2.4-0.26l7.55-7.55c0.9-0.9 0.9-1.96 0-2.81l-8.64-7.95z" fill="currentColor"/>
                  <path d="m141.9 73.59c-0.79-1.28-3.39-1.28-3.18 1.27 0.08 0.9 0.38 1.11 1.23 2.51 7 11.4 8.48 22.01 6.75 33.92-0.17 1.19 0.17 2.09 1.48 2.22 1.44 0.17 1.92-1.15 2-1.9 1.69-12.57-0.6-25.19-8.28-38.02z" fill="currentColor"/>
                  <path d="m130.3 66.21c-0.43-0.39-0.96-0.47-1.66-0.47-18.5 0.3-36.69 4.28-47.75 13.05-13.88 11.13-16.38 26.96-12.75 48.6-5.55 7.38-8.05 14.5-1.54 19.89 8.34 6.4 19.55 9.59 30.85 9.59 7.56-0.34 13.66-1.82 19.26-3.77 1.71-0.72 1.93-1.82 1.18-2.89-0.84-0.98-2.15-0.22-2.32-0.13-14.01 4.93-30.48 4.63-43.4-3.75-6.01-3.11-6.95-7.62-0.86-15.87 18.63 2.9 32.13-0.38 42.48-11.04 12.08-12.14 17.47-31.23 17.13-51.81 0-0.53-0.17-1.02-0.62-1.4zm-19.58 50.4c-9.11 9.1-20.57 11.96-37.17 9.9l9.36-11.03c8.73-2.55 14.61-3.4 23.38-2.42 1.36 0.13 2.16-0.85 2.08-1.95-0.13-1.27-1.15-1.75-2.42-1.84-6.09-0.61-10.69-0.04-18.74 1.06l11.46-12.09c5.39-1.11 9.11-2 16.23-1.02 1.35 0.17 2.05-1.11 1.92-1.96-0.17-1.4-1.23-1.74-2.17-1.82-3.8-0.39-7.43-0.17-11.25 0.49l11.46-10.66c0.89-0.89 0.89-1.96 0.23-2.66-0.75-0.85-1.89-0.68-2.64 0.17l-11.81 11.81c0.48-3.95 0.44-5.86 0.05-10.17-0.17-1.55-1.02-2.03-2.24-1.9-1.1 0.21-1.54 1.11-1.41 2.38 0.61 4.22-0.25 8.86-0.91 13.09l-10.61 11.59c0.85-6.67 0.68-9.17-0.07-15.57-0.21-1.49-1.01-2.1-2.24-1.89-1.1 0.26-1.53 1.2-1.36 2.52 0.94 6.67 0.45 12.27-1.41 20.7l-9.14 10.65c-3.58-17.55 0.26-32.23 12.12-42.36 10.52-8.64 25.93-12.31 44.34-12.65 0.49 16.26-4.02 34.8-17.04 47.63z" fill="currentColor"/>
                  <path d="m116.3 126.2c-2.68 0-2.55 3.9-0.05 3.9h18.93c5.03 0 7.32-4.28 7.32-6.7 0-4.89-3.67-7.62-7.45-7.62-4.33 0-6.84 3.24-7.05 6.56-0.08 2.15 3.81 2.53 3.9 0.21 0.17-2.42 1.71-3.44 3.5-3.44 2.63 0 3.47 2.14 3.47 3.99 0 1.82-1.71 3.1-3.77 3.1h-18.8z" fill="currentColor"/>
                  <path d="m116.6 141c-2.59 0-2.42 3.62-0.09 3.62h26.2c3.11 0 3.91 2.42 3.91 3.36 0 1.95-1.59 3.3-3.42 3.3-1.85 0-2.74-1.02-3.13-2.5-0.57-2.34-4.47-1.49-4.29 0.52 0.43 3.8 3.85 5.47 6.93 5.47 4.59 0 6.8-3.79 6.8-6.54 0-4.32-3.54-7.23-7.1-7.23h-25.81z" fill="currentColor"/>
                  <path d="m110.8 133.7c-2.06 0-2.36 3.41 0.08 3.41h40.37c6.05 0 8.3-5.35 8.3-7.85 0-4.55-3.71-8.01-7.65-8.01-4.76 0-6.97 3.63-7.27 7.29-0.13 2.06 3.67 2.28 3.75 0.18 0.17-2.5 1.93-3.89 3.76-3.89 2.94 0 4.16 2.33 4.16 4.18 0 2.5-1.95 4.69-5.02 4.69h-40.48z" fill="currentColor"/>
                </svg>
              </div>
              <h3 className="scoring-card-title">Air quality</h3>
              <p className="scoring-card-desc">
                A slight haze can actually enhance colors by adding an extra scattering layer. But heavy pollution washes everything out into a dull gray.
              </p>
            </div>
          </div>

          <div className="scoring-scale">
            <h3 className="scoring-scale-title">Quality ratings</h3>
            <div className="scoring-scale-items">
              <div className="scoring-scale-item">
                <span className="scoring-dot scoring-dot-poor" />
                <span className="scoring-label">Poor</span>
                <span className="scoring-range">0 - 25</span>
              </div>
              <div className="scoring-scale-item">
                <span className="scoring-dot scoring-dot-fair" />
                <span className="scoring-label">Fair</span>
                <span className="scoring-range">26 - 50</span>
              </div>
              <div className="scoring-scale-item">
                <span className="scoring-dot scoring-dot-good" />
                <span className="scoring-label">Good</span>
                <span className="scoring-range">51 - 75</span>
              </div>
              <div className="scoring-scale-item">
                <span className="scoring-dot scoring-dot-great" />
                <span className="scoring-label">Great</span>
                <span className="scoring-range">76 - 100</span>
              </div>
            </div>
            <p className="scoring-threshold">
              We only send an alert when the score is <strong>40 or above</strong>, so you won't hear from us on dull evenings.
            </p>
          </div>

          <p className="scoring-cta">
            Want to dig deeper?{" "}
            <a
              href="https://sunsethue.com/whitepaper"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              Read about SunsetHue's methodology
            </a>
          </p>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="site-footer">
        <p>
          Made with care by Sebastian Brookes
          <span className="footer-divider">|</span>
          <a
            href="https://buymeacoffee.com/sebastianbrookes"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            Buy me a coffee
          </a>
        </p>
      </footer>

      {/* ---- Duplicate email modal ---- */}
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
    </>
  );
}
