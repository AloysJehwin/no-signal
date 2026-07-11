import {Camera} from 'react-native-vision-camera';

let cameraRef: Camera | null = null;

export const registerCameraRef = (ref: Camera | null): void => {
  cameraRef = ref;
};

export const capturePhoto = async (): Promise<string> => {
  if (!cameraRef) throw new Error('camera not initialised');
  const photo = await cameraRef.takePhoto({flash: 'off'});
  return `file://${photo.path}`;
};

export const requestCameraPermission = async (): Promise<boolean> => {
  const status = await Camera.requestCameraPermission();
  return status === 'granted';
};
