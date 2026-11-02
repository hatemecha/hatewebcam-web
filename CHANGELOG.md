# Changelog

## 0.1.0

Primera release pública con historial de repositorio consolidado.

- Webcam en vivo con filtros WebGL, detectores (color, Face Mesh, pestañeos) y captura foto/video local.
- Editor de video con timeline por intervalos, marcadores, imán, historial undo/redo y proyectos `.hatewebcam.json`.
- Visual FX: pipeline GPU multipass con feedback temporal, macros de control, targeting Todo/Persona/Fondo y export estable.
- Exportación WebCodecs: presets rápido, balanceado, alta y chroma para composición en Premiere o DaVinci Resolve; MP4 H.264 experimental con copia de audio cuando el navegador lo permite.
- Grabación bajo efectos pesados optimizada (workers reutilizados, Face Mesh a resolución reducida).
- Interfaz ES/EN, perfiles en `localStorage`, runtime vendorizado sin CDN.
- Sistema visual Graphite Bench (`DESIGN.md`).
- Nomenclatura pública unificada en Visual FX (sin restos Subject FX en UI, docs ni aliases de config).
- Editor partido en módulos bajo `js/app/video-editor/`; tipo de clip `visual-fx` (proyectos viejos con `subject` se migran al cargar).
- CI único: verify + deploy Pages desde el mismo artefacto; auditoría npm solo en dependencias de producción.
- Pulido UI alineado con DESIGN (tabs planos, iconos, preview, toolbar de video); README conciso ES + EN.
