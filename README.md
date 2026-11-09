# FrutaLens · v1.2

Aplicación estática en HTML, CSS y JavaScript. Clasifica manzana, banana y naranja con un modelo MobileNetV2 adaptado en el cuaderno de la actividad. TensorFlow.js realiza la inferencia en el navegador. No requiere backend ni envía fotos o fotogramas a un servidor.

## Ejecutar

1. Descomprima el ZIP. Abra la carpeta `dist` con VS Code y utilice Live Server, o ejecute `python -m http.server 8000 --directory dist` desde la raíz.
2. Abra `http://localhost:8000`. No abra index.html mediante file://.
3. Espere «MODELO LISTO», active la cámara y permita su acceso. Pruebe también los tres ejemplos o una foto JPG/PNG (máximo 5 MiB, lados de 32 a 4096 px).
4. Para un teléfono u otro equipo, publique `dist` en un alojamiento HTTPS. Una dirección HTTP de red local no habilita la cámara. Si se abre dentro de un iframe, use la página en una pestaña independiente.

## Archivos

- `dist/index.html`: estructura accesible y controles.
- `dist/styles.css`: presentación adaptable a móvil y escritorio.
- `dist/app.js`: permisos de cámara, validación, inferencia, resultados y liberación de recursos.
- `dist/model/model.json` y `*.bin`: grafo y pesos exportados, que deben conservarse juntos.
- `dist/model/metadata.json`: orden de etiquetas y contrato de entrada.
- `dist/vendor/tf.min.js`: TensorFlow.js 4.22.0, descargado de la distribución oficial npm (Apache-2.0).
- `dist/assets/`: ilustración original y tres fotografías de Fruits-360 con atribución.

## Actualizar el modelo

Ejecute el cuaderno en orden, incluida la sección «Exportar el modelo para la web». Genera `modelo_web.zip` con la carpeta `model/`: descomprímala dentro de `dist`, reemplazando **toda** la carpeta anterior. Mantenga el orden manzana, banana, naranja y la entrada RGB float32 [1,160,160,3] en [0,255]. La normalización ya está dentro del modelo. Recargue la página sin caché y repita las pruebas. Si falla, restaure el ZIP anterior completo.

El “compilado web” es una exportación GraphModel de TensorFlow.js; no es `model.compile()` ni un entrenamiento en JavaScript. El HTML, CSS y JS no necesitan compilación.

## Alcance y pruebas manuales

El modelo es educativo y de conjunto cerrado: elige entre tres clases incluso ante objetos ajenos. Un score alto no demuestra que haya una fruta. La indicación «No está claro» usa un umbral orientativo de 0,70, no calibrado como detector de desconocidos. La cámara recorta el centro a un cuadrado; las fotos completas se redimensionan a 160 × 160. Use fruta centrada y fondo claro. Las vistas del mismo objeto en Fruits-360 limitan la independencia de la evaluación.

Registre navegador, dispositivo, entrada, esperado, obtenido y captura para: permiso concedido, permiso denegado, cámara ausente/ocupada, detener y volver a iniciar, cambiar cámara (si hay dos), ejemplo de cada fruta, foto propia, archivo inválido, archivo >5 MiB, modelo ausente y cambio de pestaña. Compruebe que el indicador físico de cámara se apaga al detenerla. El equipo de generación no dispone de cámara física: estas comprobaciones corresponden al usuario durante el taller.

## Cambios de la versión 1.2 (Grupo 03, 09/11/2026) · la cámara no reconocía fotos de frutas

**Problema:** al mostrar a la webcam una foto de manzana, banana o naranja (por ejemplo, en el celular), la página mostraba «No está claro» o una fruta equivocada.
**Causa:** el modelo v1 solo vio fotos de estudio (una variedad por fruta, fondo blanco, fruta que llena el cuadro). En la cámara, la fruta es pequeña, está dentro de un celular y tiene reflejos y fondo.

| Archivo | Cambio |
|---|---|
| `dist/model/*` | **Modelo v2** (sección 13 del cuaderno): 10 variedades de manzana, 4 de banana y 4 de naranja, con aumento de datos que imita la cámara (fondos reales, escala, luz, foto dentro de un celular, desenfoque y JPEG). La base sigue congelada y solo se entrena `Dense(3)`. Mismo contrato de entrada y salida. |
| `dist/app.js` | **Zoom «Auto»** (por defecto): en cada cuadro se evalúan, en un solo lote, los recortes centrales 1×, 1,5× y 2×, y se usa el de mayor confianza. También hay zoom 1× y 2× manual. **Suavizado** de puntajes entre cuadros (media móvil, α = 0,5). |
| `dist/index.html` | Botones de zoom; panel **«Lo que ve el modelo»** con el recorte de 160×160 elegido. |
| `dist/styles.css` | Estilos del zoom y del panel; controles en dos filas en el móvil. |

