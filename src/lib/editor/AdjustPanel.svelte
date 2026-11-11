<script lang="ts">
  import { m } from '../i18n/text.svelte';
</script>

<div class="panel-section inspector-adjust-empty" id="inspectorAdjustNoVideo">
  <div class="help-text">
    {m(
      'Importá un video para empezar. Los ajustes aparecen cuando seleccionás un clip de efecto en la timeline.',
    )}
  </div>
</div>
<div
  class="panel-section inspector-adjust-empty hidden"
  id="inspectorAdjustNoClip"
>
  <div class="help-text">
    {m('Seleccioná un clip en la timeline para editar sus opciones acá.')}
  </div>
  <ol class="inspector-adjust-steps">
    <li>
      {m(
        'Arrastrá Look, Visual FX, Color, Caras u Ojos desde la barra de arriba.',
      )}
    </li>
    <li>{m('Hacé click en el clip para abrir sus ajustes.')}</li>
    <li>{m('Usá la pestaña Clip si querés cambiar solo la duración.')}</li>
  </ol>
  <div class="help-text section-note">
    {m('Los cambios se aplican al instante; no hace falta guardar nada.')}
  </div>
</div>
<div id="inspectorAdjustmentsHost" class="hidden">
  <div id="visualFxInspectorHost" class="visual-fx-inspector hidden"></div>
  <div
    class="status-msg visual-fx-status"
    id="visualFxStatus"
    role="status"
  ></div>
</div>
