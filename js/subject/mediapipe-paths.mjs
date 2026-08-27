const SUBJECT_ASSET_PATHS = Object.freeze({
  wasmBaseUrl: 'vendor/mediapipe/tasks-vision/wasm',
  poseModelUrl: 'vendor/mediapipe/pose_landmarker/pose_landmarker_lite.task',
  segmenterModelUrl: 'vendor/mediapipe/image_segmenter/selfie_segmenter.tflite',
});

/** Resolve static assets against the page URL before crossing into a Worker. */
export function resolveSubjectAssetUrls(baseUrl) {
  if (!baseUrl) throw new Error('subject_asset_base_url_missing');
  return Object.fromEntries(
    Object.entries(SUBJECT_ASSET_PATHS).map(([key, path]) => [
      key,
      new URL(path, baseUrl).href.replace(/\/$/, ''),
    ]),
  );
}

export { SUBJECT_ASSET_PATHS };
