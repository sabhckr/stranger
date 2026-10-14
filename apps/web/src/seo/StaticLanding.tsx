import { href } from '../lib/base.js';
import {
  Faq,
  FeatureCards,
  HeroCopy,
  HouseRules,
  SiteFooter,
} from '../components/landing-content.js';

/**
 * Pre-rendered landing markup injected into dist/index.html at build time so crawlers and link
 * previews see real content before JavaScript runs. React replaces it on load.
 */
export function StaticLanding() {
  return (
    <div className="page">
      <div className="container">
        <header className="site-header">
          <a className="wordmark" href={href('/')}>
            <span className="dot" aria-hidden="true" />
            STRANGER
          </a>
          <span className="pill">Loading…</span>
        </header>
        <main>
          <HeroCopy />
          <div className="start-grid">
            <section className="card" aria-label="Start a chat">
              <p className="hint" style={{ margin: 0 }}>
                Choose text or video chat, add your interests and press Start to talk to a stranger.
                The app is loading.
              </p>
            </section>
            <HouseRules />
          </div>
          <FeatureCards />
          <Faq />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
