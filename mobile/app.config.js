module.exports = {
  expo: {
    name: 'NoSignal',
    slug: 'nosignal-mobile',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    newArchEnabled: false,
    owner: 'aloysjehwin',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.nosignal.mobile',
      infoPlist: {
        NSCameraUsageDescription: 'Capture photos of equipment faults for diagnosis.',
        NSMicrophoneUsageDescription: 'Optional voice input for describing faults.',
      },
    },
    android: {
      package: 'com.nosignal.mobile',
      permissions: ['CAMERA', 'RECORD_AUDIO', 'ACCESS_NETWORK_STATE'],
    },
    web: {
      bundler: 'metro',
    },
    plugins: [
      'expo-camera',
      [
        'expo-audio',
        {
          microphonePermission: 'Allow NoSignal to record audio of your symptom or equipment noise.',
        },
      ],
    ],
    extra: {
      hfToken: process.env.EXPO_PUBLIC_HF_TOKEN,
      geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY,
      useOndeviceLlm: process.env.EXPO_PUBLIC_USE_ONDEVICE_LLM === 'true',
      eas: {
        projectId: '6e79f2e1-9fda-4ec2-bdaf-e09e7b05769d',
      },
    },
  },
};
