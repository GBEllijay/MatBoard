import { LegalContact, LegalPage } from '../components/LegalPage';

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy — Advantage"
      updated="October 1, 2026"
      related={{ to: '/terms', label: 'Terms of Service' }}
    >
      <section>
        <p>
          Advantage App, LLC (“Advantage,” “we,” “us,” or “our”) operates the Advantage web
          application available at{' '}
          <a href="https://advantagebjjtimer.com">https://advantagebjjtimer.com</a> and related
          hosts such as <a href="https://matboard.pages.dev">https://matboard.pages.dev</a> (the
          “Service”).
        </p>
        <p>
          This Privacy Policy describes how we collect, use, store, and share information when you
          use the Service. By using the Service, you agree to this Policy.
        </p>
      </section>

      <section>
        <h3>1. Who this Policy covers</h3>
        <p>
          This Policy applies to gym owners, coaches, staff, and other users who access Advantage.
          Advantage is intended for business and professional use by adults, not for children under
          13 to set up independently.
        </p>
      </section>

      <section>
        <h3>2. What Advantage does with media</h3>
        <p>
          Advantage does not operate a general photo or video hosting service for your gym library.
          Photos, videos, and similar media files you choose to use with certain features remain in
          storage you control. Coach Unlimited and Advantage Pro require your own Google Drive,
          OneDrive, Google Photos, and iCloud accounts before they leave alpha. Advantage does not
          manage those accounts. Advantage may store lesson text, settings, and
          references such as file or folder identifiers so the Service can display, organize, or
          link to content you already keep in your own cloud storage.
        </p>
      </section>

      <section>
        <h3>3. Information we collect</h3>
        <p>Depending on the features you use, we may collect or process:</p>
        <p>
          (a) Account and authentication data. If you connect a third-party account (such as
          Google), we may receive identifiers such as your email address, account name, or tokens
          needed to maintain the connection you authorized.
        </p>
        <p>
          (b) Cloud storage data you authorize. If you connect Google Drive or another supported
          provider, we may access folders and files only as permitted by the scopes you approve and
          only as needed for features you use (for example, listing folders, selecting a gallery
          folder, reading metadata, writing lesson-plan files the Service creates, or downloading a
          file you choose to open).
        </p>
        <p>
          (c) Device-local data. Much of Advantage runs in your browser. Preferences, drafts,
          rosters, local media choices, and similar data may be stored on your device (including
          browser local storage or similar technologies).
        </p>
        <p>
          (d) Usage and technical data. Our hosting and security providers may process standard log
          data such as IP address, device/browser type, timestamps, and request URLs needed to
          deliver and protect the Service.
        </p>
        <p>
          (e) Purchase records. If you buy Advantage White, Stripe processes the payment. Advantage
          stores the email address Stripe provides and the Checkout session id so the Service can
          recognize that purchase. Advantage does not receive or store your card number.
        </p>
      </section>

      <section>
        <h3>4. How we use information</h3>
        <p>
          We use information to provide, operate, secure, maintain, and improve the Service; to
          authenticate you and maintain cloud connections you request; to enable Pro and related
          features that depend on your cloud storage; to communicate with you about the Service
          when you contact us; and to comply with law.
        </p>
        <p>
          We do not sell your personal information. We do not sell your photos, videos, or
          cloud-stored media. We do not use your Google Drive (or other connected cloud) content
          for third-party advertising.
        </p>
      </section>

      <section>
        <h3>5. Sharing</h3>
        <p>We may share information with:</p>
        <p>
          (a) Service providers that host or secure the Service (for example, Cloudflare or similar
          infrastructure), solely to operate Advantage;
        </p>
        <p>
          (b) Third parties you connect or pay through (such as Google, or Stripe for Advantage White
          checkout), under their terms and privacy policies;
        </p>
        <p>
          (c) Professional advisors, or authorities, when required by law or to protect rights,
          safety, or security;
        </p>
        <p>
          (d) A successor in connection with a merger, acquisition, or asset sale, subject to this
          Policy or equivalent notice.
        </p>
        <p>We do not share your gym media library with unrelated advertisers or other gyms.</p>
      </section>

      <section>
        <h3>6. Retention</h3>
        <p>
          Device-local data remains until you clear it, disconnect features, or remove it in the
          app. Cloud files remain under your cloud account until you delete or change them there.
          Connection credentials and tokens are kept only as needed to provide the connection you
          requested. Server logs are retained as reasonably necessary for security and operations.
        </p>
      </section>

      <section>
        <h3>7. Your choices</h3>
        <p>
          You may disconnect cloud storage in the Service, revoke access in your Google (or other
          provider) account settings, clear browser site data, and delete or relocate files in your
          own cloud storage.
        </p>
      </section>

      <section>
        <h3>8. Security</h3>
        <p>
          We use reasonable administrative, technical, and organizational measures appropriate to
          the nature of the Service. No method of transmission or storage is completely secure. You
          are responsible for safeguarding accounts and devices you use with Advantage.
        </p>
      </section>

      <section>
        <h3>9. International processing</h3>
        <p>
          The Service may be hosted in the United States. If you access it from another country,
          information may be processed in the United States or other locations where our providers
          operate.
        </p>
      </section>

      <section>
        <h3>10. Changes</h3>
        <p>
          We may update this Policy from time to time. We will revise the “Last updated” date when
          we do. Continued use of the Service after an update constitutes acceptance of the revised
          Policy, except where applicable law requires otherwise.
        </p>
      </section>

      <section>
        <h3>11. Contact</h3>
        <LegalContact />
      </section>
    </LegalPage>
  );
}
