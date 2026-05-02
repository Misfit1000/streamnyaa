import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import Seo from '../components/Seo';
import { Mail, ShieldCheck, Info, Scale, AlertTriangle } from 'lucide-react';

const UPDATED = 'May 1, 2026';

function PageShell({
  title,
  eyebrow,
  description,
  icon,
  children,
}: {
  title: string;
  eyebrow: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="container mx-auto px-4 md:px-10 py-12 md:py-16">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 text-primary text-sm font-bold uppercase tracking-wider mb-4">
          <span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">{icon}</span>
          {eyebrow}
        </div>
        <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4">{title}</h1>
        <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-3xl">{description}</p>
        <div className="mt-10 space-y-6 text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-[var(--glass)] border border-[var(--glass-border)] rounded-2xl p-6">
      <h2 className="text-xl font-black text-foreground mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function About() {
  return (
    <>
      <Seo
        title="About StreamNyaa"
        description="Learn what StreamNyaa is, how it works, and how it uses public anime metadata and third-party services."
        canonicalPath="/about"
      />
      <PageShell
        title="About StreamNyaa"
        eyebrow="About"
        icon={<Info className="w-5 h-5" />}
        description="StreamNyaa is an anime discovery interface built for browsing titles, checking release schedules, organizing a personal watch list, and searching public torrent metadata from a single place."
      >
        <InfoBlock title="What StreamNyaa Provides">
          <p>
            StreamNyaa helps users discover anime, follow airing schedules, view anime and manga metadata, and compare public search results from third-party indexes. The site focuses on clean navigation, searchable information, and useful title pages.
          </p>
          <p>
            The app does not host anime episodes, video files, torrent files, or copyrighted media on its own servers. External links and embedded players are provided by third-party services.
          </p>
        </InfoBlock>

        <InfoBlock title="Data Sources and External Services">
          <p>
            Anime details, artwork, schedules, relations, and recommendations may come from public metadata services such as AniList and Jikan. Torrent metadata is requested from public RSS results and normalized for display.
          </p>
          <p>
            Third-party services may have their own terms, privacy practices, and availability limits. StreamNyaa is not affiliated with AniList, Jikan, Nyaa.si, WebTor, or any anime publisher.
          </p>
        </InfoBlock>

        <InfoBlock title="Editorial and Policy Standards">
          <p>
            StreamNyaa is designed as a discovery and indexing tool. The site includes a privacy policy, terms of use, contact page, and disclaimer so visitors, search engines, and advertising reviewers can understand how the site operates.
          </p>
          <p>
            Copyright owners and rights holders can contact the site owner through the <Link to="/contact" className="text-primary hover:underline">contact page</Link> for questions or removal requests.
          </p>
        </InfoBlock>
      </PageShell>
    </>
  );
}

export function Contact() {
  return (
    <>
      <Seo
        title="Contact StreamNyaa"
        description="Contact StreamNyaa for site feedback, copyright concerns, policy questions, and general support."
        canonicalPath="/contact"
      />
      <PageShell
        title="Contact"
        eyebrow="Support"
        icon={<Mail className="w-5 h-5" />}
        description="Use this page for feedback, technical issues, copyright questions, advertising questions, and general site support."
      >
        <InfoBlock title="General Contact">
          <p>
            Email: <a href="mailto:support@streamnyaa.xyz" className="text-primary hover:underline">support@streamnyaa.xyz</a>
          </p>
          <p>
            Please include the page URL, a clear description of the issue, and any relevant screenshots or links when reporting a problem.
          </p>
        </InfoBlock>

        <InfoBlock title="Copyright and Removal Requests">
          <p>
            StreamNyaa does not host media files. If you believe a search result, metadata entry, or external reference creates a rights concern, send a detailed request with the affected URL and proof that you are authorized to act on behalf of the rights holder.
          </p>
        </InfoBlock>
      </PageShell>
    </>
  );
}

export function PrivacyPolicy() {
  return (
    <>
      <Seo
        title="Privacy Policy | StreamNyaa"
        description="Read how StreamNyaa handles local storage, analytics, advertising partners, third-party embeds, and external services."
        canonicalPath="/privacy-policy"
      />
      <PageShell
        title="Privacy Policy"
        eyebrow="Privacy"
        icon={<ShieldCheck className="w-5 h-5" />}
        description="This policy explains what information StreamNyaa uses, how browser storage works, and how third-party services may process data."
      >
        <p className="text-sm">Last updated: {UPDATED}</p>

        <InfoBlock title="Information Stored in Your Browser">
          <p>
            StreamNyaa stores preferences such as theme, list items, likes, and content mode in browser local storage. This data stays on your device unless your browser or extensions sync it elsewhere.
          </p>
        </InfoBlock>

        <InfoBlock title="Server Logs and Technical Data">
          <p>
            Hosting providers may collect standard technical logs such as IP address, request URL, browser type, device information, and timestamps for security, debugging, analytics, and abuse prevention.
          </p>
        </InfoBlock>

        <InfoBlock title="Third-Party Services">
          <p>
            StreamNyaa can request data from external APIs and can display embedded third-party players or links. These services may collect data according to their own privacy policies.
          </p>
        </InfoBlock>

        <InfoBlock title="Advertising and Cookies">
          <p>
            If advertising is enabled in the future, advertising partners such as Google may use cookies or similar technologies to show, measure, and personalize ads. Visitors may be able to control ad personalization through their Google account or browser settings.
          </p>
        </InfoBlock>

        <InfoBlock title="Contact">
          <p>
            For privacy questions, contact <a href="mailto:support@streamnyaa.xyz" className="text-primary hover:underline">support@streamnyaa.xyz</a>.
          </p>
        </InfoBlock>
      </PageShell>
    </>
  );
}

export function Terms() {
  return (
    <>
      <Seo
        title="Terms of Use | StreamNyaa"
        description="Read the terms that apply when using StreamNyaa and its anime discovery, metadata, and link search features."
        canonicalPath="/terms"
      />
      <PageShell
        title="Terms of Use"
        eyebrow="Terms"
        icon={<Scale className="w-5 h-5" />}
        description="By using StreamNyaa, you agree to use the site responsibly and follow applicable laws and third-party service terms."
      >
        <p className="text-sm">Last updated: {UPDATED}</p>

        <InfoBlock title="Use of the Site">
          <p>
            StreamNyaa is provided for anime discovery, metadata browsing, schedule tracking, and public index search. You are responsible for how you use any external links, third-party services, or magnet links.
          </p>
        </InfoBlock>

        <InfoBlock title="Third-Party Content">
          <p>
            StreamNyaa does not control external websites, APIs, embeds, or indexes. Availability, accuracy, and legality of third-party content are the responsibility of those third parties and the user.
          </p>
        </InfoBlock>

        <InfoBlock title="No Warranty">
          <p>
            The site is provided as-is. StreamNyaa does not guarantee uninterrupted access, error-free data, complete metadata, or playback availability.
          </p>
        </InfoBlock>

        <InfoBlock title="Policy Updates">
          <p>
            These terms may be updated as the site changes. Continued use of the site means you accept the latest version.
          </p>
        </InfoBlock>
      </PageShell>
    </>
  );
}

export function Disclaimer() {
  return (
    <>
      <Seo
        title="Disclaimer | StreamNyaa"
        description="Important information about third-party content, metadata sources, external links, and copyright concerns."
        canonicalPath="/disclaimer"
      />
      <PageShell
        title="Disclaimer"
        eyebrow="Important"
        icon={<AlertTriangle className="w-5 h-5" />}
        description="StreamNyaa is an independent discovery interface and is not an official source for anime publishers, streaming services, or torrent indexes."
      >
        <InfoBlock title="No Hosted Media">
          <p>
            StreamNyaa does not upload, store, host, or distribute anime episodes, movies, torrent files, or copyrighted video files. Search results, magnet links, metadata, and embedded playback options are provided through third-party services.
          </p>
        </InfoBlock>

        <InfoBlock title="Copyright">
          <p>
            Anime titles, images, trademarks, and related media belong to their respective owners. StreamNyaa does not claim ownership of third-party content or metadata.
          </p>
        </InfoBlock>

        <InfoBlock title="External Links">
          <p>
            External links may lead to websites or services that StreamNyaa does not control. Users should follow local laws, platform terms, and rights-holder requirements when using external resources.
          </p>
        </InfoBlock>

        <InfoBlock title="Removal Requests">
          <p>
            For copyright or policy concerns, contact <a href="mailto:support@streamnyaa.xyz" className="text-primary hover:underline">support@streamnyaa.xyz</a> with the affected URL and supporting details.
          </p>
        </InfoBlock>
      </PageShell>
    </>
  );
}
