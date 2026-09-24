/**
 * Geocoding Service — validates and normalizes stop coordinates.
 *
 * Since we use lat/lng coordinates directly (not addresses),
 * this service validates coordinate format and cleans the data.
 * Road-network geocoding is out of scope for this build.
 */

/**
 * Validate and normalize an array of stops.
 *
 * Each stop must have valid lat/lng. Assigns default labels and IDs
 * if missing.
 *
 * @param {Array} stops - Raw stops from the request
 * @returns {Array} Validated and normalized stops
 * @throws {Error} If any stop has invalid coordinates
 */
function validateStops(stops) {
  return stops.map((stop, index) => {
    const lat = parseFloat(stop.lat);
    const lng = parseFloat(stop.lng);

    if (isNaN(lat) || isNaN(lng)) {
      throw new Error(
        `Stop ${index} has invalid coordinates: lat=${stop.lat}, lng=${stop.lng}`
      );
    }

    if (lat < -90 || lat > 90) {
      throw new Error(
        `Stop ${index} latitude out of range (-90 to 90): ${lat}`
      );
    }

    if (lng < -180 || lng > 180) {
      throw new Error(
        `Stop ${index} longitude out of range (-180 to 180): ${lng}`
      );
    }

    return {
      id: stop.id || String(index),
      lat,
      lng,
      label: stop.label || `Stop ${index}`,
    };
  });
}

module.exports = { validateStops };
