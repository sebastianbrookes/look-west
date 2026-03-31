import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import tzLookup from "tz-lookup";
import { api } from "../convex/_generated/api";
import { useGooglePlacesAutocomplete } from "./useGooglePlacesAutocomplete";
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
const DUPLICATE_EMAIL_ERROR = "Account already active";
const GENERIC_ERROR = "Something went wrong. Please try again.";
const GENERIC_SUBMIT_ERROR =
  "We couldn't complete your sign-up right now. Please try again in a moment.";
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

function getReadableErrorMessage(
  err: unknown,
  fallback = GENERIC_ERROR
): string {
  if (err instanceof ConvexError) {
    return typeof err.data === "string" ? err.data : fallback;
  }
  return fallback;
}

function getUnsubscribeTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("token")?.trim() ?? "";
}

function CheckIcon({ visible = false }: { visible?: boolean }) {
  return (
    <svg
      className={`input-check${visible ? " input-check-visible" : ""}`}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
    >
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
    subject: "Sunset at 6:46 PM in Brooklyn, NY",
    location: "📍 Brooklyn, NY",
    time: "🌅 6:46 PM",
    quote: "Can you see the sunset real good on the West side? You can see it on the East side too.",
    attribution: "— S.E. Hinton, The Outsiders",
    metadata: "View at 6:16 PM  ·  34°F  ·  Quality 48%",
  },
  {
    type: "alert",
    subject: "Sunset at 7:04 PM in Boston, MA",
    location: "📍 Boston, MA",
    time: "🌅 7:04 PM",
    quote: "Then they lay on the pier and drank cheap sodas and watched the sun set for free.",
    attribution: "— Fredrik Backman, My Friends",
    metadata: "View at 6:34 PM  ·  37°F  ·  Quality 72%",
  },
  {
    type: "alert",
    subject: "Sunset at 7:28 PM in San Francisco",
    location: "📍 San Francisco, CA",
    time: "🌅 7:28 PM",
    quote: "It does no harm to the romance of the sunset to know a little about it.",
    attribution: "— Carl Sagan, Pale Blue Dot",
    metadata: "View at 6:58 PM  ·  61°F  ·  Quality 64%",
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function App() {
  const isUnsubscribePage = window.location.pathname === "/unsubscribe";
  const isConfirmPage = window.location.pathname === "/confirm";
  const isChangeLocationPage = window.location.pathname === "/change-location";
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
  const locationInputRef = useRef<HTMLInputElement>(null);
  const locationDataRef = useRef(locationData);
  const locationInputValueRef = useRef(locationInput);
  const locationBlurTimeoutRef = useRef<number | null>(null);
  const locationResolutionInFlightRef = useRef<{
    promise: Promise<LocationData | null>;
    forValue: string;
  } | null>(null);
  locationDataRef.current = locationData;
  locationInputValueRef.current = locationInput;
  const [unsubscribeState, setUnsubscribeState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [unsubscribeError, setUnsubscribeError] = useState("");
  const [confirmState, setConfirmState] = useState<
    "loading" | "success" | "error"
  >("loading");
  const [confirmError, setConfirmError] = useState("");
  const [changeLocationState, setChangeLocationState] = useState<
    "loading" | "idle" | "submitting" | "success" | "error"
  >("loading");
  const [changeLocationError, setChangeLocationError] = useState("");
  const [currentLocationName, setCurrentLocationName] = useState("");
  const [updatedLocationName, setUpdatedLocationName] = useState("");

  const addUser = useMutation(api.users.addUser);
  const unsubscribeByToken = useMutation(api.users.unsubscribeByToken);
  const confirmByToken = useMutation(api.users.confirmByToken);
  const updateLocationByToken = useMutation(api.users.updateLocationByToken);
  const getUserLocationByToken = useMutation(api.users.getUserLocationByToken);

  const { loaded: placesLoaded, resolveTypedLocation } = useGooglePlacesAutocomplete({
    inputRef: locationInputRef,
    onPlaceSelected: (data) => {
      setLocationData(data);
      setLocationInput(data.locationName);
      setGeocodeError(null);
    },
    onError: (msg) => {
      setGeocodeError(msg);
    },
    ready: !isChangeLocationPage || changeLocationState === "idle" || changeLocationState === "submitting",
  });

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

  const geocodeManual = useCallback(async (q: string): Promise<LocationData | null> => {
    const trimmed = q.trim();
    if (!trimmed) return null;

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
      return null;
    }
    const r = results[0];
    const latitude = parseFloat(r.lat);
    const longitude = parseFloat(r.lon);
    return {
      latitude,
      longitude,
      locationName: parseAddress(r.address || {}, r.display_name),
      timezone: resolveTimezone(latitude, longitude),
    };
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

  const clearLocationBlurTimeout = useCallback(() => {
    if (locationBlurTimeoutRef.current !== null) {
      window.clearTimeout(locationBlurTimeoutRef.current);
      locationBlurTimeoutRef.current = null;
    }
  }, []);

  const resolveLocationInput = useCallback(
    async (value?: string): Promise<LocationData | null> => {
      const trimmed = (value ?? locationInputValueRef.current).trim();

      if (!trimmed) {
        setLocationData(null);
        setGeocodeError(null);
        return null;
      }

      const normalizedGeocodedLocation =
        locationDataRef.current?.locationName.trim().toLowerCase() ?? "";
      if (trimmed.toLowerCase() === normalizedGeocodedLocation) {
        return locationDataRef.current;
      }

      if (locationResolutionInFlightRef.current?.forValue === trimmed) {
        return locationResolutionInFlightRef.current.promise;
      }

      const resolutionPromise = (async () => {
        setGeocoding(true);
        setGeocodeError(null);

        try {
          const googleResolved = placesLoaded
            ? await resolveTypedLocation(trimmed)
            : null;
          const resolved = googleResolved ?? (await geocodeManual(trimmed));

          if (!resolved) {
            setLocationData(null);
            setGeocodeError(
              "Couldn't find that location. Try a city name or zip code."
            );
            return null;
          }

          setLocationData(resolved);
          setLocationInput(resolved.locationName);
          return resolved;
        } catch {
          setLocationData(null);
          setGeocodeError("Something went wrong looking up that location.");
          return null;
        } finally {
          locationResolutionInFlightRef.current = null;
          setGeocoding(false);
        }
      })();

      locationResolutionInFlightRef.current = { promise: resolutionPromise, forValue: trimmed };
      return resolutionPromise;
    },
    [geocodeManual, placesLoaded, resolveTypedLocation]
  );

  const scheduleLocationResolution = useCallback(() => {
    clearLocationBlurTimeout();
    locationBlurTimeoutRef.current = window.setTimeout(() => {
      void resolveLocationInput();
    }, placesLoaded ? 200 : 0);
  }, [clearLocationBlurTimeout, placesLoaded, resolveLocationInput]);

  const closeDuplicateEmailModal = useCallback(() => {
    setDuplicateEmailModalOpen(false);
  }, []);

  useEffect(() => clearLocationBlurTimeout, [clearLocationBlurTimeout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setEmailError("");
    setDuplicateEmailModalOpen(false);

    const resolvedLocation = await resolveLocationInput();

    if (!resolvedLocation) {
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
        ...resolvedLocation,
      });
      setConfirmedEmail(email.trim());
      setConfirmedLocation(resolvedLocation.locationName);
      setSubmitted(true);
    } catch (err: unknown) {
      const readableError = getReadableErrorMessage(err, GENERIC_SUBMIT_ERROR);

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
  /*  Change-location page                                             */
  /* ================================================================ */

  useEffect(() => {
    if (!isChangeLocationPage) return;
    if (!unsubscribeToken) {
      setChangeLocationState("error");
      setChangeLocationError("Invalid change-location link.");
      return;
    }

    getUserLocationByToken({ token: unsubscribeToken })
      .then((result) => {
        setCurrentLocationName(result.locationName);
        setChangeLocationState("idle");
      })
      .catch((err: unknown) => {
        setChangeLocationState("error");
        setChangeLocationError(getReadableErrorMessage(err));
      });
  }, [isChangeLocationPage, unsubscribeToken, getUserLocationByToken]);

  const handleChangeLocation = async () => {
    if (!unsubscribeToken) return;

    const resolvedLocation = await resolveLocationInput();
    if (!resolvedLocation) return;

    setChangeLocationState("submitting");
    setChangeLocationError("");
    try {
      await updateLocationByToken({
        token: unsubscribeToken,
        ...resolvedLocation,
      });
      setUpdatedLocationName(resolvedLocation.locationName);
      setChangeLocationState("success");
    } catch (err: unknown) {
      setChangeLocationState("idle");
      setChangeLocationError(getReadableErrorMessage(err));
    }
  };

  if (isChangeLocationPage) {
    const isSubmitting = changeLocationState === "submitting";

    return (
      <div className="page">
        <div className="page-left">
          <div className="card confirmation change-location-card">
            {changeLocationState === "loading" && (
              <>
                <div className="skeleton skeleton-headline" />
                <div className="skeleton skeleton-body" />
                <div className="skeleton skeleton-body skeleton-body-short" />
                <div className="skeleton skeleton-input" />
                <div className="skeleton skeleton-btn" />
              </>
            )}
            {(changeLocationState === "idle" || isSubmitting) && (
              <>
                <h1 className="headline">Change your location</h1>
                <p className="body">
                  You're currently receiving sunset alerts for{" "}
                  <strong>{currentLocationName}</strong>.
                  Enter a new location below.
                </p>

                <div className="field field-location">
                  <div className="input-with-icon">
                    <input
                      ref={locationInputRef}
                      type="text"
                      className="input"
                      name="location"
                      placeholder="City or zip code"
                      value={locationInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLocationInput(v);
                        setGeocodeError(null);
                        if (!v.trim()) setLocationData(null);
                        else if (locationData && v !== locationData.locationName) {
                          setLocationData(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void resolveLocationInput(e.currentTarget.value);
                        }
                      }}
                      onBlur={scheduleLocationResolution}
                      disabled={isSubmitting || geocoding || browserGeoStatus === "requesting"}
                      autoComplete="off"
                      aria-invalid={!!geocodeError}
                      aria-describedby={geocodeError ? "location-geocode-error" : undefined}
                    />
                    {geocoding && <span className="input-spinner" aria-hidden />}
                    <CheckIcon visible={!geocoding && !!locationData} />
                  </div>
                  {geocodeError && (
                    <p className="field-error" id="location-geocode-error">{geocodeError}</p>
                  )}
                  {browserGeoStatus === "denied" && !locationData && (
                    <p className="field-hint field-hint-denied">
                      <span>Your browser blocked us :/</span>
                      <span>Enter your city or ZIP code above instead.</span>
                    </p>
                  )}
                  {browserGeoStatus !== "unsupported" && browserGeoStatus !== "denied" && !locationData && !isSubmitting && (
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

                {changeLocationError && <p className="field-error">{changeLocationError}</p>}

                <button
                  type="button"
                  className="submit-btn"
                  onClick={handleChangeLocation}
                  disabled={
                    !locationInput.trim() ||
                    isSubmitting ||
                    geocoding ||
                    browserGeoStatus === "requesting"
                  }
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner" />
                      <span>Updating…</span>
                    </>
                  ) : (
                    "Update location"
                  )}
                </button>
                <a href="/" className="link-btn unsubscribe-home-link">
                  Back to Look West
                </a>
              </>
            )}
            {changeLocationState === "success" && (
              <>
                <div className="confirm-check" aria-hidden>
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="16" fill="#F9DE8E" />
                    <path
                      d="M10 16.4L14.2 20.6L22 11.5"
                      stroke="#5c4030"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h1 className="headline">Location updated!</h1>
                <p className="body">
                  You'll now receive sunset alerts for{" "}
                  <strong>{updatedLocationName}</strong>.
                </p>
                <a href="/" className="link-btn unsubscribe-home-link">
                  Back to Look West
                </a>
              </>
            )}
            {changeLocationState === "error" && (
              <>
                <h1 className="headline">Something went wrong</h1>
                <p className="body">{changeLocationError}</p>
                <a href="/" className="link-btn unsubscribe-home-link">
                  Back to Look West
                </a>
              </>
            )}
          </div>
        </div>
        <div className="page-right" aria-hidden="true">
          <img src="/background.webp" alt="" className="hero-image" width={1920} height={1280} fetchPriority="high" />
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Confirm page — auto-fires on mount                              */
  /* ================================================================ */

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!isConfirmPage) return;

    if (!unsubscribeToken) {
      setConfirmState("error");
      setConfirmError("Invalid confirmation link.");
      return;
    }

    confirmByToken({ token: unsubscribeToken })
      .then(() => setConfirmState("success"))
      .catch((err: unknown) => {
        setConfirmState("error");
        setConfirmError(getReadableErrorMessage(err));
      });
  }, [isConfirmPage, unsubscribeToken, confirmByToken]);

  if (isConfirmPage) {
    return (
      <div className="page">
        <div className="page-left">
          <div className="card confirmation">
            {confirmState === "loading" && (
              <>
                <h1 className="headline">Confirming…</h1>
                <p className="body">
                  <span className="spinner" /> Verifying your email…
                </p>
              </>
            )}
            {confirmState === "success" && (
              <>
                <div className="confirm-check" aria-hidden>
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="16" fill="#F9DE8E" />
                    <path
                      d="M10 16.4L14.2 20.6L22 11.5"
                      stroke="#5c4030"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h1 className="headline">You're confirmed!</h1>
                <p className="body">
                  You're all set to receive sunset alerts from Look West.
                </p>
                <p className="body dim">
                  Your first alert could come as early as tonight.
                </p>
                <a href="/" className="link-btn unsubscribe-home-link">
                  Back to Look West
                </a>
              </>
            )}
            {confirmState === "error" && (
              <>
                <h1 className="headline">Confirmation failed</h1>
                <p className="body">{confirmError}</p>
                <a href="/" className="link-btn unsubscribe-home-link">
                  Back to Look West
                </a>
              </>
            )}
          </div>
        </div>
        <div className="page-right" aria-hidden="true">
          <img src="/background.webp" alt="" className="hero-image" width={1920} height={1280} fetchPriority="high" />
        </div>
      </div>
    );
  }

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
                      <span>Unsubscribing…</span>
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
          <img src="/background.webp" alt="" className="hero-image" width={1920} height={1280} fetchPriority="high" />
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
            <h1 className="headline">Check your email.</h1>
            <p className="body">
              We sent a confirmation link to <strong>{confirmedEmail}</strong>.
              You won't receive sunset alerts for{" "}
              <strong>{confirmedLocation}</strong> until you confirm your email.
            </p>
            <div className="confirmation-links">
              <a href="/" className="link-btn">
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
                  <path d="M19 12H5" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to homepage
              </a>
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
          <img src="/background.webp" alt="" className="hero-image" width={1920} height={1280} fetchPriority="high" />
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
              Get an email whenever the sunset in your location is worth seeing. Includes a curated quote.
            </p>

            <form onSubmit={handleSubmit} className="hero-form">
            {/* location */}
            <div className="field field-location">
              <div className="input-with-icon">
                <input
                  ref={locationInputRef}
                  id="location-input"
                  type="text"
                  className="input"
                  name="location"
                  placeholder="City or zip code"
                  value={locationInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLocationInput(v);
                    setGeocodeError(null);
                    if (!v.trim()) setLocationData(null);
                    else if (locationData && v !== locationData.locationName) {
                      setLocationData(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void resolveLocationInput(e.currentTarget.value);
                    }
                  }}
                  onBlur={scheduleLocationResolution}
                  disabled={geocoding || browserGeoStatus === "requesting"}
                  autoComplete="off"
                  aria-invalid={!!geocodeError}
                  aria-describedby={geocodeError ? "location-geocode-error" : undefined}
                />
                {geocoding && <span className="input-spinner" aria-hidden />}
                <CheckIcon visible={!geocoding && !!locationData} />
              </div>
              {geocodeError && (
                <p className="field-error" id="location-geocode-error">{geocodeError}</p>
              )}
              {browserGeoStatus === "denied" && !locationData && (
                <p className="field-hint field-hint-denied">
                  <span>Your browser blocked us :/</span>
                  <span>Enter your city or ZIP code above instead.</span>
                </p>
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

            {/* name */}
            <div className="field">
              <div className="input-with-icon">
                <input
                  type="text"
                  className="input"
                  name="given-name"
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
                <CheckIcon visible={nameConfirmed} />
              </div>
            </div>

            {/* email */}
            <div className="field">
              <div className="input-with-icon">
                <input
                  type="email"
                  className={`input${emailError ? " input-error" : ""}`}
                  name="email"
                  placeholder="Email address"
                  spellCheck={false}
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
                <CheckIcon visible={!emailError && emailConfirmed} />
              </div>
              {emailError && <p className="field-error">{emailError}</p>}
            </div>

            {submitError && <p className="field-error">{submitError}</p>}

            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner" />
                  <span>Signing up…</span>
                </>
              ) : (
                "Sign me up"
              )}
            </button>
          </form>

          <p className="hero-fine-print">Unsubscribe anytime. Made by{" "}
            <a
              href="https://www.linkedin.com/in/sebastian-brookes/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              Sebastian Brookes
            </a>.</p>
          </div>

          <a href="#how-it-works" className="scroll-hint" aria-label="Scroll to learn more">
            <span className="scroll-hint-text">See how it works</span>
            <svg className="scroll-hint-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </a>
        </div>

        <div className="hero-right" aria-hidden="true">
          <img src="/background.webp" alt="" className="hero-image" width={1920} height={1280} fetchPriority="high" />
        </div>
      </section>

      {/* ---- Sample emails section ---- */}
      <section id="how-it-works" className="section section-emails">
        <div className="section-inner">
          <h2 className="section-title">What you'll get</h2>
          <p className="section-desc">
            When conditions are right, you'll receive an email like one of these — a sunset quote paired with your local conditions.
          </p>

          <div className="email-samples">
            {SAMPLE_EMAILS.map((sample, i) => (
              <div className="email-card" key={i}>
                <div className="email-header">
                  <div className="email-subject">{sample.subject}</div>
                </div>
                <div className="email-gradient-strip" />
                <div className="email-body">
                  <div className="email-pills">
                    <span className="email-pill">{sample.location}</span>
                    <span className="email-pill">{sample.time}</span>
                  </div>
                  <p className="email-quote">{"\u201c"}{sample.quote}{"\u201d"}</p>
                  <p className="email-attribution">{sample.attribution}</p>
                  <div className="email-divider" />
                  <p className="email-metadata">{sample.metadata}</p>
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
            to score each evening's sunset potential on a 0-100 scale. Their model casts virtual rays through the atmosphere to calculate how much sunlight can reach clouds and reflect back toward you, producing a quality score grounded in physics.
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
                The model calculates a reflection potential for each cloud cell — how much incoming sunlight it can catch and bounce back toward you.
              </p>
            </div>

            <div className="scoring-card">
              <div className="scoring-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 20l5-16 5 16" /><path d="M4 16h16" />
                </svg>
              </div>
              <h3 className="scoring-card-title">Cloud height</h3>
              <p className="scoring-card-desc">
                Mid- and high-altitude clouds are more potent reflectors at sunset. They sit above the shadow line, catching light that lower clouds can't.
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
                High surface humidity reduces visibility, so the score is adjusted down. Clearer air means more of the reflected color reaches your eyes.
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
              <h3 className="scoring-card-title">Seasonal duration</h3>
              <p className="scoring-card-desc">
                Longer sunsets — common at higher latitudes in summer and winter — give the sky more time to develop color, boosting the overall score.
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
              Account already active
            </h2>
            <p className="modal-body">
              That email is already connected to an active account.
            </p>
            <button
              type="button"
              className="modal-btn"
              onClick={closeDuplicateEmailModal}
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
