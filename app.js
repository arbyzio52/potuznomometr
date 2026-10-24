const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
tg?.setHeaderColor?.('#090a0b');
tg?.setBackgroundColor?.('#090a0b');

const meter = document.querySelector('#meter');
const valueOutput = document.querySelector('#value');
const statusText = document.querySelector('#status-text');
const mood = document.querySelector('#mood');
const checkButton = document.querySelector('#check');
const settingsButton = document.querySelector('#settings');
const cameraButton = document.querySelector('#camera-toggle');
const cameraPanel = document.querySelector('#camera-panel');
const cameraPreview = document.querySelector('#camera-preview');
const cameraStatus = document.querySelector('#camera-status');
const closeCameraButton = document.querySelector('#close-camera');
const bluePercent = document.querySelector('#blue-percent');
const yellowPercent = document.querySelector('#yellow-percent');
const totalPercent = document.querySelector('#total-percent');
const videoMeter = document.querySelector('#video-meter');
const videoValueOutput = document.querySelector('#video-value');
const thresholdSound = document.querySelector('#threshold-sound');
const analysisCanvas = document.createElement('canvas');
const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
analysisCanvas.width = 160;
analysisCanvas.height = 120;
const barCount = 20;
let cameraStream = null;
let cameraTimer = null;
let soundContext = null;
let soundBufferPromise = null;
let wasAboveSoundThreshold = false;

function makeBars(target) {
  return Array.from({ length: barCount }, (_, i) => {
    const bar = document.createElement('span');
    bar.className = 'bar';
    bar.style.setProperty('--n', i / (barCount - 1));
    target.append(bar);
    return bar;
  });
}

const bars = makeBars(meter);
const videoBars = makeBars(videoMeter);

function paint(value) {
  const lit = Math.round(value / 100 * barCount);
  [bars, videoBars].forEach(group => group.forEach((bar, i) => bar.classList.toggle('active', i < lit)));
  valueOutput.value = value;
  valueOutput.textContent = value;
  videoValueOutput.value = value;
  videoValueOutput.textContent = value;
  mood.textContent = value < 35 ? '😌' : value < 70 ? '😎' : '🤯';
}

function prepareThresholdSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    thresholdSound.load();
    return;
  }
  try {
    soundContext ||= new AudioContextClass();
    soundContext.resume().catch(() => {});
    soundBufferPromise ||= fetch(thresholdSound.src)
      .then(response => {
        if (!response.ok) throw new Error('Не удалось загрузить звук');
        return response.arrayBuffer();
      })
      .then(buffer => soundContext.decodeAudioData(buffer))
      .catch(() => null);
  } catch {
    thresholdSound.load();
  }
}

function playThresholdSound() {
  if (soundBufferPromise) {
    soundBufferPromise.then(buffer => {
      if (buffer && soundContext?.state === 'running') {
        const source = soundContext.createBufferSource();
        source.buffer = buffer;
        source.connect(soundContext.destination);
        source.start();
      } else {
        thresholdSound.currentTime = 0;
        thresholdSound.play().catch(() => {});
      }
    });
    return;
  }
  thresholdSound.currentTime = 0;
  thresholdSound.play().catch(() => {});
}

function paintCameraValue(value) {
  paint(value);
  const aboveThreshold = value >= 90;
  if (aboveThreshold && !wasAboveSoundThreshold) playThresholdSound();
  wasAboveSoundThreshold = aboveThreshold;
}

checkButton.addEventListener('click', () => {
  if (checkButton.disabled) return;
  stopCamera({ hidePanel: true });
  checkButton.disabled = true;
  checkButton.textContent = 'ПРОВЕРЯЕМ…';
  statusText.textContent = 'ИДЁТ ПРОВЕРКА';
  bars.forEach(bar => bar.classList.add('active'));
  let ticks = 0;
  const animation = window.setInterval(() => {
    paint(Math.floor(Math.random() * 101));
    ticks += 1;
    if (ticks >= 12) {
      window.clearInterval(animation);
      const result = Math.floor(Math.random() * 101);
      paint(result);
      statusText.textContent = result < 35 ? 'ПОТУЖНОСТЬ УМЕРЕННАЯ' : result < 70 ? 'ПОТУЖНОСТЬ ВЫСОКАЯ' : 'ПОТУЖНОСТЬ МАКСИМАЛЬНАЯ';
      checkButton.disabled = false;
      checkButton.textContent = 'СЛУЧАЙНАЯ ПРОВЕРКА';
    }
  }, 110);
});

