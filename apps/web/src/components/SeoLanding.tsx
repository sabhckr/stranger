import type { SeoPage } from '../seo/pages.js';
import { href } from '../lib/base.js';
import { Logo } from './Logo.js';
import { OnlinePill } from './OnlinePill.js';
import { HouseRules, SiteFooter } from './landing-content.js';

export interface SeoLandingProps {
  page: SeoPage;
  onlineCount: number;
  connection: string;
}

/** Keyword landing page. Pure (no hooks) so it is also rendered to static HTML at build time. */
export function SeoLanding({ page, onlineCount, connection }: SeoLandingProps) {
  return (
    <div className="page">
      <div className="container">
        <header className="site-header">
          <Logo />
          <OnlinePill count={onlineCount} connection={connection} />
        </header>
        <main className="landing">
          <nav aria-label="Breadcrumb" className="crumbs">
            <a href={href('/')} data-link>
              STRANGER
            </a>
            <span aria-hidden="true"> / </span>
            <span>{page.h1}</span>
          </nav>
          <section className="hero">
            <h1>{page.h1}</h1>
            <p className="lead">{page.intro}</p>
          </section>
          <div className="cta-row">
            <a className="btn btn-primary btn-lg" href={href('/?mode=text')} data-link>
              Start text chat
            </a>
            <a className="btn btn-lg" href={href('/?mode=video')} data-link>
              Start video chat
            </a>
            <span className="hint" style={{ margin: 0 }}>
              Free · no sign-up · 18+
            </span>
          </div>
          <div className="start-grid">
            <article className="card prose-card">
              {page.sections.map((s) => (
                <section key={s.h2}>
                  <h2>{s.h2}</h2>
                  {s.paragraphs.map((p) => (
                    <p key={p.slice(0, 40)}>{p}</p>
                  ))}
                  {s.bullets && (
                    <ul>
                      {s.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
              {page.faq && (
                <section className="faq" aria-label="Frequently asked questions">
                  <h2>Common questions</h2>
                  {page.faq.map(({ q, a }) => (
                    <details key={q}>
                      <summary>{q}</summary>
                      <p>{a}</p>
                    </details>
                  ))}
                </section>
              )}
            </article>
            <div>
              <HouseRules />
              <RelatedPages current={page.slug} />
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

export function RelatedPages({ current }: { current?: string }) {
  const links = [
    { slug: 'stranger-chat', label: 'Stranger chat' },
    { slug: 'stranger-talk', label: 'Stranger talk' },
    { slug: 'talk-to-strangers', label: 'Talk to strangers online' },
    { slug: 'random-video-chat', label: 'Random video chat' },
    { slug: 'omegle-alternative', label: 'Omegle alternative' },
  ].filter((l) => l.slug !== current);
  return (
    <nav className="card related" aria-labelledby="related-title" style={{ marginTop: 18 }}>
      <h2 id="related-title">Explore</h2>
      <ul>
        {links.map((l) => (
          <li key={l.slug}>
            <a href={href(`/${l.slug}`)} data-link>
              {l.label}
            </a>
          </li>
        ))}
        <li>
          <a href={href('/safety')} data-link>
            Safety guide
          </a>
        </li>
      </ul>
    </nav>
  );
}
