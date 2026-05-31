type SeoProps = {
  title: string;
  description: string;
  canonicalPath?: string;
  image?: string;
  robots?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

export default function SeoDesktop(_props: SeoProps) {
  return null;
}
