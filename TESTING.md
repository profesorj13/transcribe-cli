# Hoja de tests — transcribe-cli

Relevamiento e2e del 2026-07-20 (50 casos, CLI + app desktop). Correr ante cualquier cambio.
Los IDs `*-B*` referencian bugs de ese relevamiento (corregidos); sirven como foco de regresión.
Todos los comandos se corren **desde la raíz del repo**.

## 0. Gates automáticos (~2 min, sin API)

```bash
bun install
bun run typecheck                 # tsc --noEmit del CLI
bun run test                      # tests del CLI (bun test ./src; el ./ evita colarse en desktop/)

# desktop (Rust + front)
export CARGO_TARGET_DIR=$HOME/.cache/cargo-target/transcribe-desktop   # NUNCA buildear dentro de ~/Desktop (iCloud)
(cd desktop/src-tauri && cargo check && cargo test)                     # comandos Rust (rename, truncado, speakers)
(cd desktop && bun install && bun test)                                 # flujos de UI (happy-dom + testing-library)
(cd desktop && bun run build)                                           # tsc -b + vite build
```

Los tests de UI del desktop (`desktop/src/**/*.test.tsx`) ejercitan los clicks reales del
usuario contra el IPC de Tauri mockeado (ver `desktop/src/test/setup.ts`), sin backend ni
ventana. Cubren hoy (33 tests):

- **RecordingDone** — **B1** (renombrar impacta el `.md`, incluido el caso de transcribir sin
  confirmar el ✓) y **B2** (progreso por chunks, error visible, done y cancelar).
- **ResultView** — copiar el `.md` **completo** (B09, con fallback al preview), editar hablantes
  (manda solo los nombres no vacíos y refleja el nuevo preview), abrir archivo, volver.
- **TranscribeView** — drag & drop nativo (B07, la ruta real llega por el webview), URL
  soportada/ no soportada habilita/deshabilita transcribir, args que viajan a `transcribe`,
  error de arranque visible (B03), cancelar en progreso mata el proceso hijo.
- **SettingsSheet** — claves API enmascaradas (nunca en claro), agregar clave persiste vía
  `save_config`, preferencias (toggle / select) se guardan al cambiar.
- **RecentList** — estado vacío y abrir un reciente por su ruta.

Los `cargo test` cubren el lado Rust de esos flujos (`rename_recording`, `expand_tilde`,
truncado UTF-8, `rename_speakers`). Estos tests validan la **lógica** de cada componente +
comando; el "todo junto en la ventana WKWebView real" (sobre todo grabar → renombrar →
transcribir) sigue necesitando un smoke test manual en la app, porque no se puede clickear el
webview nativo desde los tests.

### Gate automático al pushear (hook local)

Hay un hook versionado en `.githooks/pre-push` que corre los tests rápidos (CLI + UI del
desktop) y el build antes de cada `git push`; si algo falla, el push se bloquea. Se activa
**una sola vez por clone**:

```bash
git config core.hooksPath .githooks
```

Bypass de emergencia: `git push --no-verify`. El hook no corre `cargo test` a propósito
(primera compilación lenta + `CARGO_TARGET_DIR` fuera de `~/Desktop`); esos se corren a mano.
No hay CI que corra tests todavía: el gate real vive en este hook y en los comandos de arriba.

## 1. Setup para los e2e con API real (cuesta centavos)

Requiere `ffmpeg`, `ffprobe`, API keys en `~/.config/transcribe-cli/config.json`.

```bash
export T=$(mktemp -d)             # carpeta scratch para audios y salidas
say -v Monica -o $T/voz.aiff 'Hola, esto es una prueba de transcripción para la hoja de tests'
ffmpeg -y -i $T/voz.aiff $T/voz.mp3
# audio >5 min para probar el split en chunks:
for i in $(seq 1 30); do printf "file '%s'\n" $T/voz.mp3; done > $T/lista.txt
ffmpeg -y -f concat -safe 0 -i $T/lista.txt -c copy $T/largo.mp3
```


## CLI

### Automatizables (correr con el setup de arriba)

- [ ] **cli-01 — Transcripción básica de archivo local (default ElevenLabs) genera .md junto al audio**
  - Esperado: El proceso transcribe y ESCRIBE el markdown junto al audio como $T/voz.md, con el heading 'Transcripción: voz.mp3', metadata (Archivo/Fecha/Modelo) y el texto. Exit 0.
  ```bash
  cd . && bun run bin/trans.ts $T/voz.mp3; echo exit=$?; ls -la $T/voz.md
  ```
