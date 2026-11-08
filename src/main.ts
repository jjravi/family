import { startApp } from './ui/app';
import { registerServiceWorker } from './ui/offline';
import { errorMessage } from './ui/text';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app mount element');

startApp(root).catch((error: unknown) => {
  console.error(error);
  root.textContent = `Family Tree could not start: ${errorMessage(error)}`;
});

if (import.meta.env.PROD) registerServiceWorker();
