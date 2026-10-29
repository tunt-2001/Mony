// Delivery of push messages to every device a user enabled notifications on.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { PushMessage } from './alerts.ts';
import { sendPush, type PushTarget, type Vapid } from './webpush.ts';

export function vapidFromEnv(): Vapid | null {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://quanly-chitieu.pages.dev' };
}

/** Sends each message to each of the user's devices; drops subscriptions the push service says are gone. */
export async function pushToUser(db: SupabaseClient, userId: string, messages: PushMessage[]): Promise<number> {
  const vapid = vapidFromEnv();
  if (!vapid || messages.length === 0) return 0;
  const { data } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  let sent = 0;
  for (const sub of (data ?? []) as (PushTarget & { id: string })[]) {
    for (const m of messages) {
      const status = await sendPush(sub, m, vapid).catch(() => 0);
      if (status === 404 || status === 410) {
        await db.from('push_subscriptions').delete().eq('id', sub.id);
        break;
      }
      if (status >= 200 && status < 300) sent++;
      else console.error(`push ${status} for subscription ${sub.id}`);
    }
  }
  return sent;
}
