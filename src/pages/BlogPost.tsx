import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { fetchBlogPost, fetchBlogPostByArticleSlug, getBlogPost } from '../api/blog';
import { readArticleBootstrap } from '../lib/articleBootstrap';
import BlogArticleView from './BlogArticleView';
import DataStatus from '../components/DataStatus';

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const staticDefinition = getBlogPost(slug);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: staticDefinition ? ['blog-post', staticDefinition.slug] : ['blog-generated-post', slug],
    queryFn: ({signal}) => staticDefinition ? fetchBlogPost(staticDefinition.slug, false, signal) : fetchBlogPostByArticleSlug(slug!, signal),
    enabled: !!slug,
    initialData: () => readArticleBootstrap(slug),
    staleTime: 1000 * 60 * 60 * 24,
  });
  const definition = staticDefinition || getBlogPost(data?.slug);

  if (!definition && isLoading) {
    return <div className="container mx-auto px-4 md:px-10 py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" /></div>;
  }

  if (error && (error as any).status !== 404 && !data) return <div className="container mx-auto px-4 py-16"><DataStatus label="Article" error retry={() => void refetch()}/><Link to="/blog" className="text-primary underline">Back to blog</Link></div>;
  if (!definition || error && !data) {
    return <div className="container mx-auto px-4 md:px-10 py-16 text-center"><h1 className="text-3xl font-black mb-3">Blog post not found</h1><Link to="/blog" className="text-primary font-bold hover:underline">Back to blog</Link></div>;
  }

  const post = data || { ...definition, updatedAt: '', items: [] };
  return <BlogArticleView post={post} definition={definition}/>;
}