function stopCamera({ hidePanel = false } = {}) {
  if (cameraTimer !== null) {
    window.clearInterval(cameraTimer);
    cameraTimer = null;
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  cameraPreview.srcObject = null;
  cameraButton.setAttribute('aria-pressed', 'false');
  cameraButton.textContent = 'ВКЛЮЧИТЬ КАМЕРУ';
  if (cameraButton.isConnected) cameraButton.disabled = false;
  checkButton.disabled = false;
  checkButton.textContent = 'СЛУЧАЙНАЯ ПРОВЕРКА';
  if (hidePanel) {
    cameraPanel.hidden = true;
    document.body.classList.remove('camera-open');
    wasAboveSoundThreshold = false;
    statusText.textContent = 'ГОТОВ К ПРОВЕРКЕ';
  } else if (!cameraPanel.hidden) {
    cameraStatus.textContent = 'Камера выключена';
  }
}

function explainCameraError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    return 'Нет доступа к камере. Разреши его в настройках браузера.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'Камера не найдена на устройстве.';
  }
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return 'Камера занята другим приложением.';
  }
  return 'Не удалось включить камеру. Проверь HTTPS и разрешение браузера.';
}

async function startCamera() {
  cameraPanel.hidden = false;
  document.body.classList.add('camera-open');
  cameraStatus.textContent = 'Запрашиваем доступ к камере…';
  bluePercent.textContent = '0%';
  yellowPercent.textContent = '0%';
  totalPercent.textContent = '0%';
  statusText.textContent = 'ИДЁТ АНАЛИЗ КАДРА';
  paint(0);
  prepareThresholdSound();
  wasAboveSoundThreshold = false;

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = 'Камера доступна на HTTPS-сайте или localhost.';
    return;
  }

  cameraButton.disabled = true;
  checkButton.disabled = true;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });
    cameraPreview.srcObject = cameraStream;
    await cameraPreview.play();
    cameraButton.disabled = false;
    cameraButton.textContent = 'ВЫКЛЮЧИТЬ КАМЕРУ';
    cameraButton.setAttribute('aria-pressed', 'true');
    cameraStatus.textContent = 'Ищем синие и жёлтые оттенки…';
    analyzeCameraFrame();
    cameraTimer = window.setInterval(analyzeCameraFrame, 250);
  } catch (error) {
    stopCamera();
    cameraStatus.textContent = explainCameraError(error);
    cameraButton.textContent = 'ПОПРОБОВАТЬ ЕЩЁ';
  }
}

function analyzeCameraFrame() {
  if (!cameraStream || cameraPreview.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

  try {
    analysisContext.drawImage(cameraPreview, 0, 0, analysisCanvas.width, analysisCanvas.height);
    const pixels = analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;
    let bluePixels = 0;
    let yellowPixels = 0;
    const sampledPixels = pixels.length / 4;

    for (let i = 0; i < pixels.length; i += 4) {
      const red = pixels[i] / 255;
      const green = pixels[i + 1] / 255;
      const blue = pixels[i + 2] / 255;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const delta = max - min;
      if (max < 0.22 || delta < 0.16) continue;

      let hue;
      if (max === red) hue = 60 * (((green - blue) / delta) % 6);
      else if (max === green) hue = 60 * ((blue - red) / delta + 2);
      else hue = 60 * ((red - green) / delta + 4);
      if (hue < 0) hue += 360;

      if (hue >= 185 && hue <= 255) bluePixels += 1;
      else if (hue >= 38 && hue <= 68) yellowPixels += 1;
    }

    const blueRatio = bluePixels / sampledPixels;
    const yellowRatio = yellowPixels / sampledPixels;
    const totalRatio = blueRatio + yellowRatio;
    bluePercent.textContent = `${Math.round(blueRatio * 100)}%`;
    yellowPercent.textContent = `${Math.round(yellowRatio * 100)}%`;
    totalPercent.textContent = `${Math.round(totalRatio * 100)}%`;
    statusText.textContent = totalRatio > 0.65 ? 'ЦВЕТОВ МАКСИМУМ' : totalRatio > 0.25 ? 'ЦВЕТОВ МНОГО' : 'ИЩЕМ ЦВЕТА…';
    cameraStatus.textContent = `Проверено ${sampledPixels.toLocaleString('ru-RU')} точек кадра`;
    paintCameraValue(Math.min(100, Math.round(totalRatio * 100)));
  } catch {
    cameraStatus.textContent = 'Не получилось прочитать кадр. Попробуй снова.';
  }
}

cameraButton.addEventListener('click', () => {
  if (cameraStream) stopCamera({ hidePanel: true });
  else startCamera();
});

closeCameraButton.addEventListener('click', () => stopCamera({ hidePanel: true }));
window.addEventListener('pagehide', () => stopCamera({ hidePanel: true }));

settingsButton.addEventListener('click', () => {
  const message = 'Камера анализирует долю синих и жёлтых оттенков в кадре. Видео не записывается и не отправляется. Показания шуточные.';
  if (tg?.showAlert) tg.showAlert(message);
  else window.alert(message);
});
