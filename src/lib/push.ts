import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushSupport = 'ok' | 'needs-home-screen' | 'unsupported';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** iPhone only allows web push for apps added to the Home Screen (iOS 16.4+). */
export function pushSupport(): PushSupport {
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID_PUBLIC_KEY;
  if (capable) return 'ok';
  if (isIos() && !isStandalone()) return 'needs-home-screen';
  return 'unsupported';
}

/** One line shown under the "can't enable" message, so a screenshot tells which requirement is missing. */
export function pushDiagnostics(): string {
  const yes = (v: boolean) => (v ? 'có' : 'không');
  return [
    `Chế độ ứng dụng: ${yes(isStandalone())}`,
    `Service worker: ${yes('serviceWorker' in navigator)}`,
    `PushManager: ${yes('PushManager' in window)}`,
    `Notification: ${yes('Notification' in window)}`,
    `Khóa: ${yes(!!VAPID_PUBLIC_KEY)}`,
  ].join(' · ');
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null;
  // getRegistration, not .ready: .ready waits (forever, if needed) for the worker to activate.
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** True when this device is subscribed and the server knows about it. */
export async function isPushEnabled(): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub || Notification.permission !== 'granted') return false;
  const { count } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('endpoint', sub.endpoint);
  return !!count;
}

const toBytes = (b64url: string) => {
  const bin = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** Must run from a tap: iOS only shows the permission prompt for a user gesture. */
export async function enablePush(): Promise<string | null> {
  if ((await Notification.requestPermission()) !== 'granted') {
    return 'Bạn đã không cho phép thông báo. Bật lại trong Cài đặt của điện thoại → Thông báo → Chi tiêu.';
  }
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC_KEY!) }));
  const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'user_id,endpoint' });
  return error ? error.message : null;
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function sendTestPush(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('notify', { body: { type: 'test' } });
  if (error) return 'Không gửi được, thử lại sau.';
  return data?.sent ? 'Đã gửi. Thông báo sẽ hiện trong vài giây.' : 'Chưa có máy nào bật thông báo.';
}
