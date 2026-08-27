const STORAGE_KEY = 'hatewebcam_locale';
const SUPPORTED_LOCALES = new Set(['es', 'en']);
const TRANSLATABLE_ATTRIBUTES = ['aria-label', 'title', 'placeholder'];

// Spanish is the source language. Longer phrases run first so dynamic messages
// can be translated without coupling the UI layer to every controller method.
const ENGLISH_REPLACEMENTS = Object.entries({
  Dispositivo: 'Device',
  'Saltar al visor': 'Skip to viewer',
  'Reducí duración o usá Rápido/Balanceado antes de exportar.':
    'Reduce the duration or use Fast/Balanced before exporting.',
  'Recomendación: usar Balanceado o 720p/30.':
    'Recommendation: use Balanced or 720p/30.',
  'Si la pestaña se vuelve lenta, usá Rápido.':
    'If the tab becomes slow, use Fast.',
  Compás: 'Bar',
  'Mové el cursor al clip para previsualizar':
    'Move the playhead onto the clip to preview',
  Tramo: 'Range',
  'Diagnóstico: WebCodecs no disponible. Usá Chrome o Edge actualizado.':
    'Diagnostics: WebCodecs unavailable. Use an up-to-date Chrome or Edge.',
  'Diagnóstico: VideoFrame no disponible. Usá Chrome o Edge actualizado.':
    'Diagnostics: VideoFrame unavailable. Use an up-to-date Chrome or Edge.',
  'no soportado': 'unsupported',
  'sin codec': 'no codec',
  'audio se intentará si es compatible':
    'audio will be attempted when compatible',
  'Configuración de webcam restablecida': 'Webcam configuration reset',
  '¿Restablecer toda la configuración de webcam? Los perfiles guardados no se eliminarán.':
    'Reset all webcam settings? Saved profiles will not be deleted.',
  '¿Eliminar todos los perfiles guardados? Esta acción no restablece la webcam.':
    'Delete all saved profiles? This does not reset the webcam.',
  'Nombre para este ajuste:': 'Name for this preset:',
  '¿Eliminar': 'Delete',
  'No se pudieron guardar los ajustes locales en este navegador.':
    'Local settings could not be saved in this browser.',
  'Ocultar ajustes avanzados': 'Hide advanced settings',
  'No hay perfiles guardados': 'There are no saved presets',
  'Perfiles guardados eliminados': 'Saved presets deleted',
  guardado: 'saved',
  cargado: 'loaded',
  eliminado: 'deleted',
  '¿Qué detectar?': 'What should be detected?',
  'Elegí si querés buscar un color específico, zonas de mucha luz o zonas oscuras.':
    'Choose whether to detect a specific color, bright areas or dark areas.',
  'Un color específico': 'A specific color',
  'Color objetivo actualizado.': 'Target color updated.',
  'Color objetivo': 'Target color',
  'Color a detectar': 'Color to detect',
  'Elegir en el video': 'Pick from video',
  'Si la detección es demasiado estricta, subí este valor. Si detecta demasiado, bajalo.':
    'Raise this value if detection is too strict. Lower it if too much is detected.',
  'Estos controles permiten ajustar el rango de color manualmente usando el modelo HSV (Tono, Saturación, Brillo).':
    'These controls manually adjust the color range using the HSV model (Hue, Saturation, Value).',
  'Tono mínimo (H)': 'Minimum hue (H)',
  'Saturación mín. (S)': 'Minimum saturation (S)',
  'Brillo mínimo (V)': 'Minimum value (V)',
  'Tono máximo (H)': 'Maximum hue (H)',
  'Saturación máx. (S)': 'Maximum saturation (S)',
  'Brillo máx. (V)': 'Maximum value (V)',
  'Cantidad y tamaño': 'Count and size',
  'Limitá cuántos objetos detectar y qué tan grandes deben ser para ser considerados.':
    'Limit how many objects are detected and how large they must be to count.',
  'Máximo de objetos': 'Maximum objects',
  'Tamaño mínimo (píxeles)': 'Minimum size (pixels)',
  'Si aparecen detecciones falsas o ruido, subí este valor para limpiar la imagen.':
    'Raise this value to clean up false detections or noise.',
  'Bajá la resolución de análisis si notás retraso. Subirla da más precisión, pero consume más CPU.':
    'Lower the analysis resolution if you notice lag. Raising it improves accuracy but uses more CPU.',
  'Resolución de análisis (%)': 'Analysis resolution (%)',
  'Mostrar posición (X, Y)': 'Show position (X, Y)',
  'Tamaño del texto': 'Text size',
  'Activá recuadro, blur/pixelado o ambos a la vez sobre cada cara detectada.':
    'Enable a box, blur/pixelation, or both on every detected face.',
  'Máximo de caras a detectar': 'Maximum faces to detect',
  'Tamaño del pixelado': 'Pixelation size',
  'Menos suavizado y menos retención responden más rápido. Si vibra demasiado, subilos un poco.':
    'Less smoothing and hold respond faster. Raise them slightly if detection jitters.',
  'Intervalo de análisis (ms)': 'Analysis interval (ms)',
  'Retención al perder cara (ms)': 'Hold after losing face (ms)',
  'Detección de pestañeos': 'Blink detection',
  'Cuando cerrás un ojo, se dibujan líneas entre los objetos detectados. Necesitás tener el detector de objetos activado para ver las conexiones.':
    'When you close an eye, lines are drawn between detected objects. The object detector must be enabled to see the connections.',
  'Sensibilidad (cuanto más alto, más fácil detectar)':
    'Sensitivity (higher is easier to detect)',
  'Frames cerrados mínimos': 'Minimum closed frames',
  'Suavizado del párpado (%)': 'Eyelid smoothing (%)',
  'Revisá que estés sirviendo el proyecto desde localhost/https y que existan los templates.':
    'Make sure the project is served from localhost/https and that the templates exist.',
  'No se pudo iniciar HateWebcam': 'HateWebcam could not start',
  'La exportación fiable requiere Chrome o Edge actualizado con WebCodecs.':
    'Reliable export requires an up-to-date Chrome or Edge with WebCodecs.',
  'Exportación bloqueada por riesgo de memoria. Reducí duración o usá Rápido/Balanceado.':
    'Export blocked due to memory risk. Reduce the duration or use Fast/Balanced.',
  'La exportación falló. Revisá espacio libre y permisos.':
    'Export failed. Check free disk space and permissions.',
  'No se pudo avanzar el video a tiempo durante la exportación.':
    'The video could not advance in time during export.',
  'No se pudo calcular la exportación antes de iniciar.':
    'The export could not be calculated before starting.',
  'WebCodecs no está disponible. Usá Chrome o Edge actualizado.':
    'WebCodecs is unavailable. Use an up-to-date Chrome or Edge.',
  'VideoFrame no está disponible. Usá Chrome o Edge actualizado.':
    'VideoFrame is unavailable. Use an up-to-date Chrome or Edge.',
  'No se descargó ningún archivo.': 'No file was downloaded.',
  'Exportación terminada y guardada.': 'Export finished and saved.',
  'Exportación terminada': 'Export finished',
  'Exportación cancelada.': 'Export canceled.',
  'Exportación cancelada': 'Export canceled',
  'Preparando exportación…': 'Preparing export…',
  'Importá un video para habilitar la exportación.':
    'Import a video to enable export.',
  'Importá un video para analizar su audio.':
    'Import a video to analyze its audio.',
  'No encontré pulsos claros en el audio.':
    'No clear beats were found in the audio.',
  'No encontré pulsos claros.': 'No clear beats were found.',
  'Audio analizado.': 'Audio analyzed.',
  'Detecta pulsos aproximados para ayudarte a sincronizar efectos. Podés mover o borrar marcadores manualmente.':
    'Detects approximate beats to help synchronize effects. You can move or delete markers manually.',
  'Se procesa localmente en resolución original. La preview no cambia la calidad final.':
    'Processed locally at the original resolution. Preview quality does not affect the final output.',
  'MP4, WebM y otros formatos compatibles. La exportación estable usa WebM sin audio.':
    'MP4, WebM and other supported formats. Stable export uses WebM without audio.',
  'MP4 o WebM. La exportación estable usa WebM sin audio.':
    'MP4 or WebM. Stable export uses WebM without audio.',
  'Importá un video primero. Después arrastrá Look, Color, Caras u Ojos a la timeline.':
    'Import a video first. Then drag Look, Color, Faces or Eyes onto the timeline.',
  'Importá un video primero. Después arrastrá Look, Subject FX, Color, Caras u Ojos a la timeline.':
    'Import a video first. Then drag Look, Subject FX, Color, Faces or Eyes onto the timeline.',
  'Hacé click en un clip de la timeline para ver cuándo empieza y termina. Los ajustes visuales están en la pestaña Ajustes.':
    'Click a timeline clip to see when it starts and ends. Visual settings are in the Settings tab.',
  'Mové o estirá el clip en la timeline, o editá los tiempos acá abajo.':
    'Move or stretch the clip on the timeline, or edit its times below.',
  'Importá un video para empezar. Los ajustes aparecen cuando seleccionás un clip de efecto en la timeline.':
    'Import a video to begin. Settings appear when you select an effect clip on the timeline.',
  'Seleccioná un clip en la timeline para editar sus opciones acá.':
    'Select a timeline clip to edit its options here.',
  'Arrastrá Look, Color, Caras u Ojos desde la barra de arriba.':
    'Drag Look, Color, Faces or Eyes from the bar above.',
  'Arrastrá Look, Subject FX, Color, Caras u Ojos desde la barra de arriba.':
    'Drag Look, Subject FX, Color, Faces or Eyes from the bar above.',
  'FX de sujeto': 'Subject FX',
  'Intensidad del efecto': 'Amount',
  'Reactividad': 'Reactivity',
  'Densidad': 'Density',
  'Persistencia': 'Persistence',
  'Escala': 'Scale',
  'Aleatorizar': 'Randomize',
  'Avanzado': 'Advanced',
  'Influencia movimiento': 'Motion influence',
  'Influencia beat': 'Beat influence',
  'Movimiento + beat': 'Motion + beat',
  'Preparando análisis…': 'Preparing analysis…',
  'Analizando sujeto…': 'Analyzing subject…',
  'Sujeto detectado': 'Subject detected',
  'No se detectó una persona': 'No person detected',
  'Análisis pausado': 'Analysis paused',
  'Hacé click en el clip para abrir sus ajustes.':
    'Click the clip to open its settings.',
  'Usá la pestaña Clip si querés cambiar solo la duración.':
    'Use the Clip tab if you only want to change its duration.',
  'Los cambios se aplican al instante; no hace falta guardar nada.':
    'Changes apply instantly; there is nothing to save.',
  'Arrastrá para seleccionar varios, mové clips o presioná M para marcar.':
    'Drag to select several items, move clips, or press M to add a marker.',
  'La línea roja marca el corte. Click sobre un clip de efecto.':
    'The red line marks the cut. Click an effect clip.',
  'Arrastrá los bordes rojos en VIDEO.': 'Drag the red edges on VIDEO.',
  'Hacé click o arrastrá a una pista.': 'Click or drag onto a track.',
  'Línea de tiempo. Arrastrá para elegir un tramo o mover el cursor.':
    'Timeline. Drag to select a range or move the playhead.',
  'Cortar todos los efectos en cada marcador':
    'Cut all effects at every marker',
  'Duración del efecto seleccionado': 'Duration of the selected effect',
  'Opciones del efecto activo': 'Active effect options',
  'Ajustes de video y look': 'Video and look settings',
  'Ajustes de color': 'Color settings',
  'Ajustes de caras': 'Face settings',
  'Ajustes de ojos': 'Eye settings',
  'Cambiar altura de la línea de tiempo': 'Resize timeline height',
  'Cambiar ancho del inspector': 'Resize inspector width',
  'Mover cursor de reproducción': 'Move playhead',
  'Posición del video': 'Video position',
  'Inicio del video': 'Start of video',
  'Fin del video': 'End of video',
  'Cortar clips (T)': 'Cut clips (T)',
  'Seleccionar (V)': 'Select (V)',
  'Play (Espacio)': 'Play (Space)',
  'Mover grilla 10 milisegundos antes': 'Move grid 10 milliseconds earlier',
  'Mover grilla 10 milisegundos después': 'Move grid 10 milliseconds later',
  'Importá un video para editar': 'Import a video to edit',
  'Importá un video': 'Import a video',
  'Importar video': 'Import video',
  'Retomar una edición': 'Resume an edit',
  'Abrí un proyecto .hatewebcam.json. Después te pediremos el video original.':
    'Open a .hatewebcam.json project. We will ask for the original video next.',
  'Arrastrá efectos a la timeline': 'Drag effects onto the timeline',
  'Exportá el resultado': 'Export the result',
  'Cómo editar': 'How to edit',
  'Asistencia de edición': 'Editing assistance',
  'Analizar audio': 'Analyze audio',
  'Usar mitad': 'Use half',
  'Usar doble': 'Use double',
  'Cada 2 beats': 'Every 2 beats',
  'Cada 4 beats': 'Every 4 beats',
  'Cada 8 beats': 'Every 8 beats',
  'Cada beat': 'Every beat',
  Regenerar: 'Regenerate',
  'Limpiar Edit Assist': 'Clear Edit Assist',
  'Preset de exportación': 'Export preset',
  'Salida del editor': 'Editor output',
  'Video + efectos': 'Video + effects',
  'Solo efectos chroma': 'Chroma effects only',
  'Mostrar opciones experimentales': 'Show experimental options',
  'Formato de exportación': 'Export format',
  'Copiar audio original si es compatible':
    'Copy original audio when compatible',
  'Chroma para composición': 'Chroma for compositing',
  'Alta calidad': 'High quality',
  'MP4 (Premiere, puede ser lento)': 'MP4 (Premiere, may be slow)',
  'Estable: WebM · sin audio': 'Stable: WebM · no audio',
  'Exportar video': 'Export video',
  'Clip seleccionado': 'Selected clip',
  'Editar ajustes': 'Edit settings',
  'Eliminar clip': 'Delete clip',
  Automatización: 'Automation',
  'Pulso en beat': 'Beat pulse',
  'Alternar cada beat': 'Alternate each beat',
  'Guardar proyecto': 'Save project',
  'Cargar proyecto': 'Load project',
  'Ningún archivo cargado': 'No file loaded',
  'Ningún efecto cruza esos marcadores.': 'No effect crosses those markers.',
  'Elegí un punto dentro del clip.': 'Choose a point inside the clip.',
  'Soltá el efecto sobre la timeline.': 'Drop the effect onto the timeline.',
  'El video no coincide con el proyecto cargado. Elegí el archivo original.':
    'The video does not match the loaded project. Choose the original file.',
  'El video no contiene resolución o duración válidas.':
    'The video does not contain a valid resolution or duration.',
  'Importá un video antes de guardar el proyecto.':
    'Import a video before saving the project.',
  'Proyecto cargado. Reimportá el video original para restaurarlo.':
    'Project loaded. Re-import the original video to restore it.',
  'El archivo de proyecto no es válido.': 'The project file is invalid.',
  'Elegí un archivo de video válido.': 'Choose a valid video file.',
  'Reemplazá el video o exportá cuando termines.':
    'Replace the video or export when you are done.',
  'Importá un archivo para empezar.': 'Import a file to begin.',
  'Iniciando cámara automáticamente...': 'Starting camera automatically...',
  'Estamos preparando la imagen.': 'Preparing the image.',
  'Leyendo metadata del video...': 'Reading video metadata...',
  'Cámara apagada': 'Camera off',
  'Encendé la cámara para ver la imagen.':
    'Turn on the camera to see the image.',
  'Encender cámara': 'Turn on camera',
  'Permiso de cámara denegado': 'Camera permission denied',
  'Permiso de cámara': 'Camera permission',
  'Aceptá el permiso del sitio para continuar.':
    'Allow camera access for this site to continue.',
  'Iniciando cámara': 'Starting camera',
  'Cámara funcionando': 'Camera running',
  'La cámara está lista.': 'The camera is ready.',
  'Habilitá la cámara para este sitio y volvé a intentarlo.':
    'Enable the camera for this site and try again.',
  'Revisá el ícono de permisos junto a la dirección del sitio.':
    'Check the permissions icon next to the site address.',
  'No se encontró una cámara': 'No camera found',
  'Conectá una cámara o revisá que esté habilitada.':
    'Connect a camera or make sure it is enabled.',
  'La cámara está ocupada': 'The camera is busy',
  'Cerrá la aplicación que la está usando y reintentá.':
    'Close the application using it and try again.',
  'Configuración no soportada': 'Unsupported configuration',
  'Probá otra cámara o el modo Balanceado.':
    'Try another camera or Balanced mode.',
  'No se pudo iniciar la cámara': 'The camera could not start',
  'Revisá los permisos y volvé a intentarlo.':
    'Check permissions and try again.',
  'La cámara no se inició automáticamente. Volvé a intentarlo.':
    'The camera did not start automatically. Try again.',
  'FPS bajo detectado. Se bajó la preview y el tracking.':
    'Low FPS detected. Preview and tracking quality were reduced.',
  'Cámara activa': 'Camera active',
  'No se pudo cambiar de cámara': 'Could not change camera',
  'Cargando cámaras...': 'Loading cameras...',
  'No se encontraron cámaras': 'No cameras found',
  'Primero encendé la cámara': 'Turn on the camera first',
  'Primero cerrá la vista previa actual': 'Close the current preview first',
  'Esperá un momento y volvé a sacar la foto':
    'Wait a moment and take the photo again',
  'Cancelá el temporizador antes de grabar':
    'Cancel the timer before recording',
  'Tu navegador no soporta grabación':
    'Your browser does not support recording',
  'Esperá un momento y reintentá la grabación':
    'Wait a moment and try recording again',
  'No se pudo iniciar la grabación': 'Recording could not start',
  'Grabación detenida. Preparando vista previa.':
    'Recording stopped. Preparing preview.',
  'Grabación cancelada.': 'Recording canceled.',
  'MP4 no disponible en este navegador. Se usará WebM.':
    'MP4 is unavailable in this browser. WebM will be used.',
  'WebM no disponible en este navegador. Se usará MP4.':
    'WebM is unavailable in this browser. MP4 will be used.',
  'Detener grabación': 'Stop recording',
  'Grabar video': 'Record video',
  'Grabación iniciada en': 'Recording started in',
  'Captura lista': 'Capture ready',
  'Cerrar vista previa': 'Close preview',
  'Mejora de foto': 'Photo enhancement',
  'Mejorar antes de descargar': 'Enhance before downloading',
  'Sacar foto': 'Take photo',
  'Foto en': 'Photo in',
  Resolución: 'Resolution',
  Tamaño: 'Size',
  Duración: 'Duration',
  Fuente: 'Source',
  Rendimiento: 'Performance',
  'Calidad y fluidez de la vista previa': 'Preview quality and smoothness',
  'Elegir dispositivo de cámara': 'Choose camera device',
  'Modo de trabajo': 'Workspace mode',
  'Enlaces del proyecto': 'Project links',
  'Repositorio en GitHub': 'GitHub repository',
  'Controles rápidos para mobile': 'Quick mobile controls',
  'Cerrar panel de efectos': 'Close effects panel',
  'Temporizador de foto': 'Photo timer',
  'Sin temporizador': 'No timer',
  '5 segundos': '5 seconds',
  '10 segundos': '10 seconds',
  'Controles de captura': 'Capture controls',
  'Estado de detectores': 'Detector status',
  'Espejo en vista y captura': 'Mirror preview and capture',
  'Espejo (invertir horizontalmente)': 'Mirror (flip horizontally)',
  'Invertir verticalmente': 'Flip vertically',
  'Sin rotación': 'No rotation',
  '90° (girar derecha)': '90° (rotate right)',
  '180° (invertir)': '180° (flip)',
  '270° (girar izquierda)': '270° (rotate left)',
  'Elegir color': 'Pick color',
  'Color tracking objetos': 'Object tracking color',
  'Color tracking caras': 'Face tracking color',
  'Elegir color en el video': 'Pick color in the video',
  'Paleta de objetos': 'Object palette',
  'Paleta de caras': 'Face palette',
  'Nombre recuadro cara': 'Face box label',
  Detectores: 'Detectors',
  'Color a seguir': 'Color to track',
  'Color del recuadro': 'Box color',
  'Desenfoque / pixelado': 'Blur / pixelation',
  Desenfoque: 'Blur',
  Etiqueta: 'Label',
  'Texto del recuadro': 'Box label',
  'Ajustes avanzados': 'Advanced settings',
  'Calidad foto JPEG': 'JPEG photo quality',
  'Formato de grabación': 'Recording format',
  'Automático (MP4 preferido)': 'Automatic (MP4 preferred)',
  'MP4 (si el navegador lo soporta)': 'MP4 (when supported)',
  'Mejorador de calidad opcional': 'Optional quality enhancer',
  'Sonido de obturador': 'Shutter sound',
  'Intensidad del mejorador': 'Enhancer strength',
  'Presets y filtros del clip LOOK seleccionado. Previsualizá moviendo el cursor dentro de su tramo.':
    'Presets and filters for the selected LOOK clip. Preview them by moving the playhead inside its range.',
  'Configurá el tracking de color del clip. El detector se enciende solo dentro de su tramo en la timeline.':
    'Configure color tracking for the clip. The detector turns on only within its timeline range.',
  'Personalizá recuadro, blur y etiqueta del clip CARAS. La detección se activa sola cuando el cursor entra en su tramo.':
    'Customize the box, blur and label for the FACES clip. Detection turns on when the playhead enters its range.',
  'Ajustá el detector del clip OJOS. Se activa solo dentro de su tramo en la timeline.':
    'Configure the EYES clip detector. It activates only within its timeline range.',
  'Las fotos se descargan en JPEG. La grabación de cámara intenta MP4 y, si no está disponible, usa WebM.':
    'Photos download as JPEG. Camera recording tries MP4 and uses WebM when MP4 is unavailable.',
  'Aplica limpieza y nitidez extra al archivo final.':
    'Applies extra cleanup and sharpness to the final file.',
  'Aplica limpieza y nitidez extra al video exportado.':
    'Applies extra cleanup and sharpness to the exported video.',
  'Ajustá orientación y encuadre de la cámara.':
    'Adjust camera orientation and framing.',
  'Ajustá orientación y encuadre del video.':
    'Adjust video orientation and framing.',
  'Personalizá el look en tiempo real. También aplica a foto y grabación.':
    'Customize the look in real time. It also applies to photos and recordings.',
  'Personalizá el look que se aplica a la preview y a la exportación.':
    'Customize the look applied to the preview and export.',
  'Guardá detectores, transforms y ajustes de imagen para reutilizarlos rápido.':
    'Save detectors, transforms and image settings for quick reuse.',
  'No cierres esta pestaña mientras se procesa el archivo.':
    'Do not close this tab while the file is being processed.',
  'Restablecer configuración de webcam': 'Reset webcam configuration',
  'Restablecer ajustes de imagen': 'Reset image settings',
  'Calidad de salida': 'Output quality',
  'Tipo de ajustes': 'Settings type',
  'Color visual del recuadro': 'Visible box color',
  'Paleta para el recuadro de color': 'Color box palette',
  'Paleta para el recuadro de caras': 'Face box palette',
  Monocromo: 'Monochrome',
  Exposición: 'Exposure',
  Sombras: 'Shadows',
  'Luces altas': 'Highlights',
  Contraste: 'Contrast',
  Saturación: 'Saturation',
  Temperatura: 'Temperature',
  Detalle: 'Detail',
  Nitidez: 'Sharpness',
  'Calidad efectiva de preview': 'Effective preview quality',
  'La exportación del editor se configura en Proyecto → Exportación.':
    'Editor export is configured under Project → Export.',
  'Más fluido': 'Smoother',
  'Más detalle': 'More detail',
  Automático: 'Automatic',
  Balanceado: 'Balanced',
  Balanceada: 'Balanced',
  Rápido: 'Fast',
  Vivo: 'Vivid',
  Cine: 'Cinema',
  Pestañeos: 'Blinks',
  Pestañeo: 'Blink',
  CARAS: 'FACES',
  Caras: 'Faces',
  Cámara: 'Camera',
  Cara: 'Face',
  Ojos: 'Eyes',
  OJOS: 'EYES',
  Recuadro: 'Box',
  Verde: 'Green',
  Azul: 'Blue',
  Proyecto: 'Project',
  Imagen: 'Image',
  'Ajuste fino': 'Fine tuning',
  'Ajustes guardados': 'Saved settings',
  Aspecto: 'Look',
  Ajustes: 'Settings',
  Herramientas: 'Tools',
  Reproducción: 'Playback',
  Inicio: 'Start',
  Final: 'End',
  Imán: 'Snap',
  Alejar: 'Zoom out',
  Acercar: 'Zoom in',
  Deshacer: 'Undo',
  Rehacer: 'Redo',
  'Efectos para arrastrar a la timeline': 'Effects to drag onto the timeline',
  Efectos: 'Effects',
  Seleccionar: 'Select',
  Cortar: 'Cut',
  'En marcadores': 'At markers',
  'Importar y exportar': 'Import and export',
  Marcadores: 'Markers',
  'Cada 2': 'Every 2',
  'Cada 4': 'Every 4',
  'Cada 8': 'Every 8',
  Rotación: 'Rotation',
  Diagnóstico: 'Diagnostics',
  Exportación: 'Export',
  Desde: 'From',
  Hasta: 'To',
  Fija: 'Fixed',
  Eliminar: 'Delete',
  'Eliminar todos los perfiles guardados': 'Delete all saved profiles',
  'todos los perfiles guardados': 'all saved profiles',
  Restablecer: 'Reset',
  Cancelar: 'Cancel',
  Descargar: 'Download',
  Descartar: 'Discard',
  'Guardar configuración actual': 'Save current settings',
  Idioma: 'Language',
  Exportar: 'Export',
  'Exportando video': 'Exporting video',
  Listo: 'Done',
  Apagar: 'Turn off',
  Espejo: 'Mirror',
  Foto: 'Photo',
  Personalizado: 'Custom',
  Grabar: 'Record',
  Temporizador: 'Timer',
  Intensidad: 'Strength',
  Configuración: 'Configuration',
  Reintentar: 'Try again',
  'Error de exportación': 'Export error',
}).sort(([a], [b]) => b.length - a.length);

