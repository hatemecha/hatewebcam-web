# Migración a Svelte 5 + TypeScript

Documento de trabajo para modernizar la interfaz sin reemplazar el motor multimedia.
La aplicación sigue siendo estática, local-first y compatible con GitHub Pages.

## Línea base

Fecha de auditoría: 2026-11-10. Rama `main`, commit `e974664`.

| Verificación    | Resultado                                                    |
| --------------- | ------------------------------------------------------------ |
| `npm test`      | Pasa: smoke, unit y Visual FX.                               |
| `npm run lint`  | Pasa.                                                        |
| `npm run build` | Pasa. Salida aproximada: 350 kB JS principal, 204 kB CSS.    |
| Playwright      | Pasan 53/53 con `--workers=2`.                               |
| `format:check`  | Fallaba en 3 archivos preexistentes; corregido en `e974664`. |
| Node            | `v24.15.0` local; CI usa Node 20.                            |
| Vite            | 8.1.0.                                                       |

Las capturas de referencia son las de `tests/browser/webcam-visual.spec.mjs-snapshots/`.
No se actualizan salvo que el cambio visual sea intencional.

## Punto de entrada

```text
index.html
  -> js/app.js
     -> initializeI18n()
     -> monta skip link, header, placeholder, barra de captura, editor,
        métricas, cámara, panel de webcam, HUD y modales (Svelte 5)
     -> new AppController().start()
        -> setupDom(this)
        -> bindEvents() / bindCameraShellEvents()
        -> init()
           -> restoreActiveDetectors()
           -> toggleCamera(true)
     -> primer cambio a Video:
        -> import('./app/editor-install.mjs')  (chunk diferido)
        -> aplica timeline, Edit Assist, export y Visual FX
```

`index.html` conserva el contenedor de la app y el visor; todo el texto estático se
renderiza desde Svelte. Ya no hay plantillas HTML descargadas en runtime.
`templates/` fue eliminado y `scripts/copy-templates.mjs` solo copia `vendor/` y `css/`.

## AppController y mixins

`AppController` es un objeto central con estado y métodos aportados por mixins. Los
mixins webcam se aplican en `js/app/controller.mjs` y comparten `this`, no reciben una
interfaz explícita. Los mixins del editor se aplican en `js/app/editor-install.mjs`
cuando se solicita Video por primera vez; no forman parte del bundle inicial.
Esta sigue siendo la deuda arquitectónica principal de la migración.

| Módulo                        | Responsabilidad principal                                               |
| ----------------------------- | ----------------------------------------------------------------------- |
| `settings.mjs`                | Persistencia, presets, ajustes de imagen, cámara y detectores.          |
| `camera.mjs`                  | Encendido/apagado, estados de error, cambio de cámara, performance.     |
| `render.mjs`                  | Loop de preview, Canvas2D, WebGL de look, FPS y resolución.             |
| `capture.mjs`                 | Foto, grabación, MediaRecorder, HUD, preview de captura y descargas.    |
| `effects.mjs`                 | Activación de detectores, chips de estado y resumen de detecciones.     |
| `events.mjs`                  | Binding de eventos DOM y splitters del editor.                          |
| `video-editor.mjs`            | Compone timeline, clipboard, proyecto, exportación, inspector y fuente. |
| `video-editor/source.mjs`     | Modo cámara/video, carga de archivo, object URL y ciclo de vida.        |
| `video-editor/export.mjs`     | Preflight, WebCodecs, progreso, cancelación y descarga.                 |
| `video-editor/timeline-*.mjs` | Timeline, interacción, sincronización y chrome.                         |
| `visual-fx-integration.mjs`   | Puente entre timeline, efecto Visual FX y proyecto guardado.            |
| `visual-fx-ui.mjs`            | Inspector de Visual FX.                                                 |
| `profiles.mjs`                | Perfiles de webcam en `localStorage`.                                   |
| `modal-focus.mjs`             | Focus trap de modales.                                                  |

### Servicios ya separados

- `js/core/camera-manager.mjs`: stream, dispositivos, constraints y cleanup.
- `js/effects/effect-manager.mjs`: cadena de efectos por frame.
- `js/editor/video-timeline.mjs`: modelo de timeline, clips, markers y trim.
- `js/editor/editor-history.mjs`: undo/redo.
- `js/video-export.mjs`: cálculos puros de exportación, codecs y diagnóstico.
- `js/visual-fx/*`: pipeline WebGL, passes, fallback y configuración versionada.
- `js/subject/*`: análisis de persona/fondo, worker, máscaras y caché.
- `js/workers/*`: workers de Face Mesh y color tracking.

