export interface LinkInfo {
  uid: string;
  suspect: boolean;
}

export interface ItemNode {
  uid: string;
  path: string;
  level: string;
  header?: string;
  text?: string;
  active: boolean;
  normative: boolean;
  derived: boolean;
  reviewed: boolean;
  cleared: boolean;
  links: LinkInfo[];
}

export interface DocumentNode {
  prefix: string;
  markerPath: string;
  parentPrefix?: string;
  digits?: number;
  separator?: string;
  itemFormat?: string;
  items: ItemNode[];
}

export interface TreeResponse {
  documents: DocumentNode[];
}
