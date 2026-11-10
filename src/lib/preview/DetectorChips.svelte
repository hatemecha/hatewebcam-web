<script lang="ts">
  import { detectorChips } from './chips-store';
</script>

<span
  class="detector-chip"
  id="detectorChipBlob"
  data-detector="blob"
  data-state={$detectorChips.blob.state}>{$detectorChips.blob.text}</span
>
<span
  class="detector-chip"
  id="detectorChipFace"
  data-detector="face"
  data-state={$detectorChips.face.state}>{$detectorChips.face.text}</span
>
<span
  class="detector-chip"
  id="detectorChipBlink"
  data-detector="blink"
  data-state={$detectorChips.blink.state}>{$detectorChips.blink.text}</span
>
