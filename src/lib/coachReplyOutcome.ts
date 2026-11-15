/**
 * What the coach is told after replying to a student self-assessment.
 * Only a cloud write says it reached the student's From your coach inbox.
 */

import type { InboxDelivery } from './studentInboxClient.ts';

export type ReplyDelivery = InboxDelivery | { mode: 'folder'; name: string };

export function assessmentReplyText(
  delivery: ReplyDelivery,
  name: string,
  marked: { ok: true } | { ok: false; error: string },
): { text: string; error: boolean } {
  const tail = marked.ok ? '' : ` Marking it answered did not save: ${marked.error}`;
  if (delivery.mode === 'cloud') {
    return { text: `Delivered to ${name}'s From your coach inbox. They see it next time they open Student Edition.${tail}`, error: false };
  }
  if (delivery.mode === 'folder') {
    return {
      text: `Not sent over Advantage Cloud. Saved to the gym folder for ${name}; it shows once their app reads the gym folder.${tail}`,
      error: false,
    };
  }
  return {
    text: `Not delivered to ${name}'s inbox. ${delivery.reason} The file downloaded on this device; ${name} imports it to see your reply.${tail}`,
    error: true,
  };
}