- [ ] **cli-02 — Transcripción con --provider whisper**
  - Esperado: Usa OpenAI Whisper (Modelo: whisper-1 en el md), transcribe el audio y guarda voz.md junto al input. Exit 0.
  ```bash
  cd . && bun run bin/trans.ts -p whisper $T/voz.mp3; echo exit=$?
  ```
- [ ] **cli-03 — --output <path> escribe exactamente en la ruta indicada**
  - Esperado: El md se escribe en el path exacto dado por --output (ej. $T/salida.md), con contenido válido. Exit 0.
  ```bash
  cd . && bun run bin/trans.ts $T/voz.mp3 --output $T/salida.md; echo exit=$?; cat $T/salida.md
  ```
- [ ] **cli-04 — --output-dir conserva el nombre autogenerado y expande ~**
  - Esperado: Crea el directorio si no existe y escribe <outdir>/voz.md (nombre derivado del input). Con '~/x' expande a $HOME/x. Exit 0.
  ```bash
  cd . && bun run bin/trans.ts $T/voz.mp3 --output-dir $T/outdir; echo exit=$?; ls -la $T/outdir/voz.md
  ```
- [ ] **cli-05 — --timestamps agrega tabla de segmentos con tiempos MM:SS**
  - Esperado: El md incluye la sección '## Segmentos con timestamps' con columnas Inicio|Fin|Texto, tiempos formateados MM:SS crecientes y coherentes con el audio, y los '|' del texto escapados.
  ```bash
  cd . && bun run bin/trans.ts $T/voz.mp3 --timestamps --output $T/ts.md; grep -n 'Segmentos con timestamps\|Inicio' $T/ts.md
  ```
- [ ] **cli-07 — -t/--translate con whisper produce Traducción al inglés**
  - Esperado: El md tiene heading 'Traducción: …', el texto está en inglés y el mensaje final dice 'Translation saved to'. Exit 0.
  ```bash
  cd . && bun run bin/trans.ts -p whisper -t $T/voz.mp3 --output $T/tr.md; head -3 $T/tr.md
  ```
- [ ] **cli-08 — --translate con ElevenLabs (default) da error claro sin gastar API**
  - Esperado: Falla ANTES de llamar a la API con mensaje 'Translation is not supported with ElevenLabs. Use --provider whisper…' y exit 1. Idealmente el mensaje sugiere el comando exacto.
  ```bash
  cd . && bun run bin/trans.ts -t $T/voz.mp3; echo exit=$?
  ```
- [ ] **cli-09 — --speakers con whisper da error claro**
  - Esperado: Falla con 'Speaker diarization is not supported with Whisper. Use --provider elevenlabs…' y exit 1, sin llamar a la API.
  ```bash
  cd . && bun run bin/trans.ts -p whisper --speakers $T/voz.mp3; echo exit=$?
  ```
- [ ] **cli-14 — Sin API key en ningún lado: error claro con las 3 opciones**
  - Esperado: Falla con 'No OpenAI API key found' listando: (1) --api-key, (2) OPENAI_API_KEY, (3) trans config --set-key --provider whisper. Exit 1. Análogo para elevenlabs.
  ```bash
  cd . && env -i HOME=/tmp/nohome PATH="$PATH" bun run bin/trans.ts -p whisper $T/voz.mp3; echo exit=$?
  ```
- [ ] **cli-15 — API key inválida: mensaje localizado y accionable (401)**
  - Esperado: Al recibir 401, muestra 'La API key de OpenAI es inválida o expiró.' con link a platform.openai.com/api-keys y el comando para reconfigurar. Exit 1. (Análogo ElevenLabs).
  ```bash
  cd . && bun run bin/trans.ts --api-key sk-fakekey123 -p whisper $T/voz.mp3; echo exit=$?
  ```
- [ ] **cli-16 — Archivo inexistente: error 'File not found' sin llamar a la API**
  - Esperado: Imprime 'Error: File not found: <ruta absoluta>' y exit 1, sin intentar transcribir. (Confirmado OK).
  ```bash
  cd . && bun run bin/trans.ts $T/nope.mp3; echo exit=$?
  ```
- [ ] **cli-17 — Formato no soportado (.txt): error con lista de formatos válidos**
  - Esperado: Imprime 'No provider found for input: …' seguido de la lista de formatos soportados y URLs, exit 1. (Confirmado OK).
  ```bash
  cd . && printf hola > $T/doc.txt && bun run bin/trans.ts $T/doc.txt; echo exit=$?
  ```
