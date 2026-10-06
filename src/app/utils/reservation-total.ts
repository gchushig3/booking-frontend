import { PaqueteExperiencia } from '../contracts/atracciones.contracts';

export function reservationTotal(pkg: PaqueteExperiencia, adults: number, ages: (number | null)[]): number | null {
  const price = Number(pkg.precio_unitario);
  const rawFreeAge = pkg.politicas_json['edad_nino_gratis_hasta'];
  const freeAge = rawFreeAge === undefined ? -1 : Number(rawFreeAge);
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(adults) || adults < 0
    || !Number.isInteger(freeAge) || freeAge < -1 || freeAge > 17
    || ages.some(age => age === null || !Number.isInteger(age) || age < 0 || age > 17)) return null;
  const paidChildren = ages.filter(age => age! > freeAge).length;
  return Math.round((adults + paidChildren) * price * 100) / 100;
}
