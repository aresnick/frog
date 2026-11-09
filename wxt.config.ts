import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Frog',
    description: 'Find a comfortable page tint with live hue, saturation, and brightness controls.',
    permissions: ['activeTab', 'scripting', 'storage'],
    action: {
      default_title: 'Frog · Adjust your page tint',
    },
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
  },
});
