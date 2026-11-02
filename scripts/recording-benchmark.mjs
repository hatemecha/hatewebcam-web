import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const browser = await chromium.launch({
  executablePath: process.env.RECORDING_BENCH_BROWSER || undefined,
  args: [
    `--use-fake-device-for-media-stream=fps=${Number(process.env.RECORDING_BENCH_FPS) || 30}`,
    '--use-fake-ui-for-media-stream',
  ],
});

try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error(error.message));
  page.on('requestfailed', (request) =>
    console.error(request.url(), request.failure()),
  );
  if (process.env.RECORDING_BENCH_WIDTH) {
    await page.addInitScript(
      ({ width, height }) => {
        const original = navigator.mediaDevices.getUserMedia.bind(
          navigator.mediaDevices,
        );
        navigator.mediaDevices.getUserMedia = (constraints) =>
          original({
            ...constraints,
            video: {
              ...constraints.video,
              width: { exact: width },
              height: { exact: height },
            },
          });
      },
      {
        width: Number(process.env.RECORDING_BENCH_WIDTH),
        height: Number(process.env.RECORDING_BENCH_HEIGHT),
      },
    );
  }
  await page.goto(
    `${process.env.RECORDING_BENCH_URL || 'http://127.0.0.1:4174/'}?perf=1`,
  );
  await page.locator('#btnTakePhoto').waitFor();
  await page.waitForFunction(
    () => !document.querySelector('#btnTakePhoto').disabled,
  );
  await page.locator('#sldExposure').evaluate((el) => {
    el.value = '30';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#chkBlobTracking').check({ force: true });
  if (process.env.RECORDING_BENCH_BW === '1') {
    await page.locator('#btnToggleAdvancedOptions').click();
    await page.locator('#chkBlackWhite').check();
  }
  if (process.env.RECORDING_BENCH_STRESS === '1') {
    for (const [id, value] of Object.entries({
      sldShadows: 35,
      sldHighlights: -20,
      sldDetail: 30,
      sldSharpness: 40,
    })) {
      await page.locator(`#${id}`).evaluate((el, next) => {
        el.value = String(next);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
    }
    await page.locator('#chkFaceDetection').check({ force: true });
    await page.waitForTimeout(400);
    await page
      .locator('#chkBlinkDetection')
      .check({ force: true })
      .catch(() => {});
    if (process.env.RECORDING_BENCH_WARM !== '0') {
      await page.waitForFunction(
        () => {
          const snap = window.__hatewebcamPerfSnapshot?.();
          return (snap?.counters?.faceInferences || 0) > 2;
        },
        null,
        { timeout: 45000 },
      );
    }
  }
  console.log('browser', browser.version());
  console.log(
    'source',
    await page.locator('#videoElement').evaluate((video) => {
      const { width, height, frameRate } = video.srcObject
        .getVideoTracks()[0]
        .getSettings();
      return { width, height, frameRate };
    }),
  );
  await page.locator('#btnRecord').click();
  await page.waitForTimeout(10000);
  console.log(
    JSON.stringify(
      await page.evaluate(() => window.__hatewebcamPerfSnapshot()),
    ),
  );
  await page.locator('#btnRecord').click();
  await page.waitForFunction(
    () => document.querySelector('#capturePreviewVideo').readyState >= 2,
  );
  if (process.env.RECORDING_BENCH_OUTPUT) {
    const bytes = await page
      .locator('#capturePreviewVideo')
      .evaluate(async (video) =>
        Array.from(
          new Uint8Array(await (await fetch(video.src)).arrayBuffer()),
        ),
      );
    const output = process.env.RECORDING_BENCH_OUTPUT;
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, Buffer.from(bytes));
    const probe = JSON.parse(
      execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=codec_name,width,height,avg_frame_rate:frame=best_effort_timestamp_time',
          '-of',
          'json',
          output,
        ],
        { encoding: 'utf8' },
      ),
    );
    const times = probe.frames.map((frame) =>
      Number(frame.best_effort_timestamp_time),
    );
    const gaps = times
      .slice(1)
      .map((time, index) => (time - times[index]) * 1000)
      .sort((a, b) => a - b);
    const duration = times.at(-1) - times[0];
    console.log(
      'encoded',
      JSON.stringify({
        stream: probe.streams[0],
        frames: times.length,
        duration,
        fps: (times.length - 1) / duration,
        medianGapMs: gaps[Math.floor(gaps.length / 2)],
        p95GapMs: gaps[Math.floor(gaps.length * 0.95)],
        maxGapMs: gaps.at(-1),
      }),
    );
  }
  console.log(
    'playback',
    await page.locator('#capturePreviewVideo').evaluate(async (video) => {
      video.muted = true;
      await video.play();
      const start = video.currentTime;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const elapsed = video.currentTime - start;
      if (elapsed < 0.5) throw new Error('Recorded video failed to advance');
      return { width: video.videoWidth, height: video.videoHeight, elapsed };
    }),
  );
} finally {
  await browser.close();
}
