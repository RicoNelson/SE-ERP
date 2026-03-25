/// <reference types="vite-plugin-pwa/client" />

import { RecaptchaVerifier } from 'firebase/auth';

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{
      outcome: 'accepted' | 'dismissed';
      platform: string;
    }>;
  }

  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
  }
  
  const grecaptcha: {
    reset: (widgetId?: number) => void;
    render: (container: string | HTMLElement, parameters: unknown) => number;
  };
}

export {};
