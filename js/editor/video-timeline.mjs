/** Small, dependency-free timeline model used by the local video editor. */
export class VideoTimeline {
  static TYPES = ['look', 'blob', 'face', 'blink'];
  static MARKER_KINDS = ['manual', 'beat', 'bar', 'section'];
  static MARKER_SOURCES = ['user', 'edit-assist'];

  constructor(duration = 0) {
    this.duration = Math.max(0, Number(duration) || 0);
    this.trimStart = 0;
    this.trimEnd = this.duration;
    this.items = [];
    this.markers = [];
  }

  setDuration(duration) {
    this.duration = Math.max(0, Number(duration) || 0);
    this.trimStart = Math.min(this.trimStart, this.duration);
    this.trimEnd = this.duration;
    this.items = [];
    this.markers = [];
  }

  setTrim(startTime, endTime) {
    const start = this.#time(startTime);
    const end = this.#time(endTime);
    if (end <= start) throw new Error('El final debe ser posterior al inicio.');
    if (
      this.items.some((item) => item.startTime < start || item.endTime > end)
    ) {
      throw new Error('Hay efectos fuera del nuevo recorte.');
    }
    this.trimStart = start;
    this.trimEnd = end;
  }

  add(type, startTime, endTime, config = {}) {
    return this.upsert({
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      type,
      startTime,
      endTime,
      config:
        typeof structuredClone === 'function'
          ? structuredClone(config)
          : JSON.parse(JSON.stringify(config)),
    });
  }

  upsert(candidate) {
    if (!VideoTimeline.TYPES.includes(candidate.type))
      throw new Error('Tipo de efecto inválido.');
    const item = {
      ...candidate,
      startTime: this.#time(candidate.startTime),
      endTime: this.#time(candidate.endTime),
    };
    if (
      item.startTime < this.trimStart ||
      item.endTime > this.trimEnd ||
      item.endTime <= item.startTime
    ) {
      throw new Error('El efecto debe quedar dentro del recorte.');
    }
    const overlaps = this.items.some(
      (current) =>
        current.id !== item.id &&
        current.type === item.type &&
        item.startTime < current.endTime &&
        item.endTime > current.startTime,
    );
    if (overlaps)
      throw new Error('No se pueden superponer efectos del mismo tipo.');
    const index = this.items.findIndex((current) => current.id === item.id);
    if (index === -1) this.items.push(item);
    else this.items[index] = item;
    this.items.sort((a, b) => a.startTime - b.startTime);
    return item;
  }

  remove(id) {
    this.items = this.items.filter((item) => item.id !== id);
  }