let currentLocale = 'es';
const textSources = new WeakMap();
const attributeSources = new WeakMap();
let observer = null;

function detectLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED_LOCALES.has(stored)) return stored;
  } catch {
    // Storage can be unavailable in private or hardened browser contexts.
  }

  const languages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const language of languages) {
    const base = language?.toLowerCase().split('-')[0];
    if (SUPPORTED_LOCALES.has(base)) return base;
  }
  return 'en';
}

export function translate(value, locale = currentLocale) {
  if (locale === 'es' || typeof value !== 'string' || !value) return value;
  let result = value;
  for (const [spanish, english] of ENGLISH_REPLACEMENTS) {
    if (result.includes(spanish)) result = result.split(spanish).join(english);
  }
  return result;
}

function translateTextValue(value) {
  if (currentLocale === 'es' || !value.trim()) return value;
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const compact = value.trim().replace(/\s+/g, ' ');
  return `${leading}${translate(compact, currentLocale)}${trailing}`;
}

function translateTextNode(node, preserveSource) {
  const current = node.nodeValue ?? '';
  let source = textSources.get(node);
  if (
    source === undefined ||
    (!preserveSource && current !== translateTextValue(source))
  ) {
    source = current;
    textSources.set(node, source);
  }
  const localized = translateTextValue(source);
  if (current !== localized) node.nodeValue = localized;
}

