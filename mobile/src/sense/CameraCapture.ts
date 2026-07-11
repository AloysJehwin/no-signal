import {CameraView, useCameraPermissions} from 'expo-camera';

// Camera is now typically driven by the CameraView component + hooks, but we
// keep a small imperative shim so callers can grab a still photo.
let cameraRef: CameraView | null = null;

export const registerCameraRef = (ref: CameraView | null): void => {
  cameraRef = ref;
};

export const capturePhoto = async (): Promise<string> => {
  if (!cameraRef) throw new Error('camera not initialised');
  const photo = await cameraRef.takePictureAsync({quality: 0.7});
  if (!photo?.uri) throw new Error('capture failed');
  return photo.uri;
};

export {useCameraPermissions};

export const requestCameraPermission = async (): Promise<boolean> => {
  // Kept for parity with the old API; UI should prefer the hook.
  const {Camera} = await import('expo-camera');
  const status = await Camera.requestCameraPermissionsAsync();
  return status.granted;
};