  split(id, time, minSpan = 0.05) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Clip no encontrado.');
    const item = this.items[index];
    const splitTime = this.#time(time);
    const min = Math.max(0, Number(minSpan) || 0);
    if (splitTime <= item.startTime + min || splitTime >= item.endTime - min) {
      throw new Error('Elegí un punto dentro del clip.');
    }
    const cloneConfig = (config) =>
      typeof structuredClone === 'function'
        ? structuredClone(config || {})
        : JSON.parse(JSON.stringify(config || {}));
    const left = {
      ...item,
      endTime: splitTime,
      config: cloneConfig(item.config),
    };
    const right = {
      ...item,
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      startTime: splitTime,
      config: cloneConfig(item.config),
    };
    this.items[index] = left;
    this.items.push(right);
    this.items.sort((a, b) => a.startTime - b.startTime);
    return [left, right];
  }

  addMarker(marker = {}, threshold = 0.01) {
    const saved = this.#marker(marker);
    const maxDelta = Math.max(0, Number(threshold) || 0);
    const existing = this.markers.find(
      (current) =>
        current.source === saved.source &&
        current.kind === saved.kind &&
        Math.abs(current.time - saved.time) <= maxDelta,
    );
    if (existing) return existing;

    this.markers.push(saved);
    this.markers.sort((a, b) => a.time - b.time);
    return saved;
  }

  addMarkers(markers = [], threshold = 0.01) {
    return markers.map((marker) => this.addMarker(marker, threshold));
  }

  clearMarkersBySource(source) {
    const markerSource = VideoTimeline.MARKER_SOURCES.includes(source)
      ? source
      : 'user';
    this.markers = this.markers.filter(
      (marker) => (marker.source || 'user') !== markerSource,
    );
  }

  getMarkersBySource(source) {
    const markerSource = VideoTimeline.MARKER_SOURCES.includes(source)
      ? source
      : 'user';
    return this.markers.filter(
      (marker) => (marker.source || 'user') === markerSource,
    );
  }

  toggleMarker(time, threshold = 0.08) {
    const markerTime = this.#time(time);
    const maxDelta = Math.max(0, Number(threshold) || 0);
    const existingIndex = this.markers.findIndex(
      (marker) =>
        (marker.source || 'user') === 'user' &&
        Math.abs(marker.time - markerTime) <= maxDelta,
    );
    if (existingIndex !== -1) {
      const [removed] = this.markers.splice(existingIndex, 1);
      return { action: 'removed', marker: removed };
    }

    const marker = this.addMarker({ time: markerTime });
    return { action: 'added', marker };
  }

  removeMarker(id) {
    this.markers = this.markers.filter((marker) => marker.id !== id);
  }

  getSnapPoints() {
    return [
      this.trimStart,
      this.trimEnd,
      ...this.markers.map((marker) => marker.time),
      ...this.items.flatMap((item) => [item.startTime, item.endTime]),
    ];
  }

  toJSON() {
    const clone = (value) =>
      typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
    return {
      trim: {
        start: this.trimStart,
        end: this.trimEnd,
      },
      items: this.items.map((item) => ({
        ...item,
        config: clone(item.config || {}),
      })),
      markers: this.markers.map((marker) => ({ ...marker })),
    };
  }

  static fromJSON(data = {}, duration = 0) {
    const timeline = new VideoTimeline(duration);
    const trim = data.trim || {};
    const trimStart = Number(trim.start ?? data.trimStart ?? 0);
    const trimEnd = Number(trim.end ?? data.trimEnd ?? duration);
    if (
      Number.isFinite(trimStart) &&
      Number.isFinite(trimEnd) &&
      trimEnd > trimStart
    ) {
      timeline.setTrim(trimStart, trimEnd);
    }
    const clone = (value) =>
      typeof structuredClone === 'function'
        ? structuredClone(value || {})
        : JSON.parse(JSON.stringify(value || {}));
    (data.items || []).forEach((item) => {
      timeline.upsert({
        id: item.id,
        type: item.type,
        startTime: item.startTime,
        endTime: item.endTime,
        config: clone(item.config),
      });
    });
    timeline.addMarkers(data.markers || []);
    return timeline;
  }

  activeAt(time) {
    const currentTime = this.#time(time);
    return VideoTimeline.TYPES.map((type) =>
      this.items.find(
        (item) =>
          item.type === type &&
          currentTime >= item.startTime &&
          currentTime < item.endTime,
      ),
    ).filter(Boolean);
  }

  #time(value) {
    const number = Number(value);
    return Math.min(
      this.duration,
      Math.max(0, Number.isFinite(number) ? number : 0),
    );
  }

  #marker(marker) {
    const kind = VideoTimeline.MARKER_KINDS.includes(marker.kind)
      ? marker.kind
      : 'manual';
    const source = VideoTimeline.MARKER_SOURCES.includes(marker.source)
      ? marker.source
      : 'user';
    const strength = Number(marker.strength);
    return {
      id:
        marker.id ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`),
      time: this.#time(marker.time),
      kind,
      source,
      strength: Number.isFinite(strength)
        ? Math.min(1, Math.max(0, strength))
        : 1,
      label:
        marker.label ||
        (kind === 'manual' ? 'Marcador' : kind === 'bar' ? 'Compás' : 'Beat'),
    };
  }
}