**Resultado medido (cuaderno, escenas simuladas de celular frente a la cámara, 104 imágenes):** v1 sin zoom acertaba el 56,7 %; v2 en Auto acierta el 97,1 % (95,2 % con puntaje ≥ 0,70). En el navegador (W-15), las tres escenas de prueba pasaron de «No está claro» o error a la fruta correcta. Son pruebas **simuladas**: confírmalas con tu cámara.

## Cambios de la versión 1.1 (Grupo 03, 08/11/2026)

| Archivo | Cambio | Motivo |
|---|---|---|
| `dist/model/*` | Reemplazado por el `modelo_web.zip` generado al ejecutar el cuaderno (08/11/2026). Mismo contrato: entrada RGB float32 [lote,160,160,3] en [0,255], salida manzana, banana, naranja. | Integrar el modelo propio. |
| `dist/app.js` | **Mejora:** antes de crear la imagen se lee la firma de bytes (PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`). Un texto renombrado a `.png` se rechaza sin decodificar ni usar el modelo. Además, con puntaje < 0,70 se muestra «?» en lugar del ícono de la clase ganadora. | Hallazgo H2: F1 de la web dependía solo de la extensión/MIME. |
| `dist/styles.css` | **Personalización:** cada barra usa el color de su fruta (rojo, amarillo, naranja); la tarjeta de resultado se resalta en ámbar cuando el resultado es «No está claro»; insignia de versión en el pie. | Actividad 4: personalizar la página. |
| `dist/index.html` | Insignia `v1.1 · modelo 2026-11-08` en el pie. | Trazabilidad de la versión desplegada. |

## Versionado y reversión

1. **Código:** repositorio Git con una rama por cambio y una etiqueta por entrega (`git tag v1.0` antes de modificar, `git tag v1.1` después). Revertir código: `git revert <commit>` o `git checkout v1.0 -- dist/app.js dist/styles.css dist/index.html`.
2. **Datos:** no se versionan las imágenes; se versiona su procedencia: `REVISION` fija de Fruits-360 + `manifiesto_descarga.csv` (ruta y huella Git de cada imagen) + `particiones.csv`. Con eso el cuaderno vuelve a descargar exactamente las mismas imágenes.
3. **Modelo:** cada exportación se guarda como un ZIP inmutable con fecha (`modelo_web_2026-11-08.zip`) junto con `modelo_frutas.keras`, `configuracion.json` y `verificacion_modelo.json`. Los binarios grandes se guardan con Git LFS o como *release*, no sueltos en el historial.
4. **Revertir el modelo:** borrar la carpeta `dist/model` **completa**, descomprimir el ZIP anterior (`modelo_web_v1.0.zip`), recargar sin caché (Ctrl+Shift+R) y repetir W-01, W-02 y la comprobación de paridad. Nunca mezclar `model.json` de una versión con `.bin` de otra.
5. **Modelos disponibles:** `modelo_web_v2.zip` (actual, v1.2), `modelo_web.zip` (v1, v1.1) y `modelo_web_v1.0.zip` (el original de la práctica). Para volver a v1, reemplaza `dist/model` por el contenido de `modelo_web.zip` y elige el zoom 1×.
6. **Criterio para promover un cambio:** revisión del diff, cinco casos CP aprobados, pruebas web W-01 a W-14 aprobadas y paridad Python/JS ≤ 1 × 10⁻⁴.

## Verificación realizada (v1.1; el modelo actual es v2, ver arriba)

- Cuaderno ejecutado completo el 08/11/2026 (Linux, CPU, Python 3.12): exactitud en Test 1,000 (90 imágenes), cinco casos aprobados, exportación sin errores.
- Paridad del modelo integrado: las mismas cuatro entradas (tres ejemplos y una imagen de ruido) en Keras y en TensorFlow.js 4.22.0 (Chromium, backend WebGL): diferencia máxima 7,15 × 10⁻⁷ ≤ 10⁻⁴. Ver `verificacion_modelo.json`.
- Pruebas de interfaz automatizadas con Playwright en Chromium headless (W-01 a W-14), incluida una **cámara simulada** de Chromium. Las pruebas con cámara física, teléfono e indicador de cámara del equipo quedan a cargo del estudiante (plantilla en el informe).

## Verificación original (v1.0, provista con la práctica)


Se ejecutó el entrenamiento y los cinco casos del cuaderno. Se convirtió el modelo a GraphModel y se compararon tres entradas RGB idénticas (una por clase) en Python y TensorFlow.js sobre CPU: diferencia máxima 1,20 × 10⁻⁷, inferior a la tolerancia 10⁻⁴. (El verificacion_modelo.json de v1.0 fue sustituido por el de v1.1.) Se validaron sintaxis JavaScript, archivos del modelo y rutas de recursos. La interfaz y los permisos de cámara requieren una prueba manual en el dispositivo de destino.
