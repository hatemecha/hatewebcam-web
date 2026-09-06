import assert from 'node:assert/strict';
import {
  normalizeVisualConfig,
  VISUAL_SYSTEM_IDS,
  VISUAL_SYSTEMS,
  applyVisualSystem,
  visualConfigTopologyKey,
} from '../js/visual-fx/config.mjs';
import { VisualFxEffect } from '../js/visual-fx/effect.mjs';
import { applySubjectFxIntegrationMixin } from '../js/app/visual-fx-integration.mjs';
import { VideoTimeline } from '../js/editor/video-timeline.mjs';

for (const system of VISUAL_SYSTEM_IDS) {
  const c = normalizeVisualConfig({ system });
  assert.equal(c.target, 'all');
  assert.ok(c.macros.intensity > 0, `${system} must start audible, not muted`);
  assert.deepEqual(normalizeVisualConfig(JSON.parse(JSON.stringify(c))), c);
}
for (const raw of [
  null,
  {},
  { system: '__proto__' },
  { system: 'toString' },
  { macros: { intensity: NaN }, seed: Infinity },
  { tuning: { grain: Infinity } },
]) {
  const c = normalizeVisualConfig(raw);
  assert.ok(Object.hasOwn(VISUAL_SYSTEMS, c.system));
  assert.ok(Number.isFinite(c.seed));
  assert.ok(Object.values(c.macros).every(Number.isFinite));
  assert.ok(Object.values(c.tuning).every(Number.isFinite));
}
assert.equal(normalizeVisualConfig({ system: 'melt' }).system, 'flow');
assert.equal(normalizeVisualConfig({ system: 'anatomy' }).system, 'trace');
assert.equal(
  normalizeVisualConfig({ target: 'invalid', macros: { intensity: 2 } }).macros
    .intensity,
  1,
);
assert.equal(
  applyVisualSystem({ target: 'background', seed: 45 }, 'noise').target,
  'background',
);

// State-safety contract: macros/target are never part of the topology key,
// only the system and its topology-flagged tuning are.
{
  const base = normalizeVisualConfig({ system: 'recursive' });
  const macroChanged = normalizeVisualConfig({
    system: 'recursive',
    macros: { ...base.macros, memory: 0.1 },
    target: 'person',
  });
  assert.equal(
    visualConfigTopologyKey(base),
    visualConfigTopologyKey(macroChanged),
    'macro/target-only changes must keep the same topology key',
  );
  const systemChanged = normalizeVisualConfig({ system: 'flow' });
  assert.notEqual(
    visualConfigTopologyKey(base),
    visualConfigTopologyKey(systemChanged),
  );
  const grainChanged = normalizeVisualConfig({
    system: 'recursive',
    tuning: { ...base.tuning, grain: 0.99 },
  });
  assert.notEqual(
    visualConfigTopologyKey(base),
    visualConfigTopologyKey(grainChanged),
    'a topology-flagged tuning value must change the key',
  );
}

let analysisCalls = 0,
  resets = 0;
const effect = new VisualFxEffect({
  analysisAdapter: {
    analyze() {
      analysisCalls++;
    },
    reset() {},
    dispose() {},
  },
  renderer: {
    reset() {
      resets++;
    },
    dispose() {},
  },
});
effect.setActive(true, 'one');
await effect.analyze({}, 0, { detectorIntervalMs: 0 });
assert.equal(analysisCalls, 0, 'Todo cannot touch MediaPipe, including export');
const before = resets;
effect.setActive(true, 'two');
assert.ok(resets > before);
effect.setConfig({ system: 'recursive', target: 'person' });
await effect.analyze({}, 10, {});
assert.equal(analysisCalls, 1);
effect.setBypass(true);
await effect.analyze({}, 20, {});
assert.equal(analysisCalls, 1);
effect.onSeek();
assert.equal(effect.maskTime, null);

