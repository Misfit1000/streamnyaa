if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is missing in this Vercel environment.');
  process.exit(1);
}
if (process.env.GEMINI_API_KEY.length < 20) {
  console.error('GEMINI_API_KEY exists but looks too short.');
  process.exit(1);
}
console.log('GEMINI_API_KEY is configured for this Vercel environment.');
