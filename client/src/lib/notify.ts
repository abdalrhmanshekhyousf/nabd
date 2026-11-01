import { toast, type ExternalToast } from 'sonner';
import { playSound } from './sound';

// Toasts with a matching sound. Use these instead of calling `toast` directly so
// every message in the app sounds the same way.
export const notify = {
  success: (message: string, options?: ExternalToast) => {
    playSound('success');
    return toast.success(message, options);
  },
  error: (message: string, options?: ExternalToast) => {
    playSound('error');
    return toast.error(message, options);
  },
  warning: (message: string, options?: ExternalToast) => {
    playSound('warning');
    return toast.warning(message, options);
  },
  info: (message: string, options?: ExternalToast) => {
    playSound('notify');
    return toast.info(message, options);
  },
  /** A live notification; urgent ones ring like a heart monitor (task 2.3). */
  alert: (
    message: string,
    { urgent = false, ...options }: ExternalToast & { urgent?: boolean } = {},
  ) => {
    playSound(urgent ? 'urgent' : 'notify');
    return urgent ? toast.error(message, { duration: 10000, ...options }) : toast(message, options);
  },
  promise: toast.promise,
  dismiss: toast.dismiss,
};
