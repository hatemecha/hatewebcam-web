# Seguridad

hatewebcam es una aplicación estática que corre en el navegador. No hay backend propio, cuentas ni telemetría.

## Versiones cubiertas

Se aceptan reportes contra:

- la rama `main`
- el despliegue público en [GitHub Pages](https://hatemecha.github.io/hatewebcam-web/)

No hay versiones con soporte de parches a largo plazo.

## Cómo reportar

Usá [GitHub Security Advisories](https://github.com/hatemecha/hatewebcam-web/security/advisories/new) para avisos privados.

Si no podés abrir un advisory, abrí un [GitHub Issue](https://github.com/hatemecha/hatewebcam-web/issues) describiendo el impacto y el entorno (navegador y sistema), sin un PoC público. No incluyas grabaciones, capturas ni datos personales de terceros.

No hay un correo privado de seguridad publicado.

## Alcance

En alcance: el código de este repositorio, la CSP de `index.html` y el manejo local de cámara, archivos y `localStorage`.

Fuera de alcance: vulnerabilidades solo del navegador, de MediaPipe, Mediabunny o Font Awesome, y reportes que requieran un origen malicioso distinto de esta app.
