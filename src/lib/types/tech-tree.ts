export interface InventionNode {
  id: string;
  title: string;
  subtitle: string;
  tier?: string;
  image: string;
  localImage?: string;
  year: number;
  dateDetails?: string;
  type: string;
  fields: string[];
  subfields: string[];
  inventors: string[];
  organizations: string[];
  city?: string;
  countryHistorical?: string;
  countryModern?: string;
  formattedLocation?: string;
  wikipedia?: string;
  details?: string;
  imagePosition?: string;
  dateAdded?: string;
}

export interface InventionLink {
  source: string;
  target: string;
  type: string;
}

export interface PositionedNode extends InventionNode {
  x: number;
  y: number;
}