## Estado compartido

No hay un store único. El estado vive en el controlador y se proyecta al DOM de forma
imperativa:

- Sesión de cámara: `isRunning`, `preferredDeviceId`, `cameraManager`, `webcamSessionState`.
- Render: `renderEngine`, `animFrameId`, `frameCount`, `previewScale`, `imageSettings`.
- Captura: `mediaRecorder`, `recordingStream`, `pendingCapture`, timers y HUD.
- Detectores: `blobTrackingEffect`, `faceDetectionEffect`, `blinkDetectionEffect`.
- Editor: `videoTimeline`, `editorHistory`, selección, zoom, clipboard y proyecto pendiente.
- Exportación: `videoExportSession`, diagnóstico, preflight y playback.
- UI: `sourceMode`, `flipH`, `flipV`, `rotation`, `mobileActivePreset`, panel móvil.

Persistencia actual:

- `hatewebcam_config`: ajustes de webcam, imagen, detectores y defaults migrados.
- `hatewebcam_profiles`: perfiles guardados.
- `hatewebcam_locale`: idioma elegido.
- `hatewebcam-editor-layout`: tamaños de paneles del editor.

Las migraciones son flags one-shot en `js/app/init.mjs` (`forceMirrorDefaultV3/V4`,
`faceVisualModeDefaultV2`, `migrateResponsiveEditorDefaults`). No se deben cambiar
defaults existentes sin agregar una migración nueva.

## Restricciones que condicionan la migración

1. **El loop de render no entra en reactividad.** Svelte solo puede recibir estado de
   UI a cadencia humana (modo, detecciones resumidas, progreso throttleado). Nada de
   `$state` por frame.
2. **Los tests dependen de IDs, clases y textos.** Durante la transición, los
   componentes Svelte deben conservar los mismos `id`, clases, `aria-*` y estructura.
3. **i18n es un catálogo exacto.** Las claves son el texto español en
   `src/lib/i18n/catalog.ts`. Svelte llama `m()`; el DOM imperativo llama
   `translateCurrent()`. No hay traductor que recorra el DOM. Las claves se comparan
   con normalización NFC para tolerar diferencias de escritura. El texto dinámico
   usa claves con `{placeholders}`.
4. **CSP y vendor local.** No se agregan CDNs, fuentes remotas ni telemetría. Los
   assets de MediaPipe/Mediabunny siguen en `vendor/`.
5. **Build de Pages.** `base: './'` y `scripts/copy-templates.mjs` deben seguir
   funcionando. `vendor/` y `css/` se copian a `dist/`; ya no hay `templates/`.
6. **Node 20 en CI.** Los tests Node actuales importan `.mjs`. El TypeScript nuevo se
   verifica con `svelte-check`/`tsc`; no se hace depender `npm test` de un loader TS.
7. **Workers.** `subject-worker.mjs` y `blob-tracking-worker.mjs` son module workers;
   `face-mesh-worker.js` es classic script y sigue detrás de un flag.
8. **Sin regresiones multimedia.** No se reemplazan Canvas, WebGL, MediaRecorder,
   WebCodecs, Mediabunny, MediaPipe ni Workers sin una razón medida.

## Arquitectura objetivo

- Svelte 5 montado como islas dentro del shell existente, no SvelteKit.
- `src/` contiene componentes, stores tipados y adaptadores de UI.
- El controlador legacy sigue siendo dueño del motor y del estado de dominio.
- Un `AppUiAdapter` tipado expone comandos concretos a Svelte (`setSourceMode`,
  `startVideoExport`, `setLocale`, etc.). Los componentes no llaman métodos internos
  del controlador.
- Stores Svelte solo para estado de presentación: modo, disponibilidad de exportación,
  idioma, estado de detectores, progreso de exportación y visibilidad de paneles.
- TypeScript estricto para `src/**`. Los `.mjs` existentes se migran por módulos puros
  cuando tengan tests y no dependan de DOM global.
- Se preservan IDs y clases durante la transición; se eliminan cuando el componente y
  sus tests ya no dependan del DOM legacy.

## Secuencia de migración

### Etapa 0. Infraestructura y línea base

- Agregar `svelte`, `@sveltejs/vite-plugin-svelte`, `typescript` y `svelte-check`.
- Configurar `tsconfig.json`, `svelte.config.js`, `vite.config.mjs` y scripts
  `typecheck`.
- Mantener `npm test` y Playwright sin cambios.
- Criterio de salida: build, tests, lint, format y typecheck pasan.

### Etapa 1. Shell Svelte