// The critical fix this rewrite is about: dragging a macro must never call
// through to the renderer's reset - only a topology change may.
{
  let macroResets = 0;
  const probe = new VisualFxEffect({
    analysisAdapter: { analyze() {}, reset() {}, dispose() {} },
    renderer: {
      reset() {
        macroResets++;
      },
      dispose() {},
    },
  });
  probe.setActive(true, 'clip');
  probe.setConfig({ system: 'recursive' });
  const afterActivate = macroResets;
  for (let i = 0; i < 20; i++) {
    probe.setConfig({
      system: 'recursive',
      macros: { intensity: 1, memory: i / 20, structure: 0.5, movement: 0.3 },
      target: i % 2 === 0 ? 'all' : 'person',
    });
  }
  assert.equal(
    macroResets,
    afterActivate,
    'macro and target changes must not reset the renderer',
  );
  probe.setConfig({ system: 'flow' });
  assert.ok(
    macroResets > afterActivate,
    'a system change must reset the renderer',
  );
}

const app = {};
applySubjectFxIntegrationMixin(app);
const legacy = {
  version: 1,
  timeline: {
    items: [
      {
        id: 'a',
        type: 'subject',
        startTime: 0,
        endTime: 2,
        config: { preset: 'dissolve', amount: 0.4 },
      },
    ],
  },
};
const migrated = app.normalizeEditorProjectV2(legacy);
assert.equal(migrated.timeline.items[0].config.system, 'pixelfield');
assert.equal(
  legacy.timeline.items[0].config.preset,
  'dissolve',
  'Migration must not mutate input',
);
const timeline = new VideoTimeline(4);
const item = timeline.upsert(migrated.timeline.items[0]);
Object.assign(app, {
  videoTimeline: timeline,
  getSelectedVideoEffectItem: () => timeline.items[0],
  syncVideoTimelineSubject() {},
});
const otherTuning = { ...timeline.items[0].config.tuning };
app.commitSubjectFxConfig({ macros: { memory: 0.22 } });
assert.equal(timeline.items[0].config.macros.memory, 0.22);
assert.deepEqual(timeline.items[0].config.tuning, otherTuning);
assert.equal(timeline.activeAt(1)[0].id, item.id);
assert.equal(timeline.activeAt(3).length, 0);
console.log('Visual FX unit checks passed.');

// A later timeline sync must not leave a lazy-loaded effect permanently inactive.
{
  let resolveLoad;
  const loaded = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const fx = {
    clipId: '',
    setConfig() {},
    setBypass() {},
    onSeek() {},
    setActive(active, id) {
      this.active = active;
      this.clipId = id;
    },
    getStatusLabel() {
      return '';
    },
  };
  const app2 = {
    sourceMode: 'video',
    videoSourceFile: {},
    videoTimeline: {
      activeAt: () => [{ id: 'clip', type: 'subject', config: {} }],
    },
  };
  applySubjectFxIntegrationMixin(app2);
  app2.ensureSubjectFxEffect = () => loaded;
  const first = app2.syncVideoTimelineSubjectAt(0),
    second = app2.syncVideoTimelineSubjectAt(0.03);
  resolveLoad(fx);
  await Promise.all([first, second]);
  assert.equal(fx.active, true);
  assert.equal(fx.clipId, 'clip');
}

// Re-syncing the *same* clip (a slider commit's `force` resync) must not
// call onSeek and must not disturb the already-applied clip id.
{
  let onSeekCalls = 0;
  const fx = {
    clipId: '',
    setConfig() {},
    setBypass() {},
    onSeek() {
      onSeekCalls++;
    },
    setActive(active, id) {
      this.active = active;
      this.clipId = id;
    },
    getStatusLabel() {
      return '';
    },
  };
  const app3 = {
    sourceMode: 'video',
    videoSourceFile: {},
    videoTimeline: {
      activeAt: () => [{ id: 'same-clip', type: 'subject', config: {} }],
    },
  };
  applySubjectFxIntegrationMixin(app3);
  app3.ensureSubjectFxEffect = () => fx;
  await app3.syncVideoTimelineSubjectAt(0, true);
  assert.equal(onSeekCalls, 1, 'first sync of a clip must seek once');
  for (let i = 0; i < 10; i++) await app3.syncVideoTimelineSubjectAt(0, true);
  assert.equal(
    onSeekCalls,
    1,
    'forced re-syncs of the same clip must not call onSeek again',
  );
}