- [ ] **cli-18 — Audio corrupto con extensión válida: mensaje claro de archivo ilegible**
  - Esperado: Debería fallar con un mensaje entendible tipo 'No se pudo leer el audio / archivo corrupto o formato inválido' y exit 1.
  ```bash
  cd . && printf 'no soy audio' > $T/fake.mp3 && bun run bin/trans.ts -p whisper --api-key sk-x $T/fake.mp3; echo exit=$?
  ```
- [ ] **cli-19 — Ruta con espacios y acentos: transcribe y nombra el .md correctamente**
  - Esperado: Transcribe y guarda 'mi audio ñandú.md' JUNTO al audio (mismo nombre, extensión .md). Exit 0.
  ```bash
  cd . && cp $T/voz.mp3 "$T/mi audio ñandú.mp3" && bun run bin/trans.ts "$T/mi audio ñandú.mp3"; echo exit=$?; ls -la "$T/mi audio ñandú.md"
  ```
- [ ] **cli-22 — Ruteo de inputs: file vs youtube vs instagram vs gdrive vs URL genérica**
  - Esperado: mp3/MP3 local -> file; youtube.com|youtu.be -> youtube; instagram.com/reel -> instagram; drive.google.com/file -> google-drive. Una URL http directa a un .mp3 NO se soporta hoy: debería dar un mensaje claro (o soportarse) en vez de 'No provider found' genérico.
  ```bash
  cd . && bun -e "import {getProvider} from './src/providers/index.ts'; for (const i of ['/a/x.mp3','/a/x.MP3','https://youtu.be/x','https://www.instagram.com/reel/x/','https://drive.google.com/file/d/x/view','https://host/a.mp3','/a/x.txt']){try{console.log(i,'->',getProvider(i).name)}catch(e){console.log(i,'-> ERR',(e as Error).message.split(String.fromCharCode(10))[0])}}"
  ```

### Parciales (validables por partes o trazando código)

- [ ] **cli-06 — --language pasa el código ISO al proveedor**
  - Pasos: 1. Tener voz.mp3 en español. 2. Ejecutar con --language es (whisper) y comparar contra sin flag.
  - Esperado: Se envía languageCode/language='es' a la API; el md reporta '**Idioma:** es' (o el idioma detectado) y la transcripción respeta el idioma. Exit 0.
  ```bash
  cd . && bun run bin/trans.ts -p whisper --language es $T/voz.mp3 --output $T/es.md; grep -n 'Idioma' $T/es.md
  ```
- [ ] **cli-10 — --speakers con ElevenLabs etiqueta hablantes y ofrece renombrarlos**
  - Pasos: 1. Generar audio con 2 voces (say -v Monica ... y say -v Jorge ... concatenados) en scratch. 2. Ejecutar con --speakers --num-speakers 2 y --output scratch. 3. Revisar el md y (en TTY) el prompt '¿Renombrar hablantes?'.
  - Esperado: El md agrupa el cuerpo por '**Hablante speaker_0:** …', muestra '**Hablantes:** N identificados', y en TTY pregunta si renombrar; al renombrar, reemplaza los labels en cuerpo y tabla. Exit 0.
  ```bash
  cd . && bun run bin/trans.ts --speakers --num-speakers 2 $T/dos-voces.mp3 --output $T/spk.md < /dev/null; grep -n 'Hablante' $T/spk.md
  ```
- [ ] **cli-11 — Audio >5min con ElevenLabs se parte en chunks y se ensambla en orden sin duplicar ni perder texto en los límites**
  - Pasos: 1. Generar audio >5min (ej. concatenar say varias veces o loop de voz.mp3 hasta ~6min) en scratch. 2. Ejecutar default (elevenlabs) con --output scratch. 3. Verificar log 'Processing N chunks' y revisar continuidad del texto en los cortes de 5:00.
  - Esperado: Se crean ceil(dur/5min) chunks, se transcriben en paralelo, y el texto final está en orden por índice de chunk, sin palabras duplicadas ni cortadas en los límites de 300s. Exit 0.
  ```bash
  cd . && bun run bin/trans.ts $T/largo.mp3 --output $T/largo11.md; echo exit=$?
  ```
