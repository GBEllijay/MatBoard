import { LegalContact, LegalPage } from '../components/LegalPage';
import { SITE_FEEDBACK_EMAIL } from '../lib/siteFooter';

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy — Advantage"
      updated="October 6, 2026"
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
        <h3>2. Cloud Storage and Your Files</h3>
        <p>
          When you connect a supported storage provider (Google Drive, OneDrive, iCloud, or Google
          Photos), Advantage asks for permission through that provider’s own sign-in screen. It
          requests only the limited access it needs to save and open the files you create or choose
          in the app. Your photos, videos, and lesson files are stored in your own account, and
          Advantage App, LLC does not keep copies on its servers. The connection is kept on your
          device and used only to read and write your files when you ask the app to. We do not sell
          this data or use it for advertising. For iCloud, sign-in happens on Apple’s page. We do
          not receive your Apple ID password, and we do not read your iCloud Drive or iCloud Photos
          library. Notes you save with the iCloud connection stay in your iCloud account. For Google
          Drive and Google Photos, our use of
          information from Google APIs follows the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements. You can disconnect at any time, either in the
          app or in your provider account’s security settings.
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
          (b) Cloud storage data you authorize. If you connect Google Drive, OneDrive, iCloud, or
          Google Photos, we access folders and files only as permitted by the access you approve,
          and only as needed to save and open the files you create or choose in the app.
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
          (e) Purchase and alpha-request information, as described in section 4. Advantage does not
          receive or store your card number.
        </p>
      </section>

      <section>
        <h3>4. Payments and Alpha Requests</h3>
        <p>
          Stripe collects your payment details when you buy. We receive limited purchase information
          from Stripe, such as your email address, what you bought, and the amount, so we can unlock
          your purchase and provide support. If you email us for an alpha code, we keep your email
          address and message to reply and manage your access. That address is{' '}
          <a href={`mailto:${SITE_FEEDBACK_EMAIL}`}>{SITE_FEEDBACK_EMAIL}</a>.
        </p>
      </section>

      <section>
        <h3>5. How we use information</h3>
        <p>
          We use information to provide, operate, secure, maintain, and improve the Service; to
          authenticate you and maintain cloud connections you request; to enable Coach Unlimited,
          Pro, and related features that depend on your cloud storage; to unlock a purchase and
          provide support; to reply to alpha-access requests; to communicate with you about the
          Service when you contact us; and to comply with law.
        </p>
        <p>
          We do not sell your personal information. We do not sell your photos, videos, or
          cloud-stored media. We do not use your connected-storage content for advertising.
        </p>
      </section>

      <section>
        <h3>6. Sharing</h3>
        <p>We may share information with:</p>
        <p>
          (a) Service providers that host or secure the Service (for example, Cloudflare or similar
          infrastructure), solely to operate Advantage;
        </p>
        <p>
          (b) Third parties you connect or pay through (such as Google, Microsoft, Apple, or Stripe when you buy),
          under their terms and privacy policies;
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
        <h3>7. Retention</h3>
        <p>
          Device-local data remains until you clear it, disconnect features, or remove it in the
          app. Cloud files remain under your cloud account until you delete or change them there.
          Connection credentials and tokens are kept only as needed to provide the connection you
          requested. Server logs are retained as reasonably necessary for security and operations.
          Purchase information we receive from Stripe, and email you send us to request an alpha
          code, is kept as needed to unlock the purchase, provide support, and manage that access.
        </p>
      </section>

      <section>
        <h3>8. Your choices</h3>
        <p>
          You may disconnect cloud storage in the app or in your provider account’s security
          settings, clear browser site data, and delete or relocate files in your own cloud
          storage.
        </p>
      </section>

      <section>
        <h3>9. Security</h3>
        <p>
          We use reasonable administrative, technical, and organizational measures appropriate to
          the nature of the Service. No method of transmission or storage is completely secure. You
          are responsible for safeguarding accounts and devices you use with Advantage.
        </p>
      </section>

      <section>
        <h3>10. International processing</h3>
        <p>
          The Service may be hosted in the United States. If you access it from another country,
          information may be processed in the United States or other locations where our providers
          operate.
        </p>
      </section>

      <section>
        <h3>11. Changes</h3>
        <p>
          We may update this Policy from time to time. We will revise the “Last updated” date when
          we do. Continued use of the Service after an update constitutes acceptance of the revised
          Policy, except where applicable law requires otherwise.
        </p>
      </section>

      <section>
        <h3>12. Contact</h3>
        <LegalContact />
      </section>
    </LegalPage>
  );
}
