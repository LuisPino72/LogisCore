let cachedResult: boolean | null = null;

export async function hasCamera(): Promise<boolean> {
  if (cachedResult !== null) return cachedResult;

  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    cachedResult = false;
    return false;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    cachedResult = devices.some((d) => d.kind === 'videoinput');
    return cachedResult;
  } catch {
    cachedResult = false;
    return false;
  }
}

export function resetCameraCache(): void {
  cachedResult = null;
}
