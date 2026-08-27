# Changelog

## 0.1.0 (beta)

Estado actual de `main`. Durante la beta el número de `package.json` no implica semver.

- Vista previa de cámara con filtros, detectores (color, caras, pestañeos) y captura de foto/video.
- Editor local de video con recorte, efectos por intervalos, marcadores y exportación WebM/MP4 según el navegador.
- Interfaz en español e inglés, perfiles en `localStorage` y runtime vendorizado (sin CDN).
- Capturas de README comprimidas; empty state de Video centra la importación y oculta la timeline hasta que hay fuente.
- Arranque y persistencia endurecidos ante plantillas incompletas, storage bloqueado y JSON con tipos inesperados.
- Detectores liberan Web Workers y recursos FaceMesh al desactivarse para evitar degradación en sesiones largas.
- Pruebas adversariales y presupuesto de rendimiento cubren fallos del navegador, entradas hostiles y tráfico externo inesperado.
- Cadena de suministro reforzada con dependencias auditadas y GitHub Actions fijadas por commit.