function translateElementAttributes(element, preserveSource) {
  let sources = attributeSources.get(element);
  if (!sources) {
    sources = new Map();
    attributeSources.set(element, sources);
  }

  for (const name of TRANSLATABLE_ATTRIBUTES) {
    if (!element.hasAttribute(name)) continue;
    const current = element.getAttribute(name) ?? '';
    let source = sources.get(name);
    if (
      source === undefined ||
      (!preserveSource && current !== translate(source, currentLocale))
    ) {
      source = current;
      sources.set(name, source);
    }
    const localized = translate(source, currentLocale);
    if (current !== localized) element.setAttribute(name, localized);
  }
}

function translateTree(root, preserveSource = false) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root, preserveSource);
    return;
  }
  if (!(root instanceof Element || root instanceof Document)) return;

  if (root instanceof Element) {
    if (root.matches('script, style')) return;
    translateElementAttributes(root, preserveSource);
  }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;
      if (!parent?.matches('script, style')) {
        translateTextNode(node, preserveSource);
      }
    } else if (node instanceof Element) {
      translateElementAttributes(node, preserveSource);
    }
    node = walker.nextNode();
  }
}

function updateLanguageSelector() {
  const selector = document.querySelector('#languageSelect');
  if (selector) selector.value = currentLocale;
}

export function setLocale(locale, { persist = true } = {}) {
  if (!SUPPORTED_LOCALES.has(locale)) return;
  currentLocale = locale;
  document.documentElement.lang = locale;
  translateTree(document, true);
  updateLanguageSelector();

  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // The in-memory preference still applies for this page.
    }
  }

  document.dispatchEvent(
    new CustomEvent('hatewebcam:localechange', { detail: { locale } }),
  );
}

export function getLocale() {
  return currentLocale;
}

export function initializeI18n() {
  currentLocale = detectLocale();
  document.documentElement.lang = currentLocale;
  translateTree(document);
  updateLanguageSelector();

  document
    .querySelector('#languageSelect')
    ?.addEventListener('change', (event) => {
      setLocale(event.currentTarget.value);
    });

  observer?.disconnect();
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        translateTextNode(mutation.target, false);
      } else if (mutation.type === 'attributes') {
        translateElementAttributes(mutation.target, false);
      } else {
        for (const node of mutation.addedNodes) translateTree(node);
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATABLE_ATTRIBUTES,
  });

  return {
    getLocale,
    setLocale,
    translateDocument: () => translateTree(document),
  };
}
