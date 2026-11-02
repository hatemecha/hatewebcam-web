# Rendimiento de grabación

Notas de ingeniería sobre decisiones de rendimiento. Para reproducir números, usar `scripts/recording-benchmark.mjs` contra un build de producción (`npm run build` + servir `dist/`).

## Detector en tiempo real

La grabación reutiliza la última detección del worker cuando está ocupado; no repite lectura de píxeles ni análisis síncrono en la UI. La exportación sigue usando análisis exacto por fotograma.

## Look avanzado y Face Mesh

El look (tono + nitidez) corre en WebGL en vista previa y grabación. Face Mesh en tiempo real usa resolución reducida e intervalo mayor al grabar para evitar caídas a pocos FPS.

## Reproducir estrés local

```powershell
npm run build
npx serve dist -l 4175
$env:RECORDING_BENCH_URL = 'http://127.0.0.1:4175/'
$env:RECORDING_BENCH_STRESS = '1'
node scripts/recording-benchmark.mjs
```

Variables opcionales: `RECORDING_BENCH_BROWSER`, `RECORDING_BENCH_BW`, `RECORDING_BENCH_WARM`, dimensiones y ruta de salida (ver script).

## CI y Pages

GitHub Pages se publica solo si el workflow `ci.yml` pasa en `main`.

Los resultados dependen del navegador, GPU, codificador y combinación de efectos activos.
