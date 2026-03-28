import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import tzLookup from "tz-lookup";

type LocationData = {
  latitude: number;
  longitude: number;
  locationName: string;
  timezone: string;
};

interface UseGooglePlacesAutocompleteOptions {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPlaceSelected: (data: LocationData) => void;
  onError: (msg: string) => void;
  ready?: boolean;
}

function resolveTimezone(lat: number, lon: number): string {
  try {
    return tzLookup(lat, lon);
  } catch {
    return "UTC";
  }
}

function parseGoogleAddress(place: google.maps.places.PlaceResult): string {
  const components = place.address_components || [];

  let city = "";
  let state = "";

  for (const component of components) {
    if (component.types.includes("locality")) {
      city = component.long_name;
    } else if (component.types.includes("sublocality_level_1") && !city) {
      city = component.long_name;
    } else if (component.types.includes("administrative_area_level_1")) {
      state = component.short_name;
    }
  }

  if (!city) {
    city = place.name || "Your area";
  }

  return state ? `${city}, ${state}` : city;
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

let configured = false;

function ensureConfigured() {
  if (!configured) {
    setOptions({ key: API_KEY, v: "weekly" });
    configured = true;
  }
}

export function useGooglePlacesAutocomplete({
  inputRef,
  onPlaceSelected,
  onError,
  ready = true,
}: UseGooglePlacesAutocompleteOptions): { loaded: boolean } {
  const [loaded, setLoaded] = useState(false);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  const onErrorRef = useRef(onError);

  onPlaceSelectedRef.current = onPlaceSelected;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!API_KEY || !inputRef.current || !ready) return;

    let cancelled = false;

    ensureConfigured();
    importLibrary("places")
      .then(() => {
        if (cancelled || !inputRef.current) return;

        const autocomplete = new google.maps.places.Autocomplete(
          inputRef.current,
          {
            types: ["(regions)"],
            fields: ["geometry", "name", "address_components"],
            bounds: new google.maps.LatLngBounds(
              { lat: 24.396, lng: -125.0 },
              { lat: 49.384, lng: -66.934 }
            ),
          }
        );

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();

          if (!place.geometry?.location) {
            onErrorRef.current(
              "Couldn't find that location. Please select from the dropdown."
            );
            return;
          }

          const latitude = place.geometry.location.lat();
          const longitude = place.geometry.location.lng();
          const locationName = parseGoogleAddress(place);
          const timezone = resolveTimezone(latitude, longitude);

          onPlaceSelectedRef.current({
            latitude,
            longitude,
            locationName,
            timezone,
          });
        });

        autocompleteRef.current = autocomplete;
        setLoaded(true);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[Places] Failed to load Google Maps API:", err);
          setLoaded(false);
        }
      });

    return () => {
      cancelled = true;
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [inputRef, ready]);

  return { loaded };
}
