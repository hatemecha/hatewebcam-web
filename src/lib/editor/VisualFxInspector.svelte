<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import {
    MACRO_LABELS,
    PALETTE_OPTIONS,
    TUNING_SCHEMA,
    VISUAL_SYSTEM_IDS,
    VISUAL_SYSTEMS,
    type VisualMacros,
    type VisualTarget,
  } from '../../../js/visual-fx/config.ts';
  import type { VisualFxSession } from '../../../js/app/video-editor/visual-fx-session.ts';

  let { session }: { session: VisualFxSession } = $props();
  const view = $derived(session.inspector);
  const macros: (keyof VisualMacros)[] = [
    'intensity',
    'memory',
    'structure',
    'movement',
  ];
  const targets = [
    ['all', 'Todo'],
    ['person', 'Persona'],
    ['background', 'Fondo'],
  ] as const satisfies readonly [VisualTarget, string][];
</script>

{#if $view.config}
  {@const config = $view.config}
  {@const fields = TUNING_SCHEMA[config.system]}
  {@const palette = fields.find((field) => field.key === 'palette')}
  <div class="vfx-inspector">
    <header class="vfx-inspector-head">
      <div class="vfx-inspector-title">Visual FX</div>
    </header>
    {#if !$view.inside}
      <div class="vfx-playhead-note">
        <span>{m('Fuera del clip.')}</span>
        <button
          type="button"
          class="btn btn-compact"
          id="visual-go"
          onclick={() => session.goToClip()}>{m('Ir al clip')}</button
        >
      </div>
    {/if}
    <div class="vfx-field-label">{m('Sistema')}</div>
    <div class="vfx-preset-grid" role="group" aria-label={m('Sistema')}>
      {#each VISUAL_SYSTEM_IDS as id (id)}
        <button
          type="button"
          class="vfx-preset-btn"
          class:is-active={config.system === id}
          data-visual-system={id}
          aria-pressed={config.system === id}
          onclick={() => session.setSystem(id)}
          >{VISUAL_SYSTEMS[id].label}</button
        >
      {/each}
    </div>
    <p class="vfx-preset-hint">{m(VISUAL_SYSTEMS[config.system].hint)}</p>
    <div class="vfx-field-label">{m('Aplicar a')}</div>
    <div class="vfx-segmented" role="group" aria-label={m('Aplicar a')}>
      {#each targets as [id, label] (id)}
        <button
          type="button"
          id={`visual-target-${id}`}
          class="vfx-segment"
          class:is-active={config.target === id}
          data-visual-target={id}
          aria-pressed={config.target === id}
          onclick={() => session.commit({ target: id })}>{m(label)}</button
        >
      {/each}
    </div>
    <p
      id="visualFxInlineStatus"
      class="vfx-preset-hint"
      class:is-active={Boolean($view.status)}
      role="status"
    >
      {$view.status ? m($view.status) : ''}
    </p>
    <div class="vfx-controls">
      {#each macros as key (key)}
        {@const value = Math.round(config.macros[key] * 100)}
        <div class="slider-group">
          <div class="slider-label">
            <label for={`visual-macro-${key}`}>{m(MACRO_LABELS[key])}</label>
            <span class="value" id={`visual-value-macro-${key}`}>{value}</span>
          </div>
          <input
            type="range"
            id={`visual-macro-${key}`}
            min="0"
            max="100"
            step="1"
            {value}
            oninput={(event) =>
              session.commit({
                macros: { [key]: event.currentTarget.valueAsNumber / 100 },
              })}
          />
        </div>
      {/each}
    </div>
    <details class="vfx-advanced-panel">
      <summary class="vfx-advanced-toggle">Tuning &#9656;</summary>
      <div class="vfx-tuning-body">
        {#each fields.filter((field) => field.key !== 'palette') as field (field.key)}
          {@const value = Math.round(
            ((config.tuning[field.key] - field.min) / (field.max - field.min)) *
              100,
          )}
          <div class="slider-group">
            <div class="slider-label">
              <label for={`visual-tuning-${field.key}`}>{m(field.label)}</label>
              <span class="value" id={`visual-value-tuning-${field.key}`}
                >{value}</span
              >
            </div>
            <input
              type="range"
              id={`visual-tuning-${field.key}`}
              min="0"
              max="100"
              step="1"
              {value}
              oninput={(event) =>
                session.commit({
                  tuning: {
                    [field.key]:
                      field.min +
                      (event.currentTarget.valueAsNumber / 100) *
                        (field.max - field.min),
                  },
                })}
            />
          </div>
        {/each}
        {#if palette}
          <label for="visual-tuning-palette" class="vfx-field-label"
            >{m(palette.label)}</label
          >
          <div class="select-wrapper vfx-tuning-select">
            <select
              id="visual-tuning-palette"
              value={String(config.tuning.palette)}
              onchange={(event) =>
                session.commit({
                  tuning: { palette: Number(event.currentTarget.value) },
                })}
            >
              {#each PALETTE_OPTIONS as option (option.id)}
                <option value={String(option.id)}>{m(option.label)}</option>
              {/each}
            </select>
          </div>
        {/if}
        <div class="vfx-variation-controls">
          <span
            >{m('Variación {number}', {
              number: (Math.abs(Math.round(config.seed)) % 999) + 1,
            })}</span
          >
          <button
            type="button"
            class="btn btn-compact"
            id="visual-variation"
            onclick={() => session.vary()}>{m('Cambiar')}</button
          >
          <button
            type="button"
            class="btn btn-compact"
            id="visual-restart"
            title={m('Limpiar el estado de la simulación')}
            onclick={() => session.restart()}>{m('Reiniciar')}</button
          >
        </div>
      </div>
    </details>
    <footer class="vfx-footer-row">
      <label class="vfx-power-toggle"
        ><input
          type="checkbox"
          id="chkVisualFxBypass"
          checked={!$view.bypass}
          aria-checked={!$view.bypass}
          onchange={() => session.toggleBypass()}
        /><span>{m('FX activo')}</span></label
      >
    </footer>
  </div>
{/if}
