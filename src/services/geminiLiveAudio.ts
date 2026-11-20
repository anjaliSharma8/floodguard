export function encodePcm16Audio(
  samples: ArrayLike<number>,
  inputSampleRate: number,
  outputSampleRate = 16000
): string {
  if (!Number.isFinite(inputSampleRate) || inputSampleRate < outputSampleRate) {
    throw new RangeError('Input audio sample rate must be at least 16 kHz.');
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(samples.length / ratio);
  const pcm = new Uint8Array(outputLength * 2);
  const view = new DataView(pcm.buffer);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(samples.length, Math.floor((outputIndex + 1) * ratio));
    let average = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      average += samples[inputIndex];
    }
    average /= Math.max(1, end - start);
    const clamped = Math.max(-1, Math.min(1, average));
    view.setInt16(outputIndex * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let start = 0; start < pcm.length; start += chunkSize) {
    binary += String.fromCharCode(...pcm.subarray(start, start + chunkSize));
  }
  return btoa(binary);
}

export function decodePcm16Audio(base64: string): Float32Array {
  const binary = atob(base64);
  if (binary.length % 2 !== 0) {
    throw new Error('Gemini returned malformed PCM audio.');
  }

  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.length / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000;
  }
  return samples;
}
