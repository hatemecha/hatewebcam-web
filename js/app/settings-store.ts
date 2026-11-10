export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SettingsStoreOptions {
  storage?: StorageLike | null;
  onError?: ((error: unknown) => void) | null;
}

export class SettingsStore {
  private storage: StorageLike | null;
  private onError: ((error: unknown) => void) | null;

  constructor({
    storage = globalThis.localStorage as StorageLike | null,
    onError = null,
  }: SettingsStoreOptions = {}) {
    this.storage = storage;
    this.onError = onError;
  }

  loadJson<T>(key: string, fallbackValue: T): T {
    try {
      const raw = this.storage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallbackValue;
    } catch (err) {
      console.warn(
        `HateWebcam: no se pudo leer ${key} desde localStorage.`,
        err,
      );
      return fallbackValue;
    }
  }

  loadObject<T extends Record<string, unknown>>(
    key: string,
    fallbackValue: T = {} as T,
  ): T {
    const value = this.loadJson<unknown>(key, fallbackValue);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as T)
      : fallbackValue;
  }

  saveJson(key: string, value: unknown): boolean {
    try {
      this.storage?.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      if (this.onError) this.onError(err);
      return false;
    }
  }
}
