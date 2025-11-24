import { Buffer } from 'buffer';
import process from 'process';

declare global {
  interface Window {
    Buffer?: typeof Buffer;
    process?: typeof process;
    global?: typeof window;
  }
}

if (typeof window !== 'undefined') {
  if (!window.Buffer) {
    window.Buffer = Buffer;
  }
  if (!window.process) {
    window.process = process;
  }
  const browserProcess = window.process as typeof process & {
    browser?: boolean;
  };
  browserProcess.browser = true;
  if (!browserProcess.version) {
    (browserProcess as any).version = 'v18.0.0';
  }
  if (!window.global) {
    window.global = window;
  }
}
