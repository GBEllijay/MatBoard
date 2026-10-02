import { Link } from 'react-router-dom';
import { LegalContact, LegalPage } from '../components/LegalPage';

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service — Advantage"
      updated="October 1, 2026"
      related={{ to: '/privacy', label: 'Privacy Policy' }}
    >
      <section>
        <p>
          These Terms of Service (“Terms”) are a binding agreement between you and Advantage App,
          LLC (“Advantage,” “we,” “us,” or “our”) governing access to and use of the Advantage
          application and related websites, including{' '}
          <a href="https://advantagebjjtimer.com">https://advantagebjjtimer.com</a> and{' '}
          <a href="https://matboard.pages.dev">https://matboard.pages.dev</a> (collectively, the
          “Service”).
        </p>
        <p>
          By accessing or using the Service, you agree to these Terms. If you do not agree, do not
          use the Service.
        </p>
      </section>

      <section>
        <h3>1. Eligibility and accounts</h3>
        <p>
          You represent that you are at least 18 years old (or the age of majority where you live)
          and have authority to bind the gym or organization you represent. You are responsible for
          activity under your access and for keeping credentials and devices secure.
        </p>
      </section>

      <section>
        <h3>2. The Service</h3>
        <p>
          Advantage provides tools that may include, without limitation, scoreboard and round-timer
          features, coaching and planning tools, competitor and event utilities, and media-related
          features for gym use. Features may vary by product tier (for example, Lite, Coach, or
          Pro) and may change over time.
        </p>
      </section>

      <section>
        <h3>3. Customer-owned media and cloud storage</h3>
        <h4>3.1 No Advantage media hosting for your library.</h4>
        <p>
          Advantage does not undertake to host, store, or back up your photo or video library as a
          general storage provider. Except for limited operational data described in our{' '}
          <Link to="/privacy">Privacy Policy</Link> (such as lesson text and file or folder
          references), media files remain in storage you control.
        </p>
        <h4>3.2 Cloud access required for certain Pro features.</h4>
        <p>
          Certain Pro (and related) features — including without limitation gallery casting,
          cloud-backed lesson plans, class history tied to a cloud folder, and other features that
          read from or write to your media library — require you to connect and maintain authorized
          access to a supported third-party cloud storage provider (including Google Drive today,
          and OneDrive, Dropbox, iCloud, or similar providers if and when offered).
        </p>
        <p>
          By enabling those features, you acknowledge and agree that: (a) such features will not
          function, or will function only in a limited way, without a valid cloud connection and
          the permissions you grant; (b) Advantage’s ability to display, organize, or sync related
          content depends on the availability, APIs, policies, and uptime of that third-party
          provider; and (c) you are solely responsible for your cloud account, folder permissions,
          retention, sharing settings, and compliance with that provider’s terms.
        </p>
        <h4>3.3 Your content.</h4>
        <p>
          You retain ownership of content you store in your cloud accounts. You grant Advantage a
          limited, non-exclusive license to access and process that content solely as needed to
          provide the features you use, in accordance with the permissions you grant and our{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h3>4. Acceptable use</h3>
        <p>
          You agree not to misuse the Service, including by attempting unauthorized access;
          interfering with the Service; reverse engineering except where permitted by law; using
          the Service to violate law or third-party rights; uploading unlawful, infringing, or
          harmful content; or reselling the Service except as we expressly allow in writing.
        </p>
      </section>

      <section>
        <h3>5. Third-party services</h3>
        <p>
          The Service may interoperate with Google and other third parties. Your use of those
          services is subject to their terms and privacy policies. Advantage is not responsible for
          third-party services, outages, API changes, or account suspensions outside our control.
        </p>
      </section>

      <section>
        <h3>6. Fees and trials</h3>
        <p>
          Paid plans, trials, and billing terms (if any) will be presented at purchase or in an
          order form. Advantage White, when offered, is a one-time purchase. Checkout is provided
          by Stripe, and the price and any promo code are shown before you pay. Card details are
          entered on Stripe. Unless stated otherwise, fees are non-refundable except where required
          by law. We may change prices with notice for future periods.
        </p>
      </section>

      <section>
        <h3>7. Intellectual property</h3>
        <p>
          Advantage and its licensors own the Service, software, branding, and documentation. These
          Terms do not transfer ownership of Advantage IP to you. Feedback you provide may be used
          by us without obligation to you.
        </p>
      </section>

      <section>
        <h3>8. Disclaimer of warranties</h3>
        <p className="legal__caps">
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY
          LAW, ADVANTAGE DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE
          SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT CLOUD-DEPENDENT FEATURES WILL REMAIN
          AVAILABLE IF A THIRD-PARTY PROVIDER CHANGES OR WITHDRAWS ACCESS.
        </p>
      </section>

      <section>
        <h3>9. Limitation of liability</h3>
        <p className="legal__caps">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, ADVANTAGE WILL NOT BE LIABLE FOR INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS,
          LOST DATA, OR BUSINESS INTERRUPTION, EVEN IF ADVISED OF THE POSSIBILITY. OUR TOTAL
          LIABILITY FOR CLAIMS ARISING OUT OF OR RELATED TO THE SERVICE WILL NOT EXCEED THE GREATER
          OF (A) AMOUNTS YOU PAID TO ADVANTAGE FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE THE
          CLAIM OR (B) ONE HUNDRED U.S. DOLLARS (US $100). SOME JURISDICTIONS DO NOT ALLOW CERTAIN
          LIMITATIONS; IN THOSE CASES, OUR LIABILITY IS LIMITED TO THE FULLEST EXTENT PERMITTED.
        </p>
      </section>

      <section>
        <h3>10. Indemnity</h3>
        <p>
          You will defend and indemnify Advantage and its officers, directors, and agents against
          claims arising from your content, your cloud accounts, your misuse of the Service, or
          your violation of these Terms or applicable law.
        </p>
      </section>

      <section>
        <h3>11. Suspension and termination</h3>
        <p>
          We may suspend or terminate access if you breach these Terms, if required by law, or if
          needed to protect the Service or others. You may stop using the Service at any time.
          Provisions that by nature should survive (including ownership, disclaimers, limitations,
          and indemnity) will survive termination.
        </p>
      </section>

      <section>
        <h3>12. Changes</h3>
        <p>
          We may modify the Service and these Terms. We will update the “Last updated” date when
          Terms change. Material changes may be communicated via the site or email if we have an
          address for you. Continued use after changes become effective constitutes acceptance,
          except where law requires otherwise.
        </p>
      </section>

      <section>
        <h3>13. Governing law</h3>
        <p>
          These Terms are governed by the laws of the State of Georgia, USA, excluding
          conflict-of-law rules, unless mandatory local law provides otherwise. Courts located in
          Georgia will have exclusive jurisdiction over disputes, except where prohibited.
        </p>
      </section>

      <section>
        <h3>14. Miscellaneous</h3>
        <p>
          These Terms and the <Link to="/privacy">Privacy Policy</Link> are the entire agreement
          regarding the Service. If any provision is unenforceable, the remainder stays in effect.
          Failure to enforce a provision is not a waiver. You may not assign these Terms without
          our consent; we may assign them in connection with a reorganization or sale.
        </p>
      </section>

      <section>
        <h3>15. Contact</h3>
        <LegalContact />
      </section>
    </LegalPage>
  );
}