- Migrar el header: tabs Webcam/Video, selector de idioma, export y link al repo.
- Introducir `src/lib/shell/` con store tipado y adaptador.
- El controlador deja de mutar clases/aria del header y publica estado al store.
- Criterio de salida: mismas capturas, idioma persistido, export deshabilitado/
  habilitado igual que antes.

### Etapa 2. Estado de preview

- Migrar la barra de estado de preview (resolución, FPS, chips de detectores) a Svelte.
- Publicar resumen de detectores con el throttle actual (200 ms) y FPS con el actual
  (1 s). No tocar el loop de render.
- Criterio de salida: chips y FPS coinciden, tests visuales pasan.

### Etapa 3. Controles de webcam

- Migrar `templates/webcam-controls.html` por secciones: captura, imagen, detectores,
  perfiles y ajustes avanzados.
- Mantener `id`/clases y el binding legacy hasta que cada sección tenga adaptador
  tipado y tests.
- Criterio de salida: presets, perfiles, espejo y detectores sincronizados.

### Etapa 4. HUD móvil y modales

- Migrar HUD móvil, modal de captura y modal de exportación.
- Mantener el focus trap y la semántica ARIA.
- Criterio de salida: captura, descarga, cancelación y navegación por teclado.

### Etapa 5. Editor y timeline

- Migrar inspector, toolbar, timeline y paneles por partes, sin tocar el modelo
  `VideoTimeline` ni el pipeline de exportación.
- Criterio de salida: trim, clips, presets, undo/redo y exportación.

### Etapa 6. Extracción de servicios y TypeScript

- Extraer del controlador: persistencia, perfiles, ciclo de cámara, sesión de captura,
  sesión de exportación y estado de UI.
- Convertir módulos puros a TypeScript con tests.
- Criterio de salida: `svelte-check` y `tsc --noEmit` en strict para `src/`; módulos
  legacy restantes documentados.

### Etapa 7. Limpieza y verificación final

- Eliminar código legacy solo cuando no tenga referencias ni tests.
- Revisar streams, workers, object URLs, listeners y memoria.
- Verificar build estático, CSP, base relativa, Pages, accesibilidad y presupuesto de
  performance.
- Criterio de salida: suite completa verde y sin regresiones visuales relevantes.

## Estado de implementación

### Etapa 0: completada

- Svelte 5, `@sveltejs/vite-plugin-svelte`, TypeScript y `svelte-check` integrados en
  Vite 8.
- `src/**` en TypeScript estricto; `npm run typecheck` agregado a CI.
- ESLint y Prettier cubren `.svelte` y `.ts`.
- `npm test`, lint, typecheck, build y Playwright pasan.

### Etapa 1: completada

- Header migrado a `src/lib/shell/AppHeader.svelte`.
- `src/lib/shell/shell-bridge.mjs` mantiene el estado compartido sin imports de Svelte,
  para que los tests Node sigan cargando los módulos legacy.
- `AppController` publica modo y disponibilidad de exportación al bridge; ya no muta
  clases/ARIA del header.
- El selector de idioma lo controla Svelte y sigue persistiendo en `hatewebcam_locale`.
- Se agregó una prueba de regresión para modo, visibilidad y disponibilidad del export
  del header.

### Etapa 2: completada (chips)

- Los chips de detectores se renderizan con `src/lib/preview/DetectorChips.svelte`.
- `preview-bridge.mjs` publica el resumen throttleado que ya producía
  `updateEffectsInfo`; no se agregó reactividad al loop de render.
- `#resolutionInfo` y `#fpsInfo` siguen en el DOM legacy porque los tests visuales
  controlan esos nodos de forma determinista. Se migrarán junto con un helper de test
  equivalente.
- Se agregó cobertura unitaria para el bridge y se mantuvieron las capturas de
  detectores.

### Etapa 3: completada

- `src/lib/webcam/EffectsControls.svelte` y `CameraSourcePanel.svelte` reemplazaron
  la plantilla de controles y el bloque de cámara.
- La configuración avanzada de detectores se genera con el catálogo tipado; ya no
  usa `applyMessages`.

### Etapa 4: completada (HUD y modales)

- HUD móvil, modal de captura y modal de exportación son Svelte.
- `RecordingSession` y `PhotoCountdown` poseen el ciclo multimedia; el controlador
  coordina y conserva el focus trap.
- Se mantuvieron IDs, ARIA, clases y capturas visuales.

### Etapa 5: completada (editor)

- `templates/video-editor.html` se reemplazó por `src/lib/editor/*.svelte`:
  `VideoEditor`, `EditorToolbar`, `EffectPalette`, `Timeline`, `Inspector`,
  `ProjectPanel`, `EditAssistPanel`, `ExportPanel`, `ClipInspector` y `AdjustPanel`.