- [ ] **cli-12 — Audio >5min con Whisper: timestamps continuos y corridos entre chunks**
  - Pasos: 1. Tener largo.mp3 (>5min) con --timestamps. 2. Ejecutar: bun run bin/trans.ts -p whisper --timestamps largo.mp3 --output scratch. 3. Revisar la tabla de segmentos.
  - Esperado: Cada chunk aporta segmentos con su offset (i*5min) sumado, de modo que los timestamps de la tabla son estrictamente crecientes y cubren toda la duración sin reiniciarse a 00:00 en cada chunk. Exit 0.
  ```bash
  cd . && bun run bin/trans.ts -p whisper --timestamps $T/largo.mp3 --output $T/largows.md; grep -n '^|' $T/largows.md | head
  ```
- [ ] **cli-13 — Archivo >25MB y <5min con Whisper se comprime para respetar el límite de 25MB**
  - Pasos: 1. Generar/obtener un archivo <5min pero >25MB (ej. wav sin comprimir). 2. Ejecutar: bun run bin/trans.ts -p whisper <archivo> --output scratch.
  - Esperado: El CLI detecta el tamaño, imprime 'File size (…MB) exceeds 25MB limit, compressing…', comprime a mp3 16kHz mono y transcribe el comprimido sin superar el límite de la API. Exit 0.
  ```bash
  cd . && bun run bin/trans.ts -p whisper $T/grande.wav --output $T/grande.md
  ```
- [ ] **cli-20 — URL de YouTube con subtítulos: guarda .md desde captions sin transcribir**
  - Pasos: 1. Ejecutar sobre una URL de YouTube que tenga subtítulos en el idioma pedido, con --language es. 2. Observar el flujo.
  - Esperado: Detecta provider youtube, obtiene subtítulos ('Got YouTube subtitles'), NO llama a Whisper/ElevenLabs, y guarda <titulo>.md en el cwd con **Fuente:** = URL. Exit 0. El idioma de los subtítulos coincide con --language (ver cli-B09).
  ```bash
  cd $T && bun run ./bin/trans.ts 'https://www.youtube.com/watch?v=<ID_CON_SUBS>' --language es; echo exit=$?; ls *.md
  ```
- [ ] **cli-23 — URL de Google Docs (no audio) no debe intentar descargar audio**
  - Pasos: 1. Ejecutar sobre https://docs.google.com/document/d/<id>/edit
  - Esperado: Debería rechazarse con un mensaje claro de que no es un archivo de audio descargable.
  ```bash
  cd . && bun -e "import {getProvider} from './src/providers/index.ts'; console.log(getProvider('https://docs.google.com/document/d/ABC123/edit').name)"
  ```
- [ ] **cli-25 — config --set-key guarda la clave por proveedor y resolveApiKey la usa**
  - Pasos: 1. Ejecutar: echo 'MI-CLAVE' | bun run bin/trans.ts config --set-key --provider whisper 2. Verificar ~/.config/transcribe-cli/config.json (campo apiKey) y luego una transcripción sin --api-key/env.
  - Esperado: Guarda la clave en el campo correcto (apiKey para whisper, elevenlabsApiKey para elevenlabs), imprime 'API key (whisper) saved to …' SIN mostrar la clave, y las corridas posteriores la resuelven desde config. Con clave vacía: 'No API key provided' exit 1.
  ```bash
  cd . && HOME=/tmp/cfgtest bun run bin/trans.ts config --set-key --provider whisper <<< 'sk-demo123'; cat /tmp/cfgtest/.config/transcribe-cli/config.json
  ```
- [ ] **cli-26 — Transcripción larga muestra progreso y no se 'friza' (B2)**
  - Pasos: 1. Correr un audio >5min (varios chunks) con el proveedor default. 2. Observar la salida durante el proceso.
  - Esperado: Imprime progreso incremental ('Transcribed chunk k/N') de forma visible y termina en tiempo razonable sin quedarse colgado. Si un chunk tarda demasiado debería haber timeout/reintento o al menos un mensaje, no un cuelgue silencioso indefinido. Exit 0. (B2: hoy no hay heartbeat ni timeout por request en Whisper — ver cli-B10).
  ```bash
  cd . && timeout 300 bun run bin/trans.ts $T/largo.mp3 --output $T/largo-b2.md; echo exit=$?
  ```

### Checklist manual (mic / UI real)

- [ ] **cli-21 — URL de YouTube sin subtítulos: descarga audio y transcribe**
  - Pasos: 1. Ejecutar sobre una URL sin captions en el idioma pedido. 2. Observar 'No subtitles available, downloading audio…'.
  - Esperado: Cae al fallback: descarga audio con yt-dlp, transcribe con el proveedor elegido y guarda <titulo>.md en cwd con la Fuente. Limpia el tempdir al terminar. Exit 0.
