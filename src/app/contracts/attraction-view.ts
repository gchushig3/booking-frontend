import { Atraccion, Location, Photo } from './atracciones.contracts';
// Response DTO exposes JSON arrays; narrow their fields before displaying them.
export function photosOf(item: Atraccion): Photo[] {
  return item.photos.filter((value): value is Photo => typeof value === 'object' && value !== null && 'url' in value && typeof value.url === 'string');
}
export function locationsOf(item: Atraccion): Pick<Location, 'address' | 'city'>[] {
  return item.locations.filter((value): value is Pick<Location, 'address' | 'city'> => typeof value === 'object' && value !== null && 'address' in value && typeof value.address === 'string' && 'city' in value && typeof value.city === 'number');
}
