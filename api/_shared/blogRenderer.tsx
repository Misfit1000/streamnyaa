import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../src/context/AuthContext';
import Layout from '../../src/components/Layout';
import BlogArticleView, { articlePresentation } from '../../src/pages/BlogArticleView';
import { getBlogPost, type BlogPostData } from '../../src/api/blogShared';

export function renderArticle(post: BlogPostData, path: string) {
  const definition = getBlogPost(post.slug);
  if (!definition) throw Error('Unsupported article definition.');
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  try {
    const body = renderToString(<QueryClientProvider client={client}><AuthProvider><StaticRouter location={path}>
      <Routes><Route element={<Layout/>}><Route path="/blog/:slug" element={<BlogArticleView post={post} definition={definition}/>}/></Route></Routes>
    </StaticRouter></AuthProvider></QueryClientProvider>);
    const {seoTitle,seoDescription,canonicalPath,image,jsonLd} = articlePresentation(post,definition);
    return {body,title:seoTitle,description:seoDescription,canonicalPath,image,jsonLd};
  } finally { client.clear(); }
}