- [ ] **cli-24 — trans r [nombre]: el nombre define el .wav y el .md derivado**
  - Pasos: 1. Ejecutar: bun run bin/trans.ts r reunion-equipo (grabar unos segundos, ENTER para parar). 2. Responder 'y' a 'Transcribir ahora?'.
  - Esperado: Graba reunion-equipo-YYYY-MM-DD.wav en cwd (nombre saneado del argumento), y al transcribir el .md hereda ese nombre exacto (reunion-equipo-….md) junto al wav. Los prompts de detectar/renombrar hablantes funcionan. (Relacionado con B1: el nombre debe propagarse al .md — en CLI el nombre es de entrada, no hay rename posterior).

## App desktop (React + Tauri)

### Automatizables (correr con el setup de arriba)

- [ ] **desktop-20 — check_dependencies detecta ffmpeg/sox/yt-dlp y sus versiones**
  - Esperado: Muestra ffmpeg, sox y yt-dlp con estado instalado/no y version. En este entorno sox NO esta instalado => debe salir 'No instalado' sin romper la seccion, y ffmpeg/yt-dlp con version.
  ```bash
  for d in ffmpeg sox yt-dlp; do printf '%s: ' "$d"; which "$d" >/dev/null 2>&1 && "$d" --version 2>&1 | head -1 || echo 'No instalado'; done
  ```
- [ ] **desktop-22 — URL soportada habilita transcribir; URL no soportada no**
  - Esperado: Con YouTube/Drive/Instagram valido se setea source y se habilita el boton; con URL no soportada el boton queda deshabilitado y no se crea source.
  ```bash
  cd desktop && (bun install >/dev/null 2>&1 || true) && bun -e 'import{isSupportedUrl}from"./src/lib/validation.ts";for(const u of ["https://youtu.be/abc123","https://drive.google.com/file/d/xyz/view","https://www.instagram.com/reel/abc/","https://vimeo.com/1","hola"])console.log(u, isSupportedUrl(u))'
  ```

### Parciales (validables por partes o trazando código)

- [ ] **desktop-01 — B1 - Renombrar grabacion propaga al audio en disco Y al .md de salida**
  - Pasos: 1) Grabar audio (queda como recording-YYYY-MM-DD.wav). 2) En RecordingDone tocar el lapiz y renombrar a 'entrevista'. 3) Confirmar (Check/Enter). 4) Transcribir. 5) Abrir la carpeta de salida.
  - Esperado: El .wav en disco pasa a llamarse entrevista.wav y el .md generado es entrevista.md (mismo basename). Ni el audio ni el .md conservan el nombre viejo. Trazabilidad: RecordingDone.confirmEditingName debe hacer setFilePath(newPath) y handleTranscribe debe pasar ese filePath nuevo como input al CLI, que deriva el .md del basename del input.
- [ ] **desktop-01b — B1 - Renombrar y transcribir SIN confirmar el ✓ igual aplica el nombre** (regresión — el bug original)
  - Pasos MANUAL en la app: 1) Grabar. 2) Tocar el lápiz, tipear 'Test 3' (se muestra "Se guardará como Test-3.wav"). 3) SIN clickear el ✓, clickear directamente "Transcribir ahora".
  - Esperado: El .md se guarda como Test-3.md (no recording-YYYY-MM-DD.md). handleTranscribe llama commitPendingRename() antes de transcribir, así una edición pendiente no se descarta. Este es exactamente el flujo que fallaba en producción.
  ```bash
  cd . && TMP=$T && cp "$TMP/voz.mp3" "$TMP/entrevista.mp3" && timeout 115 bun run bin/trans.ts "$TMP/entrevista.mp3" --provider elevenlabs --language es --output-dir "$TMP/outdir" && ls "$TMP/outdir"/entrevista.md
  ```
- [ ] **desktop-02 — B1 - rename_recording sanitiza espacios/acentos/caracteres y colapsa guiones**
  - Pasos: 1) Grabar. 2) Renombrar a 'Reunion equipo // 2026 !!'. 3) Confirmar.
  - Esperado: El backend sanitiza a un nombre de archivo valido (espacios y simbolos -> '-', guiones colapsados, sin guiones al inicio/fin), p.ej. 'Reunion-equipo-2026.wav'. La UI muestra exactamente el nombre final del archivo, no lo que se tipeo, para que el usuario no crea que 'no impacto'.
  - Nota: Revisar logica en desktop/src-tauri/src/commands/recording.rs (rename_recording, lineas 245-313). Para test real: agregar #[cfg(test)] o construir con CARGO_TARGET_DIR=$HOME/.cache/cargo-target/transcribe-desktop y ejercitar el binario.
