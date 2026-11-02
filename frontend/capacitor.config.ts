import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.canto.app',
  appName: 'Canto',
  webDir: 'dist/canto-ui/browser',
  // http origin + cleartext so the app can call the backend on the local network
  // edge-to-edge: the app's own themed background paints behind the status and navigation bars
  plugins: { SystemBars: { initialViewportFitValueHint: 'cover' } },
  server: { androidScheme: 'http', cleartext: true }
};

export default config;