- El motor sigue siendo dueño del render imperativo del playhead, los clips, el
  ruler y los marcadores; Svelte es dueño del shell, los textos, la visibilidad, los
  tabs y los estados `disabled`.
- `src/lib/editor/editor-state.ts` publica estado de presentación tipado
  (modo, fuente, exportación, undo/redo, tab activo) sin reactividad por frame.
- `js/app/editor-install.mjs` carga el motor del editor con `import()` en el primer
  cambio a Video. `js/app.js` ya no importa timeline, export ni Visual FX.

### Etapa 6: parcial

- En TypeScript estricto: `src/**`, `js/preview-metrics.ts`,
  `js/editor/*.ts`, `js/app/settings-store.ts`, `camera-state.ts`,
  `media-format.ts`, `video-export-session.ts`, `render-engine.ts`,
  `timeline-view.ts` y `edit-assist-controller.ts`.
- `npm run typecheck` ejecuta `svelte-check` y `tsc --noEmit`.
- `npm test` usa `tsx` para tests Node que importan módulos `.ts`.
- Pendiente: tipar el controlador y los mixins webcam restantes (`.mjs`).

### Rendimiento del bundle inicial

Medición con `npm run build` al cerrar este corte, sin comprimir / gzip:

| Artefacto                            | Antes (`7f63f9e`) | Después    |
| ------------------------------------ | ----------------- | ---------- |
| JS inicial principal                 | 403,91 kB         | ~312 kB    |
| JS inicial total (con shared chunks) | ~403,91 kB        | ~357 kB    |
| Chunk diferido del editor            | —                 | ~119 kB    |
| CSS                                  | ~203,67 kB        | ~203,67 kB |

El modo webcam no solicita `editor-install-*.js`; una prueba de regresión lo verifica.
Los presupuestos de Playwright no se modificaron.

### Lista de tareas

Estados: Pendiente, En curso, Completada y verificada, Bloqueada.

| Tarea                                                                    | Estado                  | Notas                                                                                         |
| ------------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------- |
| Integrar `origin/main` sin reescribir historia                           | Completada y verificada | Merge no destructivo. Artifact `site-dist` y seek estable del test de Visual FX.              |
| CI `verify` en `refactor/**` sin `deploy` fuera de `main`                | Completada y verificada | `deploy` sigue condicionado a `push` de `main`.                                               |
| Controles de cámara (encendido, dispositivo, rendimiento, espejo rápido) | Completada y verificada | `CameraSourcePanel` es la fuente visual. El ciclo de cámara sigue en el mixin.                |
| Panel de webcam, resolución y FPS                                        | Completada y verificada | `EffectsControls` reemplaza la plantilla de controles.                                        |
| HUD móvil y modales de captura/exportación                               | Completada y verificada | El HUD y los modales leen el mismo estado.                                                    |
| i18n tipado y reactivo                                                   | Completada y verificada | Catálogo `es`/`en`. Sin `MutationObserver` ni `applyMessages`.                                |
| Editor Svelte completo                                                   | Completada y verificada | Sin `templates/video-editor.html`; shell, timeline e inspector Svelte. 61 pruebas Playwright. |
| Carga diferida del editor                                                | Completada y verificada | `editor-install` se solicita recién al entrar a Video; regresión en `app-smoke.spec.mjs`.     |
| TypeScript estricto del código propio                                    | Parcial                 | `src/**` y módulos editor/sesión tipados; controlador y mixins webcam siguen en `.mjs`.       |
| Eliminación de `AppController` y mixins                                  | Pendiente               | Sigue siendo el coordinador de webcam y del motor; el editor ya es un módulo diferido.        |

## Checkpoint para reanudar

Lo verificable de este corte:

- `npm run format:check`, `lint`, `typecheck`, `test`, `test:browser -- --workers=2`
  y `build` pasan en local.
- 61 pruebas Playwright (55 originales + 6 de integración del editor).
- `npm run preview` se verificó con el build de producción.
- Persisten `hatewebcam_config`, `hatewebcam_profiles`, `hatewebcam_locale` y
  `hatewebcam-editor-layout`; no se agregaron migraciones ni flags.

Pendiente para terminar la Definición de Terminado:

1. Extraer las responsabilidades webcam de `AppController` a servicios con
   contratos explícitos y eliminar `apply*Mixin`.
2. Tipar el controlador resultante y el código webcam restante.
3. Repetir la suite completa y confirmar GitHub Actions en el commit final.
