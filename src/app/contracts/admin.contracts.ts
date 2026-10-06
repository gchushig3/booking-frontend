import { Location, Photo, Price, ProductType } from './atracciones.contracts';
/** CreateAtraccionDto and its PartialType update on the REST wire. */
export interface CreateAttractionRequest {
  name: string; long_description: string; duration: string; product_type: ProductType;
  includes: string[]; categories: string[]; locations: Location[]; photos: Photo[];
  supported_languages: string[]; free_cancellation: boolean;
  price?: Price; package_prices?: Partial<Record<ProductType, Price>>;
  operator?: { id: number; name: string }; badges?: string[];
}
export type UpdateAttractionRequest = Partial<CreateAttractionRequest>;
