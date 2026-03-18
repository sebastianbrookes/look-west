import { useState, useEffect, useCallback } from "react";
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

type LocationState =
  | { status: "loading" }
  | { status: "resolved"; data: LocationData }
  | { status: "denied" }
  | { status: "error"; message: string };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const NOMINATIM_HEADERS = { "User-Agent": "GoLookUp/1.0" };

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
    // Last resort: grab the first meaningful part of display_name
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

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function App() {
  /* ---- state ---- */
  const [location, setLocation] = useState<LocationState>({
    status: "loading",
  });
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [confirmedLocation, setConfirmedLocation] = useState("");

  const addUser = useMutation(api.users.addUser);

  /* ---- geolocation on mount ---- */
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation({ status: "denied" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
            { headers: NOMINATIM_HEADERS }
          );
          const data = await res.json();
          setLocation({
            status: "resolved",
            data: {
              latitude,
              longitude,
              locationName: parseAddress(data.address || {}, data.display_name),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
          });
        } catch {
          setLocation({
            status: "error",
            message: "Couldn't determine your location.",
          });
        }
      },
      () => setLocation({ status: "denied" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  /* ---- manual geocode ---- */
  const geocodeManual = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setGeocoding(true);
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
        setLocation({
          status: "error",
          message: "Couldn't find that location. Try a city name or zip code.",
        });
        return;
      }
      const r = results[0];
      setLocation({
        status: "resolved",
        data: {
          latitude: parseFloat(r.lat),
          longitude: parseFloat(r.lon),
          locationName: parseAddress(r.address || {}, r.display_name),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      setShowManualInput(false);
    } catch {
      setLocation({
        status: "error",
        message: "Something went wrong looking up that location.",
      });
    } finally {
      setGeocoding(false);
    }
  }, []);

  /* ---- submit ---- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setEmailError("");

    if (location.status !== "resolved") {
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
        ...location.data,
      });
      setConfirmedEmail(email.trim());
      setConfirmedLocation(location.data.locationName);
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

  /* ---- copy link ---- */
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
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
            We'll email you at <strong>{confirmedEmail}</strong> whenever the sky
            above <strong>{confirmedLocation}</strong> is about to put on a show.
          </p>
          <p className="body dim">
            Your first alert could come as early as tonight.
          </p>
          <button type="button" className="link-btn" onClick={copyLink}>
            Tell a friend — copy link
          </button>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Sign-up form                                                     */
  /* ================================================================ */

  const showManual =
    showManualInput ||
    location.status === "denied" ||
    location.status === "error";

  return (
    <div className="page">
      <div className="card">
        <h1 className="headline">Go Look Up</h1>
        {/* <p className="quote">
          "One day I watched the sunset forty-four times..."
        </p> */}
        <p className="tagline">
          We'll email you when the sunset's worth watching.
        </p>

        <form onSubmit={handleSubmit} className="form">
          {/* ---------- location ---------- */}
          <div className="field">
            {location.status === "loading" && (
              <p className="finding">Finding you...</p>
            )}

            {location.status === "resolved" && !showManualInput && (
              <>
                <p className="location-label">
                  📍 {location.data.locationName}
                </p>
                <button
                  type="button"
                  className="link-btn small"
                  onClick={() => setShowManualInput(true)}
                >
                  Not right? Change location
                </button>
              </>
            )}

            {showManual && (
              <>
                {location.status === "error" && (
                  <p className="field-error">{location.message}</p>
                )}
                <input
                  type="text"
                  className="input"
                  placeholder="Enter your city or zip code"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      geocodeManual(manualQuery);
                    }
                  }}
                  onBlur={() => geocodeManual(manualQuery)}
                  disabled={geocoding}
                />
              </>
            )}
          </div>

          {/* ---------- name ---------- */}
          <div className="field">
            <input
              type="text"
              className="input"
              placeholder="Your first name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
            />
          </div>

          {/* ---------- email ---------- */}
          <div className="field">
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
            {emailError && <p className="field-error">{emailError}</p>}
          </div>

          {submitError && <p className="field-error">{submitError}</p>}

          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? "Signing up..." : "Sign me up"}
          </button>
        </form>
      </div>
    </div>
  );
}
