export class SettingsStore {
  constructor({ storage = globalThis.localStorage, onError = null } = {}) {
    this.storage = storage;
    this.onError = onError;
  }

  loadJson(key, fallbackValue) {
    try {
      const raw = this.storage?.getItem(key);
      return raw ? JSON.parse(raw) : fallbackValue;
    } catch (err) {
      console.warn(
        `HateWebcam: no se pudo leer ${key} desde localStorage.`,
        err,
      );
      return fallbackValue;
    }
  }

  saveJson(key, value) {
    try {
      this.storage?.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      if (this.onError) this.onError(err);
      return false;
    }
  }
}
