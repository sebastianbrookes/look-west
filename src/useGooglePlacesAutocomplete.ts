import { useCallback, useEffect, useRef, useState } from "react";
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
  let countryShort = "";
  let countryLong = "";

  for (const component of components) {
    if (component.types.includes("locality")) {
      city = component.long_name;
    } else if (component.types.includes("sublocality_level_1") && !city) {
      city = component.long_name;
    } else if (component.types.includes("administrative_area_level_1")) {
      state = component.short_name;
    } else if (component.types.includes("country")) {
      countryShort = component.short_name;
      countryLong = component.long_name;
    }
  }

  if (!city) {
    city = place.name || "Your area";
  }

  if (countryShort === "US") {
    return state ? `${city}, ${state}` : city;
  }

  return countryLong ? `${city}, ${countryLong}` : countryShort ? `${city}, ${countryShort}` : city;
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
const PLACE_FIELDS = ["geometry", "name", "address_components"] as const;

let configured = false;

function ensureConfigured() {
  if (!configured) {
    setOptions({ key: API_KEY, v: "weekly" });
    configured = true;
  }
}

function createLocationData(place: google.maps.places.PlaceResult): LocationData | null {
  if (!place.geometry?.location) {
    return null;
  }

  const latitude = place.geometry.location.lat();
  const longitude = place.geometry.location.lng();
  const locationName = parseGoogleAddress(place);
  const timezone = resolveTimezone(latitude, longitude);

  return {
    latitude,
    longitude,
    locationName,
    timezone,
  };
}

async function loadPlacesLibrary() {
  ensureConfigured();
  await importLibrary("places");
}

let placesServiceInstance: google.maps.places.PlacesService | null = null;

function getPlacesService(): google.maps.places.PlacesService {
  if (!placesServiceInstance) {
    placesServiceInstance = new google.maps.places.PlacesService(
      document.createElement("div")
    );
  }
  return placesServiceInstance;
}

const REGION_TYPES: string[] = ["(regions)"];

export function useGooglePlacesAutocomplete({
  inputRef,
  onPlaceSelected,
  onError,
  ready = true,
}: UseGooglePlacesAutocompleteOptions): {
  loaded: boolean;
  resolveTypedLocation: (input: string) => Promise<LocationData | null>;
} {
  const [loaded, setLoaded] = useState(false);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  const onErrorRef = useRef(onError);

  onPlaceSelectedRef.current = onPlaceSelected;
  onErrorRef.current = onError;

  const resolveTypedLocation = useCallback(
    async (input: string): Promise<LocationData | null> => {
      const trimmed = input.trim();

      if (!API_KEY || !ready || !trimmed) {
        return null;
      }

      await loadPlacesLibrary();

      if (!google.maps.places) {
        return null;
      }

      const prediction = await new Promise<google.maps.places.AutocompletePrediction | null>(
        (resolve) => {
          const autocompleteService = new google.maps.places.AutocompleteService();

          autocompleteService.getPlacePredictions(
            {
              input: trimmed,
              types: REGION_TYPES,
            },
            (predictions, status) => {
              if (
                status !== google.maps.places.PlacesServiceStatus.OK ||
                !predictions?.length
              ) {
                resolve(null);
                return;
              }

              resolve(predictions[0]);
            }
          );
        }
      );

      if (!prediction?.place_id) {
        return null;
      }

      const place = await new Promise<google.maps.places.PlaceResult | null>(
        (resolve) => {
          getPlacesService().getDetails(
            {
              placeId: prediction.place_id,
              fields: [...PLACE_FIELDS],
            },
            (details, status) => {
              if (
                status !== google.maps.places.PlacesServiceStatus.OK ||
                !details
              ) {
                resolve(null);
                return;
              }

              resolve(details);
            }
          );
        }
      );

      return place ? createLocationData(place) : null;
    },
    [ready]
  );

  useEffect(() => {
    if (!API_KEY || !inputRef.current || !ready) return;

    let cancelled = false;

    loadPlacesLibrary()
      .then(() => {
        if (cancelled || !inputRef.current) return;

        const autocomplete = new google.maps.places.Autocomplete(
          inputRef.current,
          {
            types: REGION_TYPES,
            fields: [...PLACE_FIELDS],
          }
        );

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const locationData = createLocationData(place);

          if (!locationData) {
            onErrorRef.current(
              "Couldn't find that location. Please select from the dropdown."
            );
            return;
          }

          onPlaceSelectedRef.current(locationData);
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

  return { loaded, resolveTypedLocation };
}
