# Contribuir a hatewebcam

Gracias por querer mejorar el proyecto. Este es un proyecto personal mantenido por Alex Romero (`hatemecha`); las decisiones finales de alcance y diseño quedan a cargo del mantenedor.

## Antes de empezar

- Para bugs o propuestas acotadas, abrí un issue con pasos para reproducir, navegador y sistema operativo.
- Para cambios grandes, proponé primero el enfoque en un issue para evitar trabajo que no encaje con el proyecto.
- No incluyas grabaciones, capturas ni datos personales de terceros en issues o pull requests.

## Desarrollo

Requiere Node.js `^20.19.0` o `>=22.12.0`.

```bash
npm ci
npm run dev
```

Antes de enviar un pull request:

```bash
npm run format:check
npm run lint
npm test
npm run build
npm run test:browser
```

El pull request debe explicar el problema, el cambio realizado y cómo se verificó. Mantené los cambios pequeños y no agregues dependencias o servicios externos sin justificar su necesidad.

## Conducta

Participá con respeto y criticá ideas, no personas. El mantenedor puede moderar interacciones que dificulten una colaboración segura y constructiva.

Al contribuir aceptás que tu aporte se distribuya bajo la [licencia MIT](LICENSE) del proyecto.
