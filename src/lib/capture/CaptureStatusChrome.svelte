<script lang="ts">
  import { onMount } from 'svelte';
  import { captureChrome } from './session-store';

  const chrome = $derived($captureChrome);
  let flashToken = $state(0);
  let flashEl = $state<HTMLDivElement | null>(null);

  onMount(() =>
    captureChrome.subscribe((value) => {
      if (value.flashToken !== flashToken) flashToken = value.flashToken;
    }),
  );

  const countdownProgress = $derived.by(() => {
    const total = Math.max(1, chrome.countdownTotal || 1);
    if (!chrome.countdownActive) return 0;
    return ((total - chrome.countdownRemaining) / total) * 360;
  });

  $effect(() => {
    const token = flashToken;
    const node = flashEl;
    if (!node || token === 0) return;
    node.classList.remove('is-visible');
    void node.offsetWidth;
    node.classList.add('is-visible');
    const timer = setTimeout(() => node.classList.remove('is-visible'), 180);
    return () => clearTimeout(timer);
  });
</script>

<div
  class="capture-countdown"
  class:hidden={!chrome.countdownActive}
  class:is-final={chrome.countdownActive && chrome.countdownRemaining <= 1}
  id="captureCountdown"
  role="status"
  aria-live="off"
  style:--countdown-progress="{countdownProgress}deg"
>
  <div class="capture-countdown-ring" aria-hidden="true">
    <div class="capture-countdown-value" id="captureCountdownValue">
      {Math.max(1, chrome.countdownRemaining)}
    </div>
  </div>
  <div class="capture-countdown-label">Foto en</div>
</div>
<div
  class="capture-flash"
  id="captureFlash"
  aria-hidden="true"
  bind:this={flashEl}
></div>
<div
  class="recording-hud"
  class:hidden={!chrome.recording}
  id="recordingHud"
  aria-hidden={!chrome.recording}
>
  <span class="recording-dot"></span>
  <strong>REC</strong>
  <span id="recordingHudTime">{chrome.recordingTime}</span>
  <span aria-hidden="true">·</span>
  <span id="recordingHudFormat">{chrome.recordingFormat}</span>
</div>
