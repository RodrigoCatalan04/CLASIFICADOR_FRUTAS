'use strict';
const $ = id => document.getElementById(id);
const names = ['manzana','banana','naranja'];
const labels = ['Manzana','Banana','Naranja'];
let model, metadata, stream, busy=false, facing='environment', frameTimer, generation=0, loading=false;
// v1.2 · zoom digital de la cámara y suavizado de puntajes entre cuadros
let zoom='auto', smoothed=null; const SMOOTH=0.5;
// «Auto»: se evalúan en un solo lote los recortes 1×, 1,5× y 2× y se usa el de mayor confianza
// (la fruta puede llenar la imagen o verse pequeña, por ejemplo en la pantalla de un celular).
const AUTO_ZOOMS=[1,1.5,2];
const crops=AUTO_ZOOMS.map(()=>{const c=document.createElement('canvas');c.width=c.height=160;return c;});
const canvas=$('capture'), ctx=canvas.getContext('2d',{willReadFrequently:true});
const video=$('video'), photo=$('photo');
const scoreRows=names.map((name,i)=>{
  const row=document.createElement('div'); row.className='score-row'; row.dataset.fruit=name;
  row.innerHTML=`<div class="score-label"><span>${labels[i]}</span><span class="score-value">—</span></div><div class="score-track"><div class="score-fill"></div></div>`;
  $('score-list').append(row);return row;
});
// v1.1 · Mejora F1: la extensión/MIME no basta. Se comprueba la firma real del archivo
// (PNG: 89 50 4E 47 0D 0A 1A 0A · JPEG: FF D8 FF) antes de crear la imagen, como hace el cuaderno.
async function imageSignature(file){
  const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
  if([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A].every((v,i)=>b[i]===v))return 'image/png';
  if(b[0]===0xFF&&b[1]===0xD8&&b[2]===0xFF)return 'image/jpeg';
  return null;
}
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function controls(enabled){$('start').disabled=!enabled;$('toggle').disabled=!enabled;$('upload').disabled=!enabled;document.querySelectorAll('[data-sample]').forEach(b=>b.disabled=!enabled);}
function resetResult(){
  smoothed=null;
  $('prediction').textContent='Te toca mirar';$('result-symbol').textContent='?';$('result-kicker').textContent='LISTO PARA DESCUBRIR';
  $('result-description').textContent='Activa la cámara o prueba una foto para obtener una predicción.';$('timing').textContent='—';
  scoreRows.forEach(row=>{row.querySelector('.score-value').textContent='—';row.querySelector('.score-fill').style.width='0%';row.classList.remove('best');});
  document.querySelector('.result-card').classList.remove('weak');
}
async function loadModel(){
  if(loading)return;loading=true;controls(false);$('retry').hidden=true;
  message('Preparando el modelo…');$('model-state').textContent='CARGANDO';
  try{
    if(!window.tf)throw Error('No se pudo cargar la biblioteca de clasificación.');
    await tf.ready();
    const response=await fetch('model/metadata.json');if(!response.ok)throw Error('No se encontró la configuración del modelo.');
    metadata=await response.json();
    if(JSON.stringify(metadata.labels)!==JSON.stringify(names)||metadata.inputSize!==160)throw Error('El modelo no es compatible con esta página.');
    model=await tf.loadGraphModel('model/model.json');
    const warm=tf.zeros([1,160,160,3]);let output;
    try{output=await model.executeAsync(warm);const tensor=Array.isArray(output)?output[0]:output;
      if(tensor.size!==3)throw Error('El modelo debe devolver tres puntuaciones.');await tensor.data();
    }finally{warm.dispose();if(output)tf.dispose(output);}
    controls(true);$('model-state').textContent='MODELO LISTO';message('Todo listo. Activa la cámara o selecciona una foto.');
  }catch(error){if(model){model.dispose();model=null;}$('model-state').textContent='SIN CONEXIÓN';message(`${error.message} Comprueba que la carpeta model y sus archivos estén disponibles.`,true);$('retry').hidden=false;}
  finally{loading=false;}
}
function stopCamera(clear=true){
  generation++;clearTimeout(frameTimer);
  if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
  video.srcObject=null;video.hidden=true;$('switch').disabled=true;$('toggle').textContent='Iniciar cámara';$('live-dot').classList.remove('active');$('camera-state').textContent='EN ESPERA';$('frame-tip').hidden=true;
  if(clear){photo.hidden=true;photo.removeAttribute('src');$('empty-camera').hidden=false;$('source-label').textContent='Tu cámara';resetResult();}
}
async function startCamera(){
  if(!model)return;
  stopCamera();smoothed=null;const token=generation;$('toggle').disabled=true;$('start').disabled=true;message('Esperando permiso de cámara…');
  try{
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Abre la página con HTTPS o en localhost para usar la cámara.');
    const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:640},height:{ideal:640}}});
    if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;video.srcObject=stream;await video.play();
    if(token!==generation)return;
    photo.hidden=true;video.hidden=false;$('empty-camera').hidden=true;$('frame-tip').hidden=false;$('switch').disabled=false;$('toggle').textContent='Detener cámara';$('camera-state').textContent='EN VIVO';$('live-dot').classList.add('active');$('source-label').textContent='Tu cámara';
    message('Cámara activa. Centra una fruta y procura usar un fondo claro.');
    stream.getVideoTracks()[0].addEventListener('ended',()=>{if(token===generation){stopCamera();message('La cámara se desconectó. Puedes volver a activarla.',true);}});
    loop(token);
  }catch(error){
    if(token!==generation)return;stopCamera();
    const reasons={NotAllowedError:'No se autorizó la cámara. Revisa el permiso del navegador o prueba subir una foto.',NotFoundError:'No encontramos una cámara. Puedes subir una foto.',NotReadableError:'La cámara está ocupada o no pudo iniciarse. Cierra otras aplicaciones e inténtalo otra vez.'};
    message(reasons[error.name]||error.message,true);
  }finally{if(model){$('start').disabled=false;$('toggle').disabled=false;}}
}
async function predict(source,token){
  if(busy||!model)return;busy=true;let input,output;
  try{
    const start=performance.now();
    const w=source.videoWidth||source.naturalWidth,h=source.videoHeight||source.naturalHeight;
    if(!w||!h)throw Error('La imagen aún no está disponible.');
    // La cámara usa un recorte central cuadrado; las fotos se redimensionan completas.
    const zooms=source===video?(zoom==='auto'?AUTO_ZOOMS:[zoom]):[null];
    zooms.forEach((z,k)=>{
      const c=crops[k].getContext('2d',{willReadFrequently:true});c.fillStyle='#fff';c.fillRect(0,0,160,160);
      if(z===null)c.drawImage(source,0,0,160,160);
      else{const side=Math.min(w,h)/z;c.drawImage(source,(w-side)/2,(h-side)/2,side,side,0,0,160,160);}
    });
    // El modelo ya contiene la normalización de MobileNetV2. No dividir entre 255.
    input=tf.tidy(()=>tf.stack(zooms.map((_,k)=>tf.browser.fromPixels(crops[k],3).toFloat())));
    output=await model.executeAsync(input);const tensor=Array.isArray(output)?output[0]:output;
    const all=Array.from(await tensor.data());
    if(token!==generation)return;
    let pick=0;for(let k=1;k<zooms.length;k++){if(Math.max(...all.slice(3*k,3*k+3))>Math.max(...all.slice(3*pick,3*pick+3)))pick=k;}
    let scores=all.slice(3*pick,3*pick+3);
    ctx.drawImage(crops[pick],0,0);   // vista «Lo que ve el modelo»
    $('crop-zoom').textContent=zooms[pick]?`Recorte ${String(zooms[pick]).replace('.',',')}×`:'Foto completa';
    // En la cámara se promedian los últimos cuadros (media móvil exponencial) para evitar saltos.
    if(source===video){smoothed=smoothed?smoothed.map((v,i)=>SMOOTH*v+(1-SMOOTH)*scores[i]):scores;scores=smoothed;}
    if(scores.length!==3||scores.some(x=>!Number.isFinite(x)))throw Error('El modelo devolvió un resultado inválido.');
    const best=scores.indexOf(Math.max(...scores)), weak=scores[best]<0.70;
    $('prediction').textContent=weak?'No está claro':labels[best];
    if(weak){$('result-symbol').replaceChildren('?');}else{const icon=document.createElement('img');icon.src=`assets/${names[best]}.jpg`;icon.alt='';$('result-symbol').replaceChildren(icon);}
    document.querySelector('.result-card').classList.toggle('weak',weak);
    $('result-kicker').textContent=weak?'ACERCA LA FRUTA Y MEJORA LA LUZ':'PREDICCIÓN DEL MODELO';
    $('result-description').textContent=weak?`Se parece más a ${names[best]}, pero las puntuaciones están repartidas.`:`La clase con mayor puntuación es ${names[best]}.`;
    $('timing').textContent=`${Math.round(performance.now()-start)} ms`;
    scores.forEach((score,i)=>{const percent=Math.max(0,Math.min(100,score*100));scoreRows[i].classList.toggle('best',i===best);scoreRows[i].querySelector('.score-value').textContent=`${percent.toFixed(1)} %`;scoreRows[i].querySelector('.score-fill').style.width=`${percent}%`;});
  }finally{if(input)input.dispose();if(output)tf.dispose(output);busy=false;}
}
async function loop(token){
  if(token!==generation||!stream)return;
  try{if(video.readyState>=2)await predict(video,token);}catch(error){stopCamera(false);message(`No pudimos clasificar: ${error.message}`,true);return;}
  if(token===generation&&stream)frameTimer=setTimeout(()=>loop(token),550);
}
async function displayImage(url,name,owned=false){
  stopCamera();const token=generation;message('Abriendo imagen…');
  try{
    const image=new Image();image.src=url;await image.decode();
    if(token!==generation)return;
    if(image.naturalWidth<32||image.naturalHeight<32||image.naturalWidth>4096||image.naturalHeight>4096)throw Error('La imagen debe medir entre 32 y 4096 píxeles por lado.');
    photo.src=url;photo.hidden=false;$('empty-camera').hidden=true;$('source-label').textContent=name;$('camera-state').textContent='FOTOGRAFÍA';
    while(busy){await new Promise(resolve=>setTimeout(resolve,20));if(token!==generation)return;}
    await predict(image,token);if(token===generation)message('Foto clasificada. Prueba otra imagen o activa la cámara.');
  }catch(error){if(token===generation){stopCamera();message(error.name==='EncodingError'?'No se puede leer la imagen. Usa un archivo JPG o PNG válido.':error.message,true);}}
  finally{if(owned)URL.revokeObjectURL(url);}
}
$('start').addEventListener('click',startCamera);
$('toggle').addEventListener('click',()=>{if(stream){stopCamera();message('Cámara detenida. Puedes volver a activarla cuando quieras.');}else startCamera();});
$('switch').addEventListener('click',()=>{facing=facing==='environment'?'user':'environment';startCamera();});
$('upload').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  if(!['image/jpeg','image/png'].includes(file.type)){message('Selecciona un archivo JPG o PNG.',true);return;}
  // El tamaño se valida antes de leer cualquier byte (CP-03).
  if(file.size>5*1024*1024){message('La imagen supera el límite de 5 MiB.',true);return;}
  let signature=null;
  try{signature=await imageSignature(file);}catch{signature=null;}
  if(!signature){stopCamera();message('El contenido no es un JPG o PNG válido (la extensión no basta). No se usó el modelo.',true);return;}
  displayImage(URL.createObjectURL(file),file.name,true);
});
document.querySelectorAll('[data-sample]').forEach(button=>button.addEventListener('click',()=>displayImage(`assets/${button.dataset.sample}.jpg`,'Imagen de ejemplo')));
$('retry').addEventListener('click',loadModel);
document.querySelectorAll('[data-zoom]').forEach(b=>b.addEventListener('click',()=>{zoom=b.dataset.zoom==='auto'?'auto':Number(b.dataset.zoom);smoothed=null;document.querySelectorAll('[data-zoom]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));}));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream){stopCamera();message('La cámara se detuvo al salir de la pestaña. Actívala para continuar.');}});
window.addEventListener('pagehide',()=>stopCamera());
loadModel();
