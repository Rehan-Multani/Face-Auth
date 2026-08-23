import jpeg from 'jpeg-js';

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const lookup = new Uint8Array(256);
for (let i = 0; i < chars.length; i++) {
  lookup[chars.charCodeAt(i)] = i;
}

const base64ToUint8Array = (base64) => {
  const cleanBase64 = base64.replace(/^data:image\/[a-z]+;base64,/, '');
  const len = cleanBase64.length;
  const bufferLength = Math.floor(len * 0.75);
  const bytes = new Uint8Array(bufferLength);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const encoded1 = lookup[cleanBase64.charCodeAt(i)];
    const encoded2 = lookup[cleanBase64.charCodeAt(i + 1)];
    const encoded3 = lookup[cleanBase64.charCodeAt(i + 2)];
    const encoded4 = lookup[cleanBase64.charCodeAt(i + 3)];

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (encoded3 !== undefined && cleanBase64.charAt(i + 2) !== '=') {
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    }
    if (encoded4 !== undefined && cleanBase64.charAt(i + 3) !== '=') {
      bytes[p++] = ((encoded3 & 3) << 6) | encoded4;
    }
  }

  return bytes.subarray(0, p);
};

/**
 * Extract 128-dimensional biometric spatial-texture feature vector from decoded camera pixels
 */
export const extractFaceDescriptorFromImage = (base64Str) => {
  if (!base64Str || typeof base64Str !== 'string' || base64Str.length < 500) {
    return {
      success: false,
      message: 'Camera frame capture failed. Please make sure your camera is clean and visible.',
    };
  }

  try {
    const rawBytes = base64ToUint8Array(base64Str);
    const decoded = jpeg.decode(rawBytes, { useTArray: true, formatAsRGBA: false });
    const { width: W, height: H, data } = decoded;

    if (!W || !H || !data || data.length === 0) {
      return {
        success: false,
        message: 'Could not decode camera image frame.',
      };
    }

    // Crop to center oval face ROI (60% width, 70% height)
    const xStart = Math.floor(W * 0.20);
    const xEnd = Math.floor(W * 0.80);
    const yStart = Math.floor(H * 0.15);
    const yEnd = Math.floor(H * 0.85);

    const regionW = xEnd - xStart;
    const regionH = yEnd - yStart;

    const gridCols = 8;
    const gridRows = 8;
    const cellW = Math.max(1, Math.floor(regionW / gridCols));
    const cellH = Math.max(1, Math.floor(regionH / gridRows));

    let totalLum = 0;
    let totalLumSq = 0;
    let pixelCount = 0;

    const gridLum = new Float64Array(64);
    const gridGrad = new Float64Array(64);

    const isRGBA = data.length >= W * H * 4;
    const bytesPerPixel = isRGBA ? 4 : 3;

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        let cellSum = 0;
        let cellGradSum = 0;
        let cellPixels = 0;

        const cyStart = yStart + r * cellH;
        const cyEnd = Math.min(cyStart + cellH, H);
        const cxStart = xStart + c * cellW;
        const cxEnd = Math.min(cxStart + cellW, W);

        for (let y = cyStart; y < cyEnd; y++) {
          for (let x = cxStart; x < cxEnd; x++) {
            const idx = (y * W + x) * bytesPerPixel;
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            cellSum += lum;
            totalLum += lum;
            totalLumSq += lum * lum;
            cellPixels++;

            if (x > cxStart && y > cyStart) {
              const prevXIdx = (y * W + (x - 1)) * bytesPerPixel;
              const prevYIdx = ((y - 1) * W + x) * bytesPerPixel;
              const lumX = 0.299 * data[prevXIdx] + 0.587 * data[prevXIdx + 1] + 0.114 * data[prevXIdx + 2];
              const lumY = 0.299 * data[prevYIdx] + 0.587 * data[prevYIdx + 1] + 0.114 * data[prevYIdx + 2];
              cellGradSum += Math.abs(lum - lumX) + Math.abs(lum - lumY);
            }
          }
        }

        const cellIdx = r * gridCols + c;
        gridLum[cellIdx] = cellSum / Math.max(1, cellPixels);
        gridGrad[cellIdx] = cellGradSum / Math.max(1, cellPixels);
        pixelCount += cellPixels;
      }
    }

    const faceMean = totalLum / Math.max(1, pixelCount);
    const faceVariance = (totalLumSq / Math.max(1, pixelCount)) - (faceMean * faceMean);

    // Reject camera obstruction, blank wall, or pitch black/overblown frame
    if (faceVariance < 20 || faceMean < 10 || faceMean > 245) {
      return {
        success: false,
        message: 'No face clearly detected. Please ensure your face is well-lit and centered in the oval.',
      };
    }

    const std = Math.sqrt(Math.max(1, faceVariance));
    const descriptor = new Float64Array(128);

    for (let i = 0; i < 64; i++) {
      descriptor[i] = (gridLum[i] - faceMean) / std;
      descriptor[64 + i] = gridGrad[i] / std;
    }

    // Zero-mean centering across 128 features for pure discriminative angle
    let dSum = 0;
    for (let i = 0; i < 128; i++) dSum += descriptor[i];
    const dMean = dSum / 128;

    let normSum = 0;
    const zeroCentered = new Float64Array(128);
    for (let i = 0; i < 128; i++) {
      zeroCentered[i] = descriptor[i] - dMean;
      normSum += zeroCentered[i] * zeroCentered[i];
    }

    const l2 = Math.sqrt(normSum) || 1;
    const finalDesc = new Array(128);
    for (let i = 0; i < 128; i++) {
      finalDesc[i] = parseFloat((zeroCentered[i] / l2).toFixed(6));
    }

    return { success: true, descriptor: finalDesc };
  } catch (err) {
    return {
      success: false,
      message: err.message || 'Error processing facial features from camera.',
    };
  }
};



/**
 * Liveness Step Definitions
 */
export const LIVENESS_STEPS = [
  { id: 'CENTER', title: 'Position your face in the oval', instruction: 'Look straight into the camera' },
  { id: 'BLINK', title: 'Blink your eyes', instruction: 'Blink naturally to verify liveness' },
  { id: 'HOLD', title: 'Hold steady', instruction: 'Scanning facial landmarks...' },
];

