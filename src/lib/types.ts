export type ItemKind = 'doc' | 'note' | 'wifi';

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export interface ImageRef {
  id: string;
  width: number;
  height: number;
}

export interface Item {
  id: string;
  kind: ItemKind;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Photos of the document (front, back, ...). Only used by 'doc'. */
  images: ImageRef[];
  /** Free text: document number, note body, etc. */
  note: string;
  /** Expiry date as "YYYY-MM-DD". Only used by 'doc'. */
  expiresOn?: string;
  ssid?: string;
  password?: string;
  security?: WifiSecurity;
}

export interface Settings {
  blockScreenshots: boolean;
  /** How long the app may stay in the background before it locks again. */
  lockGraceMs: number;
  /** When a backup was last exported. */
  lastBackupAt?: number;
}

export interface VaultData {
  version: 1;
  items: Item[];
  settings: Settings;
  /** Recovery code that encrypts this vault's backups. Created on first use. */
  backupCode?: string;
}

export const KIND_LABEL: Record<ItemKind, string> = {
  doc: 'Documento',
  note: 'Nota',
  wifi: 'Wi-Fi',
};

export const KIND_ICON: Record<ItemKind, string> = {
  doc: '🪪',
  note: '📝',
  wifi: '📶',
};
