export const S = {
  appName: "transcribe",

  // Home
  record: "Grabar",
  recordDesc: "Graba desde el micrófono",
  transcribe: "Transcribir",
  transcribeDesc: "Archivo local o enlace URL",
  recent: "Recientes",
  noRecent: "Sin transcripciones recientes",

  // Recording
  recording: "Grabando...",
  stopRecording: "Detener grabación",
  cancel: "Cancelar",
  recordingSaved: "Grabación guardada",
  duration: "Duración",
  transcribeNow: "Transcribir ahora",
  discard: "Descartar",

  // Transcription
  transcribing: "Transcribiendo...",
  chunkProgress: (completed: number, total: number) =>
    `Chunk ${completed} de ${total}`,
  transcriptionDone: "Transcripción lista",
  savedAt: "Guardado en",
  openFile: "Abrir archivo",
  copyText: "Copiar texto",
  copied: "Copiado",
  backToHome: "Volver al inicio",
  back: "Volver",

  // Transcribe view
  dropzone: "Arrastrá un archivo aquí",
  dropzoneClick: "o hacé clic para buscar",
  dropzoneFormats: "mp3, wav, m4a, ogg, flac, mp4, webm",
  orPasteLink: "o pegar un enlace",
  supportedSources: "Soportado: YouTube, Instagram",
  urlPlaceholder: "https://youtube.com/watch?v=... o https://instagram.com/p/...",

  // Options
  provider: "Proveedor",
  language: "Idioma",
  timestamps: "Incluir timestamps",
  translateToEnglish: "Traducir al inglés",
  whisperOnly: "(solo Whisper)",
  autoDetect: "Auto-detectar",
  speakers: "Identificar hablantes",
  speakersDesc: "(solo ElevenLabs)",
  numSpeakers: "Cantidad de hablantes",
  numSpeakersAuto: "Auto-detectar",

  // Settings
  settings: "Configuración",
  apiKeys: "Claves API",
  notConfigured: "No configurada",
  change: "Cambiar",
  add: "Agregar",
  save: "Guardar",
  preferences: "Preferencias",
  defaultProvider: "Proveedor por defecto",
  defaultLanguage: "Idioma por defecto",
  outputFolder: "Carpeta de salida",
  alwaysTimestamps: "Siempre incluir timestamps",
  system: "Sistema",
  installed: "Instalado",
  notInstalled: "No instalado",

  // Speaker rename
  editSpeakers: "Editar hablantes",
  speakerNamePlaceholder: "Nombre real",
  speakersRenamed: "Hablantes renombrados",
  confirm: "Confirmar",

  // Errors
  noApiKey: "No se encontró la clave API.",
  configure: "Configurar",
  missingDep: (name: string) =>
    `${name} no está instalado. Ejecutar: brew install ${name}`,
  apiError: "Error en la transcripción",
  retry: "Reintentar",
  unsupportedFormat: "Formato no soportado",

  // Languages
  languages: [
    { value: "auto", label: "Auto-detectar" },
    { value: "es", label: "Español" },
    { value: "en", label: "Inglés" },
    { value: "pt", label: "Portugués" },
    { value: "fr", label: "Francés" },
    { value: "de", label: "Alemán" },
    { value: "it", label: "Italiano" },
    { value: "ja", label: "Japonés" },
    { value: "zh", label: "Chino" },
    { value: "ko", label: "Coreano" },
  ],
} as const;
