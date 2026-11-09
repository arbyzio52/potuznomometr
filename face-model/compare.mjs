let modelPromise;

function loadLibrary() {
  if (window.faceapi) return Promise.resolve(window.faceapi);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./face-api.min.js', import.meta.url);
    script.onload = () => window.faceapi ? resolve(window.faceapi) : reject(new Error('Модель недоступна'));
    script.onerror = () => {
      script.remove();
      reject(new Error('Не удалось загрузить библиотеку'));
    };
    document.head.append(script);
  });
}

async function createComparator() {
  const api = await loadLibrary();
  const weights = new URL('./weights', import.meta.url).href;
  await Promise.all([
    api.nets.tinyFaceDetector.loadFromUri(weights),
    api.nets.faceLandmark68TinyNet.loadFromUri(weights),
    api.nets.faceRecognitionNet.loadFromUri(weights),
  ]);

  const references = [];
  for (const file of ['1.jpg', '2.jpg']) {
    const image = await api.fetchImage(new URL('./references/' + file, import.meta.url).href);
    const face = await api.detectSingleFace(image, new api.TinyFaceDetectorOptions({
      inputSize: 416,
      scoreThreshold: 0.25,
    })).withFaceLandmarks(true).withFaceDescriptor();
    if (!face) throw new Error('Не найдено лицо на фото ' + file);
    references.push(face.descriptor);
  }

  const options = new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
  return async video => {
    const faces = await api.detectAllFaces(video, options).withFaceLandmarks(true).withFaceDescriptors();
    if (!faces.length) return null;

    let distance = Infinity;
    for (const face of faces) {
      for (const reference of references) {
        distance = Math.min(distance, api.euclideanDistance(face.descriptor, reference));
      }
    }

    // Map descriptor distance to the app's playful meter, not a probability.
    return Math.round(100 * Math.max(0, Math.min(1, (0.85 - distance) / 0.6)));
  };
}

export function getFaceComparator() {
  modelPromise ||= createComparator().catch(error => {
    modelPromise = undefined;
    throw error;
  });
  return modelPromise;
}