- [ ] **desktop-03 — B1 - rename a un nombre que ya existe no sobrescribe y avisa**
  - Pasos: 1) Tener ya un archivo 'notas.wav' en la carpeta. 2) Grabar otro y renombrarlo a 'notas'. 3) Confirmar.
  - Esperado: El backend rechaza el rename con mensaje claro ('Ya existe un archivo con ese nombre') y el archivo original NO se pierde. La UI muestra el error en linea (renameError) y mantiene el modo edicion.
  ```bash
  Trazar desktop/src-tauri/src/commands/recording.rs lineas 302-307 (chequeo new_path.exists()) y desktop/src/components/recording/RecordingDone.tsx lineas 132-140 (render de renameError).
  ```
- [ ] **desktop-04 — B1 - rename con nombre vacio o solo caracteres invalidos**
  - Pasos: 1) Grabar. 2) Renombrar a '   ' o a '///' o a '***'. 3) Confirmar.
  - Esperado: Vacio/solo-espacios: se cancela la edicion sin cambios. Solo simbolos: el backend devuelve 'El nombre no es valido' y no crea un archivo con nombre raro ni renombra.
  ```bash
  Trazar desktop/src-tauri/src/commands/recording.rs lineas 247-280 (trim vacio + cleaned vacio) y RecordingDone.tsx lineas 119-125.
  ```
- [ ] **desktop-05 — B1 - Audio y .md quedan en la MISMA carpeta (no split-brain)**
  - Pasos: 1) Instalacion limpia SIN outputDirectory en config (o con valor '~/algo'). 2) Grabar. 3) Transcribir sin cambiar carpeta.
  - Esperado: El .wav y el .md deben quedar en la misma carpeta que ve el usuario en la UI. Hoy el audio lo escribe Rust en get_output_dir() (~/Desktop por defecto, sin expandir ~) y el .md en el outputDir del front (por defecto ~/Downloads) => quedan separados. Deberian coincidir.
  ```bash
  Comparar desktop/src-tauri/src/commands/recording.rs get_output_dir (99-115) vs default de outputDir en desktop/src/components/recording/RecordingDone.tsx linea 30. Verificar config: grep -o '"outputDirectory"[^,}]*' ~/.config/transcribe-cli/config.json
  ```
- [ ] **desktop-07 — B2 - Transcripcion larga (>5min) muestra progreso por chunks y no se congela**
  - Pasos: 1) Elegir un audio > 5 minutos. 2) Transcribir (ElevenLabs). 3) Observar la barra de progreso.
  - Esperado: La UI recibe eventos transcription:progress y avanza chunk a chunk (Chunk N de M). Al terminar pasa a resultado. Nunca queda pegada. El CLI emite lineas 'Transcribed chunk N/M' que Rust parsea a eventos.
  ```bash
  cd . && TMP=$T && timeout 300 bun run bin/trans.ts "$TMP/largo.mp3" --provider elevenlabs --output-dir "$TMP/outdir" 2>&1 | grep -i 'chunk'
  ```
- [ ] **desktop-08 — B2 - Cancelar durante la transcripcion detiene el proceso hijo (sin huerfanos)**
  - Pasos: 1) Iniciar transcripcion larga desde TranscribeView. 2) Tocar 'Cancelar' en ProgressView. 3) Revisar procesos del sistema.
  - Esperado: Al cancelar se debe matar el proceso bun/ffmpeg lanzado y quitar los listeners; no deben quedar procesos huerfanos consumiendo API/CPU, ni llegar un transcription:done tardio que reinyecte un resultado viejo al reentrar. Hoy handleBack solo navega y resetea el store.
  ```bash
  Durante una corrida: pgrep -fl 'trans.ts|ffmpeg' ; tras cancelar volver a correr pgrep y verificar que no queden. Trazar desktop/src/components/transcribe/TranscribeView.tsx lineas 72-119.
  ```
- [ ] **desktop-13 — Cancelar grabacion borra el archivo temporal y no deja procesos**
  - Pasos: 1) Iniciar grabacion. 2) Tocar la X (cancelar). 3) Revisar carpeta de salida y procesos.
  - Esperado: Se mata el proceso de grabacion, se elimina el .wav parcial y no quedan sox/ffmpeg huerfanos. La app vuelve a home limpia.
  ```bash
  Antes/despues de cancelar: pgrep -fl 'avfoundation|sox .*-t wav' y verificar que el archivo temporal fue removido. Trazar cancel_recording en desktop/src-tauri/src/commands/recording.rs 315-330.
  ```
