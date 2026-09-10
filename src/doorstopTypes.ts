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
  ref?: string;
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

/** Semantic anchor hint from the server: which field a problem belongs on. */
export type FieldAnchor =
  | 'document'
  | 'level'
  | 'text'
  | 'reviewed'
  | 'links'
  | 'link_entry'
  | 'derived'
  | 'ref';

/**
 * One problem Doorstop reports, classified server-side.
 *
 * `uids` carries the fan-out: a problem naming several items (a duplicate level,
 * say) is ONE record listing them all, which the extension renders as one
 * diagnostic per item with identical message and severity.
 */
export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  /** Stable check id, or 'unknown' when the message matched no known template. */
  check: string;
  /** Doorstop's own wording, with the item-UID prefix already stripped. */
  message: string;
  documentPrefix: string;
  uids: string[];
  /** The other item named by the message - selects which link entry to anchor to. */
  relatedUid: string | null;
  field: FieldAnchor | null;
}

export interface ValidationResponse {
  issues: ValidationIssue[];
}
