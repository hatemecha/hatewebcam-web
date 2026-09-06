import assert from 'node:assert/strict';
import {
  normalizeVisualConfig,
  VISUAL_PRESETS,
  applyVisualPreset,
} from '../js/visual-fx/config.mjs';
import { VisualFxEffect } from '../js/visual-fx/effect.mjs';
import { applySubjectFxIntegrationMixin } from '../js/app/visual-fx-integration.mjs';
import { VideoTimeline } from '../js/editor/video-timeline.mjs';

for (const preset of Object.keys(VISUAL_PRESETS)) {
  const c = normalizeVisualConfig({ preset });
  assert.equal(c.target, 'all');
  assert.ok(Object.values(c.modules).filter((v) => v > 0).length >= 3);
  assert.deepEqual(normalizeVisualConfig(JSON.parse(JSON.stringify(c))), c);
}
for (const raw of [
  null,
  {},
  { preset: '__proto__' },
  { preset: 'toString' },
  { amount: NaN, seed: Infinity },
  { modules: { feedback: Infinity } },
]) {
  const c = normalizeVisualConfig(raw);
  assert.ok(Object.hasOwn(VISUAL_PRESETS, c.preset));
  assert.ok(Number.isFinite(c.seed));
  assert.ok(Object.values(c.modules).every(Number.isFinite));
}
assert.equal(normalizeVisualConfig({ preset: 'smear' }).preset, 'melt');
assert.equal(normalizeVisualConfig({ preset: 'anatomy' }).preset, 'scan');
assert.equal(normalizeVisualConfig({ target: 'invalid', amount: 2 }).amount, 1);
assert.equal(
  applyVisualPreset({ target: 'background', seed: 45 }, 'noise').target,
  'background',
);
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
effect.setConfig({ target: 'person' });
await effect.analyze({}, 10, {});
assert.equal(analysisCalls, 1);
effect.setBypass(true);
await effect.analyze({}, 20, {});
assert.equal(analysisCalls, 1);
effect.onSeek();
assert.equal(effect.maskTime, null);
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
assert.equal(migrated.timeline.items[0].config.preset, 'decay');
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
const other = timeline.items[0].config.modules.pixel;
app.commitSubjectFxConfig({ modules: { feedback: 0.22 } });
assert.equal(timeline.items[0].config.modules.feedback, 0.22);
assert.equal(timeline.items[0].config.modules.pixel, other);
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
  const app = {
    sourceMode: 'video',
    videoSourceFile: {},
    videoTimeline: {
      activeAt: () => [{ id: 'clip', type: 'subject', config: {} }],
    },
  };
  applySubjectFxIntegrationMixin(app);
  app.ensureSubjectFxEffect = () => loaded;
  const first = app.syncVideoTimelineSubjectAt(0),
    second = app.syncVideoTimelineSubjectAt(0.03);
  resolveLoad(fx);
  await Promise.all([first, second]);
  assert.equal(fx.active, true);
  assert.equal(fx.clipId, 'clip');
}
