import { FAQ } from '../seo/faq.js';
import { href } from '../lib/base.js';

/* Presentational landing pieces shared by the live app and the pre-rendered SEO landing page. */

export function HeroCopy() {
  return (
    <section className="hero">
      <h1>
        Stranger chat. Talk to <em>someone new</em>.
      </h1>
      <p className="lead">
        Free, anonymous stranger talk by text or video. Get paired with a random person who shares
        your interests, say hi, and skip whenever you like. No sign-up, no profiles, nothing stored.
      </p>
    </section>
  );
}

export function FeatureCards() {
  return (
    <section className="features" aria-label="How it works">
      <div className="card feature">
        <h3>Interest matching</h3>
        <p>
          Add a few interests and we pair you with a stranger who shares one. If nobody does, we
          match you with anyone after a few seconds.
        </p>
      </div>
      <div className="card feature">
        <h3>Peer-to-peer video</h3>
        <p>
          Video and audio travel directly between browsers over encrypted WebRTC. Our servers only
          help the two of you find each other.
        </p>
      </div>
      <div className="card feature">
        <h3>Nothing to remember</h3>
        <p>
          No accounts and no chat history. Reports keep a short excerpt for moderation only, for a
          limited time.
        </p>
      </div>
    </section>
  );
}

export function HouseRules() {
  return (
    <aside className="card" aria-labelledby="rules-title">
      <h2 id="rules-title" style={{ margin: '0 0 14px', fontSize: 18 }}>
        House rules
      </h2>
      <ul className="rules" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        <li>
          <span className="ico" aria-hidden="true">
            18
          </span>
          <span>
            <strong>Adults only.</strong> Anyone who appears to be a minor is reported and removed.
          </span>
        </li>
        <li>
          <span className="ico" aria-hidden="true">
            ✕
          </span>
          <span>
            <strong>No nudity, harassment or hate.</strong> Reports from multiple people lead to
            automatic bans.
          </span>
        </li>
        <li>
          <span className="ico" aria-hidden="true">
            ⚑
          </span>
          <span>
            <strong>Report and block</strong> are one tap away during every chat.
          </span>
        </li>
        <li>
          <span className="ico" aria-hidden="true">
            ◎
          </span>
          <span>
            <strong>Stay anonymous.</strong> Never share your address, bank details or passwords.
          </span>
        </li>
      </ul>
    </aside>
  );
}

export function Faq() {
  return (
    <section className="card faq" aria-labelledby="faq-title">
      <h2 id="faq-title">Questions about stranger chat</h2>
      {FAQ.map(({ q, a }) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} STRANGER · free anonymous stranger chat</span>
      <a href={href('/terms')} data-link>
        Terms
      </a>
      <a href={href('/privacy')} data-link>
        Privacy
      </a>
      <a href={href('/safety')} data-link>
        Safety
      </a>
    </footer>
  );
}
