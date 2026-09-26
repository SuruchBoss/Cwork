// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

const EARTH_RADIUS_M = 6_371_008.8;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Great-circle distance in metres (haversine).
 *
 * Accurate to well under a metre at the scale of a geofence, and cheap enough to
 * run on every punch. Good enough that we do not need PostGIS for this.
 */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);

  const h =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface GeofenceCheck {
  distanceM: number;
  isInside: boolean;
}

/**
 * A punch counts as inside when the reported position *could* be inside, i.e.
 * distance minus GPS accuracy is within the radius. Being strict about raw
 * distance punishes people for their phone's error margin, which generates
 * false anomalies and destroys trust in the flags that matter.
 */
export function checkGeofence(
  punch: Coordinates,
  site: Coordinates,
  radiusM: number,
  accuracyM = 0,
): GeofenceCheck {
  const distance = distanceMeters(punch, site);
  const effectiveDistance = Math.max(0, distance - Math.max(0, accuracyM));
  return { distanceM: Math.round(distance), isInside: effectiveDistance <= radiusM };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
