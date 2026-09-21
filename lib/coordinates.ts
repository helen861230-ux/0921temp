export function hasValidCoordinates(station: { latitude: number | null; longitude: number | null }): boolean {
  const { latitude, longitude } = station;
  return typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}