- [ ] **desktop-14 — Grabacion vacia/silenciosa da error claro y no genera .md basura**
  - Pasos: 1) Grabar sin micro / en silencio o con un archivo casi vacio. 2) Detener y/o transcribir.
  - Esperado: stop_recording detecta archivo < 1KB, lo borra y devuelve error entendible ('La grabacion esta vacia...'). Si igual se transcribe un audio silencioso, el resultado no rompe la UI.
  ```bash
  cd . && TMP=$T && timeout 115 bun run bin/trans.ts "$TMP/silencio.mp3" --provider elevenlabs --output-dir "$TMP/outdir"; echo EXIT=$?
  ```
- [ ] **desktop-15 — Limpieza de recorders huerfanos al iniciar la app**
  - Pasos: 1) Dejar (o simular) un sox/ffmpeg de grabacion colgado de una sesion previa. 2) Abrir la app.
  - Esperado: En setup, cleanup_orphan_recorders mata solo procesos de grabacion (patron ffmpeg.*avfoundation | sox.*-d.*-t.*wav) y no toca otros ffmpeg del sistema (p.ej. una transcripcion en curso de otra herramienta).
  - Nota: Revisar patron pgrep en desktop/src-tauri/src/commands/recording.rs lineas 47-62 y validar que no matchee ffmpeg de splitAudio (que usa -ss/-t chunk, sin avfoundation).
- [ ] **desktop-16 — Recientes filtra archivos borrados y no muestra rutas muertas**
  - Pasos: 1) Transcribir para poblar recientes. 2) Borrar/mover el .md fuera de la app. 3) Volver a home.
  - Esperado: El item desaparece de recientes (get_recent_files filtra inexistentes). No aparecen rutas rotas que al abrir fallen.
  ```bash
  Trazar desktop/src-tauri/src/commands/files.rs get_recent_files 100-112 (filter exists) y read_history 22-31.
  ```
- [ ] **desktop-19 — Guardar/leer API keys persiste en config.json y no se filtran**
  - Pasos: 1) Settings -> cargar ElevenLabs y OpenAI keys -> Guardar. 2) Reabrir Settings. 3) Revisar logs/stdout de la app.
  - Esperado: Las keys se persisten en ~/.config/transcribe-cli/config.json (camelCase apiKey/elevenlabsApiKey), se muestran enmascaradas (3+****+3) y nunca se imprimen en claro en logs ni se pasan por argv visible.
  ```bash
  Verificar campos (sin exponer valores): grep -o '"apiKey"\|"elevenlabsApiKey"' ~/.config/transcribe-cli/config.json ; y revisar que transcription.rs no loguee la key (no la pasa por CLI: usa config -> OK).
  ```
- [ ] **desktop-24 — Renombrar hablantes actualiza el .md y el preview, y no rompe la tabla**
  - Pasos: 1) Transcribir con ElevenLabs + speakers. 2) En ResultView 'Editar hablantes' -> renombrar 0->'Ana', 1->'Juan | jefe'. 3) Confirmar. 4) Abrir el .md.
  - Esperado: Se reemplazan los labels **Hablante X:** y la columna Hablante de la tabla de timestamps de forma consistente, escapando '|' para no romper la tabla markdown, y sin reemplazos colaterales en el cuerpo. El preview se actualiza.
  ```bash
  Trazar rename_speakers en desktop/src-tauri/src/commands/transcription.rs lineas 250-267 (replace de '| {id} |' y '**Hablante {id}:**') y comparar con markdown.ts (columnas).
  ```

### Checklist manual (mic / UI real)

- [ ] **desktop-06 — B1 - Estado del store: rename actualiza filePath usado por transcribe**
  - Pasos: 1) Grabar. 2) Renombrar. 3) SIN recargar, transcribir. 4) Repetir renombrando varias veces antes de transcribir.
  - Esperado: transcribe siempre usa el ultimo path devuelto por rename_recording (sin closures viejos). El .md refleja el ultimo nombre. No debe existir ningun camino donde el input a transcribe sea el path original pre-rename.
