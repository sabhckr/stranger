import { Logo } from './Logo.js';
import { href } from '../lib/base.js';

const NOTICE = (
  <div className="alert alert-warn" role="note">
    Template text. A lawyer must review and adapt this before public launch (see
    docs/EXTERNAL-SERVICES.md).
  </div>
);

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="page">
      <div className="container">
        <header className="site-header">
          <Logo />
          <a href={href('/')} className="btn btn-ghost" data-link>
            Back
          </a>
        </header>
        <main className="prose">
          <h1>{title}</h1>
          {NOTICE}
          {children}
        </main>
      </div>
    </div>
  );
}

export function TermsPage() {
  return (
    <Shell title="Terms of Service">
      <h2>Who can use STRANGER</h2>
      <p>
        You must be at least 18 years old. By using the service you confirm this and agree to these
        terms.
      </p>
      <h2>Rules</h2>
      <ul>
        <li>
          No nudity, sexual content, harassment, threats, hate speech, or content involving minors.
        </li>
        <li>No spam, advertising, scams, or requests for money or personal information.</li>
        <li>No recording or distributing other people's video or messages without consent.</li>
        <li>No attempts to disrupt or abuse the service.</li>
      </ul>
      <h2>Enforcement</h2>
      <p>
        Reports are reviewed by moderators. Multiple independent reports result in an automatic
        temporary suspension; moderators may issue longer or permanent bans. Bans are applied to an
        anonymous browser identifier and, where necessary, to a hashed network address.
      </p>
      <h2>No warranty</h2>
      <p>The service is provided as is. We are not responsible for the conduct of other users.</p>
      <h2>Contact</h2>
      <p>
        <strong>Operator:</strong> [legal entity name, address and contact email — to be completed
        by the operator].
      </p>
    </Shell>
  );
}

export function PrivacyPage() {
  return (
    <Shell title="Privacy Policy">
      <h2>What we do not keep</h2>
      <p>
        We do not store your messages, audio or video. Chats are relayed in real time and video is
        sent directly between browsers (or through a relay server that cannot read it) using
        encrypted WebRTC.
      </p>
      <h2>What we process</h2>
      <ul>
        <li>
          <strong>A random browser identifier</strong> kept in your browser's storage so blocks and
          bans work. The server only ever stores a keyed hash of it.
        </li>
        <li>
          <strong>Your network address</strong>, hashed with a daily-rotating key, to limit abuse
          (connection caps). A stable hash is stored only inside a ban record if you are banned.
        </li>
        <li>
          <strong>Interests you type</strong>, used only while you wait for a match.
        </li>
        <li>
          <strong>Reports</strong>: the reason, optional details, and (if you choose) the last
          messages of the reported chat as you saw them. Reports are deleted after the retention
          period configured by the operator (default 90 days).
        </li>
      </ul>
      <h2>Cookies and tracking</h2>
      <p>No advertising cookies and no third-party analytics are included in this software.</p>
      <h2>Your rights</h2>
      <p>
        Clearing your browser storage removes your identifier. Contact the operator to exercise
        data-protection rights.
      </p>
    </Shell>
  );
}

export function SafetyPage() {
  return (
    <Shell title="Safety">
      <h2>Stay anonymous</h2>
      <ul>
        <li>Never share your full name, address, school, workplace, bank details or passwords.</li>
        <li>Assume anything you show on camera could be screenshotted by the other person.</li>
        <li>Use the camera-off button whenever you want; you can still chat by text.</li>
      </ul>
      <h2>If something goes wrong</h2>
      <ul>
        <li>
          Press <strong>Next</strong> or <strong>Stop</strong> at any time; there is no obligation
          to stay.
        </li>
        <li>
          Use <strong>Report</strong> to tell moderators what happened and <strong>Block</strong> so
          you are never matched again.
        </li>
        <li>
          If you encounter content involving a minor, report it here and to your local authorities
          or hotline immediately.
        </li>
      </ul>
      <h2>What happens to reports</h2>
      <p>
        Reports are stored with anonymous identifiers only and reviewed by moderators. Users
        reported by several different people in a short period are suspended automatically.
      </p>
    </Shell>
  );
}
