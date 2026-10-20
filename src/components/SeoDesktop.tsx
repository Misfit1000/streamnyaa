type SeoProps = {
  title: string;
  description: string;
  canonicalPath?: string;
  image?: string;
  robots?: string;
  type?: 'website' | 'article';
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

export default function SeoDesktop(_props: SeoProps) {
  return null;
}
