import { RESTORE_FROM_ADDRESS } from './paywallDecisions.ts';

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
};

/** Send one restore message. Implementations must not log the address or the body. */
export type EmailSender = {
  readonly name: string;
  send(message: OutboundEmail): Promise<void>;
};

export type EmailEnv = {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_PROVIDER?: string;
};

export function memoryEmailSender(): EmailSender & { sent: OutboundEmail[] } {
  const sent: OutboundEmail[] = [];
  return {
    name: 'test',
    sent,
    async send(message) {
      sent.push({ to: message.to, subject: message.subject, text: message.text });
    },
  };
}

/**
 * Resolves without sending and without logging. Used only when the owner sets
 * EMAIL_PROVIDER=dry-run to exercise the route. The UI still says mail was
 * sent only through the generic sentence. Tests should inject memoryEmailSender
 * so they can read the message in memory. Never point tests at Resend.
 */
export function dryRunEmailSender(): EmailSender {
  return {
    name: 'dry-run',
    async send() {
      /* no network, no log */
    },
  };
}

export function resendEmailSender(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): EmailSender {
  return {
    name: 'resend',
    async send(message) {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });
      if (!response.ok) throw new Error('Email provider rejected the message.');
    },
  };
}

export function emailSenderFromEnv(env: EmailEnv, fetchImpl: typeof fetch = fetch): EmailSender | null {
  if (env.EMAIL_PROVIDER?.trim() === 'dry-run') return dryRunEmailSender();
  const key = env.RESEND_API_KEY?.trim() ?? '';
  if (!key) return null;
  const from = env.EMAIL_FROM?.trim() || RESTORE_FROM_ADDRESS;
  return resendEmailSender(key, from, fetchImpl);
}
