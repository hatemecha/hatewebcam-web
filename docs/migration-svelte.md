# Migración a Svelte 5 y TypeScript estricto

La migración se entregó en la rama `refactor/svelte-ui-migration`. El punto de partida de esta etapa fue `9e5093a`, con el editor montado en Svelte, catálogo ES/EN reactivo y 61 pruebas de Chromium.

## Arranque y propiedad del estado

- `index.html` carga `js/app.ts`. La entrada monta los componentes Svelte, conecta sus comandos tipados y arranca `WebcamApplication`. Las acciones que llegan mientras se cargan los ajustes se procesan al terminar la inicialización.
- Se conservan las claves `hatewebcam_config`, `hatewebcam_profiles`, `hatewebcam_locale` y `hatewebcam-editor-layout`. `SettingsStore` guarda los ajustes, perfiles y tamaños de panel. `webcam-settings.ts` conserva los defaults y las migraciones que se ejecutan una vez.
- `CameraManager` administra streams y permisos. `RecordingSession` y `PhotoCountdown` administran la captura. `RenderEngine` conserva los buffers y `PreviewRenderer` la cadencia de dibujo. Los controles Svelte se actualizan desde el estado de esos servicios.
- Al entrar a Video se solicita `editor-install` y se crea una `VideoEditorSession`. La sesión posee la fuente y su URL, la timeline, el historial, Edit Assist, Visual FX y la exportación. Los cambios de modo comparten una carga pendiente. Un intento fallido libera esa carga para que el siguiente pueda reintentar.
- Svelte renderiza los controles de captura, ajustes avanzados, transporte, inspector de clip, exportación y Visual FX. Canvas y WebGL siguen en los módulos de render. La posición del playhead y los gestos de arrastre se actualizan desde el transporte y la interacción de timeline.
- La carga de proyectos acepta v1 y la escritura usa v2. Visual FX conserva su configuración v4. Al reemplazar la fuente o volver a Webcam se revoca la URL y se invalida el trabajo pendiente. Cerrar la aplicación libera también los listeners de ambos modos.
- El código propio de `js/` y `src/` es TypeScript o Svelte. `tsconfig.json` comprueba la aplicación, y `tsconfig.workers.json` los tres workers con los tipos de Web Worker. Blob tracking y análisis de sujeto siguen como workers de módulo. Face Mesh conserva el worker clásico detrás de `HATEWEBCAM_FACE_MESH_WORKER` y el fallback al hilo principal.

## Verificación

- Pasaron `format:check`, `lint`, `typecheck`, `npm test`, `test:browser -- --workers=2 --update-snapshots=none` y `build`.
- Pasaron las 70 pruebas de Chromium. Cubren el arranque con una importación temprana, la recuperación de permisos de cámara, la alternancia Webcam ↔ Video, la liberación de streams, URLs, workers y listeners, la restauración de proyectos, la cancelación y la exportación WebM real. También pasaron la comparación con las capturas de referencia y las pruebas de WebGL.
- Se sirvió `dist` localmente bajo `/hatewebcam-web/`. La carga inicial conserva los presupuestos de Playwright. Vite reportó 227,45 kB de JavaScript principal, 126,09 kB para la entrada diferida del editor y 203,67 kB de CSS. Estas cifras son tamaños de salida sin comprimir por archivo.
- Con Playwright 1.61.1, Chromium 149.0.7827.55 y Firefox 151.0 arrancaron, abrieron el editor bajo demanda e importaron el WebM de prueba. Chromium también descargó un WebM válido bajo el subpath y verificó las rutas locales de estilos, Mediabunny, Face Mesh, WASM y los modelos de MediaPipe.
- WebKit 26.5 en Windows arrancó y abrió el editor bajo demanda. La importación de WebM y H.264 MP4 desde archivo mostró el error de decodificación. El mismo binario leyó el MP4 por HTTP y devolvió `MEDIA_ERR_SRC_NOT_SUPPORTED` para el MP4 servido desde una URL `blob:` en un `<video>` nativo.
- El workflow `verify` se ejecuta en `refactor/**`. La publicación a Pages queda reservada a pushes a `main`.
