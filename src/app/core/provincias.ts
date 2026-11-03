const normalizar = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();

export const PROVINCIAS = ['Pichincha', 'Guayas', 'Imbabura', 'Tungurahua', 'Galápagos', 'Napo', 'Azuay', 'Manabí', 'Pastaza', 'Cotopaxi', 'Esmeraldas', 'Chimborazo', 'Orellana', 'Santa Elena'];

// Catalog solo expone la ciudad; la provincia se deduce de ella.
const CIUDAD_A_PROVINCIA: Record<string, string> = {
  quito: 'Pichincha', cayambe: 'Pichincha', mindo: 'Pichincha', guayaquil: 'Guayas', daule: 'Guayas', salitre: 'Guayas',
  ibarra: 'Imbabura', otavalo: 'Imbabura', cotacachi: 'Imbabura', ambato: 'Tungurahua', banos: 'Tungurahua',
  'puerto ayora': 'Galápagos', galapagos: 'Galápagos', tena: 'Napo', 'el chaco': 'Napo', cuenca: 'Azuay',
  manta: 'Manabí', portoviejo: 'Manabí', montanita: 'Santa Elena', salinas: 'Santa Elena', puyo: 'Pastaza',
  latacunga: 'Cotopaxi', esmeraldas: 'Esmeraldas', riobamba: 'Chimborazo',
};

export function esProvincia(value: string): boolean {
  return PROVINCIAS.some(province => normalizar(province) === normalizar(value));
}

export function provinciaDeCiudad(city: string | null | undefined): string | null {
  if (!city?.trim()) return null;
  const key = normalizar(city);
  return PROVINCIAS.find(province => normalizar(province) === key) ?? CIUDAD_A_PROVINCIA[key] ?? null;
}
