import { Link } from 'react-router-dom';
import { LegalContact, LegalPage } from '../components/LegalPage';
import { SITE_FEEDBACK_EMAIL } from '../lib/siteFooter';

function SupportEmail() {
  return <a href={`mailto:${SITE_FEEDBACK_EMAIL}`}>{SITE_FEEDBACK_EMAIL}</a>;
}

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service — Advantage"
      updated="October 5, 2026"
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
          features for gym use. Features may vary by product tier (for example, White, Coach, or
          Pro) and may change over time.
        </p>
      </section>

      <section>
        <h3>3. Purchases and Pricing</h3>
        <p>Advantage is sold in tiers. All prices are in U.S. dollars:</p>
        <ul>
          <li>Advantage White costs $9.99 as a one-time purchase.</li>
          <li>
            Advantage Coach costs $29.99 as a one-time purchase, once it’s offered for sale.
          </li>
          <li>
            Advantage Pro costs $99.99 as a one-time purchase, plus a subscription of $2.99 per
            month, once it’s offered for sale. The subscription renews monthly until you cancel.
            Canceling stops future charges, and subscription features stay available through the end
            of the period you’ve already paid for.
          </li>
        </ul>
        <p>
          Payments are processed by Stripe. Advantage App, LLC does not receive or store your full
          card number. Prices may change in the future, but a change does not affect a purchase
          you’ve already completed.
        </p>
        <p>
          We may offer promotional or discount codes at our discretion, to some or all customers.
          Codes have no cash value, may expire, cannot be combined unless stated, and may be
          revoked if misused.
        </p>
      </section>

      <section>
        <h3>4. Alpha Access</h3>
        <p>
          Advantage Coach and Advantage Pro are currently in alpha testing and are not offered for
          sale. We may provide free alpha access codes on request. To request one, email{' '}
          <SupportEmail />. Alpha features are provided “as is.” They may change, be incomplete,
          contain errors, or lose data, and we may end alpha access at any time. Alpha access does
          not guarantee future free access or any particular price.
        </p>
      </section>

      <section>
        <h3>5. Your Cloud Storage Account</h3>
        <p>
          Advantage Coach Unlimited and Advantage Pro save lesson plans, photos, videos, and related
          files to a cloud storage account that you own and control. Before Coach and Pro leave
          alpha and go on sale, Advantage supports connecting your own account with each of these
          providers: Google Drive, OneDrive, iCloud, and Google Photos. Google Drive is available
          now. OneDrive, iCloud, and Google Photos are shipping as part of that same launch set and
          will be working before those tiers are sold to the public.
        </p>
        <ul>
          <li>
            Advantage App, LLC does not host, provide, manage, or back up your cloud storage.
          </li>
          <li>
            The account you connect must be your own or your gym’s. It must not be an account
            managed or provided by Advantage App, LLC.
          </li>
          <li>
            Your storage account is governed by your provider’s terms. You are responsible for its
            fees, capacity, access, and backups.
          </li>
          <li>
            Without a connected storage account, some Coach Unlimited and Pro features will not work
            or will be limited.
          </li>
          <li>
            Advantage App, LLC is not responsible for files lost, deleted, or made unavailable
            because of your storage provider, your account settings, or changes the provider makes
            to its service.
          </li>
        </ul>
        <p>
          You retain ownership of content you store in your cloud accounts. You grant Advantage a
          limited, non-exclusive license to access and process that content solely as needed to
          provide the features you use, in accordance with the permissions you grant and our{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
        <h4>5.1 Purchase acknowledgment</h4>
        <p>
          Buyers of Advantage Coach Unlimited and Advantage Pro must accept the statement below.
          The buy flow does not collect that acceptance yet. It will be required at checkout when
          those tiers go on sale:
        </p>
        <p>
          “I understand that Advantage Coach Unlimited and Advantage Pro require my own Google
          Drive, OneDrive, iCloud, or Google Photos account to work fully. Advantage App, LLC does
          not provide, manage, or back up that storage, and the account I connect is my own, not
          one managed by Advantage App, LLC.”
        </p>
      </section>

      <section>
        <h3>6. Refunds</h3>
        <p>
          If Advantage does not work as intended, we will refund your purchase. We would rather fix
          the problem or return your money than keep a fee for a product that is broken.
        </p>
        <p>
          That promise covers the app itself: unlocks that fail, paid features that do not load, or
          clear defects that stop normal use. Contact us at <SupportEmail /> with what went wrong,
          and we will work with you promptly.
        </p>
        <p>
          Coach Unlimited and Advantage Pro need your own cloud storage account to save and open
          lesson plans, photos, and videos. Google Drive is available now. OneDrive, iCloud, and
          Google Photos are part of the same launch set and will be working before Coach and Pro
          are sold to the public. Setting up and connecting that account is your responsibility.
          Advantage App, LLC does not provide, manage, or back up your storage.
        </p>
        <p>
          A refund is not available when the app itself is working and the only issue is that your
          Google Drive, OneDrive, iCloud, or Google Photos account was not connected, not created,
          not signed in, out of space, or otherwise misconfigured. In those cases we will help you
          get connected if we can, but the purchase stands.
        </p>
      </section>

      <section>
        <h3>7. Acceptable use</h3>
        <p>
          You agree not to misuse the Service, including by attempting unauthorized access;
          interfering with the Service; reverse engineering except where permitted by law; using
          the Service to violate law or third-party rights; uploading unlawful, infringing, or
          harmful content; or reselling the Service except as we expressly allow in writing.
        </p>
      </section>

      <section>
        <h3>8. Third-party services</h3>
        <p>
          The Service may interoperate with Google and other third parties. Your use of those
          services is subject to their terms and privacy policies. Advantage is not responsible for
          third-party services, outages, API changes, or account suspensions outside our control.
        </p>
      </section>

      <section>
        <h3>9. Intellectual property</h3>
        <p>
          Advantage and its licensors own the Service, software, branding, and documentation. These
          Terms do not transfer ownership of Advantage IP to you. Feedback you provide may be used
          by us without obligation to you.
        </p>
      </section>

      <section>
        <h3>10. Disclaimer of warranties</h3>
        <p className="legal__caps">
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY
          LAW, ADVANTAGE DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE
          SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT CLOUD-DEPENDENT FEATURES WILL REMAIN
          AVAILABLE IF A THIRD-PARTY PROVIDER CHANGES OR WITHDRAWS ACCESS.
        </p>
      </section>

      <section>
        <h3>11. Limitation of liability</h3>
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
        <h3>12. Indemnity</h3>
        <p>
          You will defend and indemnify Advantage and its officers, directors, and agents against
          claims arising from your content, your cloud accounts, your misuse of the Service, or
          your violation of these Terms or applicable law.
        </p>
      </section>

      <section>
        <h3>13. Suspension and termination</h3>
        <p>
          We may suspend or terminate access if you breach these Terms, if required by law, or if
          needed to protect the Service or others. You may stop using the Service at any time.
          Provisions that by nature should survive (including ownership, disclaimers, limitations,
          and indemnity) will survive termination.
        </p>
      </section>

      <section>
        <h3>14. Changes</h3>
        <p>
          We may modify the Service and these Terms. We will update the “Last updated” date when
          Terms change. Material changes may be communicated via the site or email if we have an
          address for you. Continued use after changes become effective constitutes acceptance,
          except where law requires otherwise.
        </p>
      </section>

      <section>
        <h3>15. Governing law</h3>
        <p>
          These Terms are governed by the laws of the State of Georgia, USA, excluding
          conflict-of-law rules, unless mandatory local law provides otherwise. Courts located in
          Georgia will have exclusive jurisdiction over disputes, except where prohibited.
        </p>
      </section>

      <section>
        <h3>16. Miscellaneous</h3>
        <p>
          These Terms and the <Link to="/privacy">Privacy Policy</Link> are the entire agreement
          regarding the Service. If any provision is unenforceable, the remainder stays in effect.
          Failure to enforce a provision is not a waiver. You may not assign these Terms without
          our consent; we may assign them in connection with a reorganization or sale.
        </p>
      </section>

      <section>
        <h3>17. Contact</h3>
        <LegalContact />
      </section>
    </LegalPage>
  );
}
