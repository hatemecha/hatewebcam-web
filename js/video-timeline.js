/** Small, dependency-free timeline model used by the local video editor. */
class VideoTimeline {
  static TYPES = ['look', 'blob', 'face', 'blink'];

  constructor(duration = 0) {
    this.duration = Math.max(0, Number(duration) || 0);
    this.trimStart = 0;
    this.trimEnd = this.duration;
    this.items = [];
  }

  setDuration(duration) {
    this.duration = Math.max(0, Number(duration) || 0);
    this.trimStart = Math.min(this.trimStart, this.duration);
    this.trimEnd = this.duration;
    this.items = [];
  }

  setTrim(startTime, endTime) {
    const start = this.#time(startTime);
    const end = this.#time(endTime);
    if (end <= start) throw new Error('El final debe ser posterior al inicio.');
    if (this.items.some((item) => item.startTime < start || item.endTime > end)) {
      throw new Error('Hay efectos fuera del nuevo recorte.');
    }
    this.trimStart = start;
    this.trimEnd = end;
  }

  add(type, startTime, endTime, config = {}) {
    return this.upsert({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      type,
      startTime,
      endTime,
      config: typeof structuredClone === 'function' ? structuredClone(config) : JSON.parse(JSON.stringify(config)),
    });
  }

  upsert(candidate) {
    if (!VideoTimeline.TYPES.includes(candidate.type)) throw new Error('Tipo de efecto inválido.');
    const item = {
      ...candidate,
      startTime: this.#time(candidate.startTime),
      endTime: this.#time(candidate.endTime),
    };
    if (item.startTime < this.trimStart || item.endTime > this.trimEnd || item.endTime <= item.startTime) {
      throw new Error('El efecto debe quedar dentro del recorte.');
    }
    const overlaps = this.items.some((current) => current.id !== item.id
      && current.type === item.type
      && item.startTime < current.endTime
      && item.endTime > current.startTime);
    if (overlaps) throw new Error('No se pueden superponer efectos del mismo tipo.');
    const index = this.items.findIndex((current) => current.id === item.id);
    if (index === -1) this.items.push(item);
    else this.items[index] = item;
    this.items.sort((a, b) => a.startTime - b.startTime);
    return item;
  }

  remove(id) {
    this.items = this.items.filter((item) => item.id !== id);
  }

  activeAt(time) {
    const currentTime = this.#time(time);
    return VideoTimeline.TYPES
      .map((type) => this.items.find((item) => item.type === type
        && currentTime >= item.startTime
        && currentTime < item.endTime))
      .filter(Boolean);
  }

  #time(value) {
    const number = Number(value);
    return Math.min(this.duration, Math.max(0, Number.isFinite(number) ? number : 0));
  }
}
