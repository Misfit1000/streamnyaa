import { build } from 'esbuild';
import { loadEnv } from 'vite';

// The bundle contains public presentation code only. Vite's prefix filter keeps
// server credentials out; the API loads it only for HTML article responses.
const env=loadEnv('production',process.cwd(),'VITE_');
await build({entryPoints:['api/_shared/blogRenderer.tsx'],outfile:'api/_generated/blog-renderer.cjs',
  bundle:true,platform:'node',target:'node20',format:'cjs',jsx:'automatic',
  external:['react','react-dom','react-dom/server'],loader:{'.css':'empty','.svg':'dataurl'},
  define:{'import.meta.env':JSON.stringify({...env,SSR:true,DEV:false,PROD:true}),'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