- [ ] **desktop-09 — B2 - Detener grabacion no congela la UI**
  - Pasos: 1) Grabar 10s. 2) Tocar 'Detener grabacion'. 3) Observar responsividad (timer, animaciones, clicks) durante la transicion.
  - Esperado: La UI sigue respondiendo (< ~300ms percibido). stop_recording no debe bloquear el hilo principal varios segundos mientras hace SIGINT + polling (hasta 5s) + sleep 300ms. Idealmente el kill se hace en background/comando async.
- [ ] **desktop-10 — B2 - Error de transcripcion se muestra al usuario en TranscribeView**
  - Pasos: 1) Configurar una API key invalida. 2) Transcribir un archivo desde TranscribeView. 3) Esperar el fallo.
  - Esperado: Se muestra un mensaje de error claro (y opcion de reintentar). Hoy en status 'error' TranscribeView cae al formulario sin mensaje (no lee errorMessage del store y el onErr/catch no llaman setErrorMessage) => el usuario vuelve al form sin saber que paso.
- [ ] **desktop-11 — B2 - Transcripcion colgada (red caida/proceso trabado) ofrece salida**
  - Pasos: 1) Iniciar transcripcion y cortar la red / simular cuelgue del proceso hijo. 2) Esperar.
  - Esperado: La app detecta timeout o permite abortar y salir del estado 'Transcribiendo...'. No debe quedar pegada indefinidamente sin done/error. Hoy Rust hace child.wait() sin timeout y sin cancelacion => si el hijo no termina, jamas se emite done/error y la UI queda congelada.
- [ ] **desktop-12 — B2 - Flujo de grabacion muestra progreso durante la transcripcion**
  - Pasos: 1) Grabar. 2) Transcribir desde RecordingDone (no desde TranscribeView). 3) Observar feedback.
  - Esperado: Debe mostrar progreso/spinner que avance (idealmente ProgressView con chunks). Hoy RecordingDone no se suscribe a transcription:progress y solo deshabilita el boton con texto estatico 'Transcribiendo...', lo que en audios largos parece congelado.
- [ ] **desktop-17 — Recientes se refresca al volver a home tras una transcripcion**
  - Pasos: 1) Transcribir un archivo. 2) Volver a home.
  - Esperado: El nuevo .md aparece arriba en Recientes inmediatamente (RecentList refresca al cambiar currentView a home).
- [ ] **desktop-18 — Abrir un reciente lo abre con la app por defecto del SO**
  - Pasos: 1) Tener recientes. 2) Clickear un item.
  - Esperado: open_file lanza el .md con la app por defecto. Si el archivo no existe, deberia avisar (hoy get_recent_files ya lo filtra, pero open_file no valida existencia).
- [ ] **desktop-21 — Drag & drop de archivo de audio en Transcribir funciona**
  - Pasos: 1) Ir a Transcribir. 2) Arrastrar un .mp3 al dropzone.
  - Esperado: Se toma la RUTA ABSOLUTA del archivo y queda como source para transcribir. En Tauri v2 el File del webview no expone .path y dragDropEnabled (default) intercepta el drop, por lo que hay que usar el evento de drag&drop de Tauri (onDragDropEvent). Hoy cae a file.name (solo basename) => el CLI no encuentra el archivo.
- [ ] **desktop-23 — Copiar texto copia la transcripcion COMPLETA, no solo el preview**
  - Pasos: 1) Transcribir un audio largo. 2) En ResultView tocar 'Copiar texto'. 3) Pegar en un editor.
  - Esperado: Se copia el contenido completo de la transcripcion (o al menos el cuerpo completo del .md). Hoy copia currentPreview (truncado a ~800 chars en Rust y 500 en UI) => se pierde texto.

## Focos de regresión (bugs históricos del relevamiento 2026-07-20)

- **Rutas de salida**: transcribir SIN `--output` debe dejar el `.md` junto al audio (bug cli-B01: truncaba la ruta y crasheaba tras pagar la API). Probar también rutas con espacios y acentos.
- **Rename post-grabación (desktop)**: grabar → renombrar → transcribir debe producir audio y `.md` con el MISMO nombre y en la MISMA carpeta (bugs desktop-B05/B06/B14: split-brain de carpetas, `~` sin expandir, sanitización divergente).
- **Freeze de transcripción (desktop)**: texto con acentos/ñ/¿ no debe panickear el preview (desktop-NUEVO-01); Cancelar debe matar el proceso hijo (desktop-B01); parar la grabación no debe congelar la UI (desktop-B02); los errores deben verse en pantalla (desktop-B03).
- **Config**: `trans config --set-key --provider whisper` debe guardar en `apiKey` (OpenAI), no en `elevenlabsApiKey` (bug cli-B11).
