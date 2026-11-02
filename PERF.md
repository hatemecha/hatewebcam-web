# Rendimiento de grabación

## Detector en tiempo real — 2026-09-11

El perfil de grabación solicitaba análisis síncrono de blobs (`best`). Además, un worker ocupado provocaba lectura de píxeles y análisis síncrono de respaldo en lugar de reutilizar la detección anterior. La grabación ahora usa análisis en tiempo real; el worker ocupado no genera lecturas ni análisis duplicados. La exportación conserva el análisis exacto por fotograma y la resolución de grabación no cambia.

Medición con Chromium/Playwright, cámara simulada, exposición 30, seguimiento de color y MediaRecorder durante 10 segundos:

| Experimento                               | Mediana / p95 de renderizado | Resultado                                     |
| ----------------------------------------- | ---------------------------- | --------------------------------------------- |
| Original                                  | 26 / 28,1 ms                 | Referencia, 20 FPS                            |
| Worker + WebGL para ajuste base al grabar | 51 / 58,2 ms                 | WebGL descartado: empeoró el resultado        |
| Worker sin WebGL adicional                | 21,3 / 26,8 ms               | Conservado: 18 % menos tiempo mediano, 20 FPS |
| Repetición aislada                        | 22,5 / 26,4 ms               | 21 FPS; video 1280 × 720 reproducido          |

La regresión reproduce 16 fotogramas con el worker ocupado: cero lecturas de píxeles y cero análisis síncronos adicionales. Comprueba reanudación, fallback sin worker y exportación síncrona.

## Blanco y negro, producción y Helium

El filtro Canvas2D aplicaba siempre brillo, contraste, saturación y gris, incluso con valores neutros. Blanco y negro aplicaba tanto saturación cero como gris completo. La nueva cadena omite operaciones neutras y conserva una única conversión a gris. La prueba de píxeles compara la cadena original y la nueva en 12 combinaciones de exposición, contraste y blanco y negro, con tolerancia máxima de 1/255.

Comparación con cámara simulada, exposición 30, seguimiento de color, blanco y negro y 10 segundos de grabación. La referencia es la versión publicada `fa662d8`; el cambio se prueba con el build de producción local:

| Navegador y resolución                       | Publicado: mediana / p95 | Corregido: mediana / p95 |
| -------------------------------------------- | ------------------------ | ------------------------ |
| Chromium de Playwright, 1280 × 720           | 23,3 / 26,6 ms           | 14,8 / 17 ms             |
| Helium instalado, 151.0.7922.71, 1920 × 1080 | 15,3 / 22,3 ms           | 13,4 / 17,7 ms           |

## Look avanzado + Face Mesh en worker — 2026-09-11

Con sombras, luces, detalle y nitidez activos, `applyAdvancedPixelAdjustments` hacía `getImageData` + bucle JS + sharpen en CPU a casi 1080p en cada fotograma de grabación. Face Mesh en el hilo principal sumaba bloqueos largos al inicializar WASM.

Cambios:

- El look completo (base + tono + nitidez) corre en WebGL durante vista previa y grabación; la exportación sigue en CPU.
- Face Mesh permanece en el hilo principal (el worker experimental no arma GL con este MediaPipe). En tiempo real analiza a ≤480 px y sin `refineLandmarks`; al grabar el intervalo sube a 100 ms y el análisis a ≤384 px.

Aislamiento en Helium 151, cámara simulada 1920 × 1080, 10 s de MediaRecorder:

| Caso                                         | Antes (FPS archivo) | Después (FPS archivo) |
| -------------------------------------------- | ------------------- | --------------------- |
| Solo look avanzado (sombras/detalle/nitidez) | ~3,6                | ~24                   |
| Estrés frío (BW + blob + face + look)        | ~2 / hueco > 5 s    | ~21 / hueco ≤ 0,5 s   |
| Estrés caliente (mismo perfil)               | —                   | ~22 / hueco ≤ 0,3 s   |
| Estrés 1080p tras downscale Face Mesh        | —                   | ~22 FPS archivo       |
| Estrés 720p tras downscale Face Mesh         | —                   | ~27 FPS archivo       |

### Reproducir

Ejecutar sin otras pruebas de navegador simultáneas:

```powershell
npm run build
npx serve dist -l 4175
# En otra terminal:
$env:RECORDING_BENCH_URL = 'http://127.0.0.1:4175/'
$env:RECORDING_BENCH_BW = '1'
$env:RECORDING_BENCH_STRESS = '1'
$env:RECORDING_BENCH_WIDTH = '1920'
$env:RECORDING_BENCH_HEIGHT = '1080'
$env:RECORDING_BENCH_OUTPUT = 'test-results/recording-stress.webm'
node scripts/recording-benchmark.mjs
```

Opcionalmente, `RECORDING_BENCH_BROWSER` selecciona un ejecutable Chromium/Helium. `RECORDING_BENCH_WARM=0` omite la espera al detector de caras.

### CI y publicación

Pages solo se publica después de que el job `test` del CI pase, mediante `workflow_call` desde `ci.yml` en pushes a `main`.

Estos resultados no garantizan todas las combinaciones de efectos ni FPS universales: los filtros, la segmentación, la resolución y el codificador dependen del equipo.
