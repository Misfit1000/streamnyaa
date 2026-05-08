// api/stream-sources.ts
// ... keep imports and keys the same ...

const GOGO_BASE_URL = 'https://anitaku.to'; // If this fails, try 'https://gogoanime3.co'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ... keep CORS headers ...

  try {
    const response = await axios.get(`${GOGO_BASE_URL}/${id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': GOGO_BASE_URL,
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    
    // TRY MULTIPLE SELECTORS (Gogoanime often rotates these)
    let iframeUrl = 
      $('div.anime_muti_link > ul > li.vidcdn > a').attr('data-video') || 
      $('iframe').attr('src') || 
      $('div.play-video > iframe').attr('src');
    
    if (!iframeUrl) {
      // Log the HTML to Vercel logs so you can see what the page looks like
      console.error("HTML Structure changed. Could not find iframe.");
      throw new Error("Video player iframe not found.");
    }

    // Ensure protocol
    if (iframeUrl.startsWith('//')) iframeUrl = `https:${iframeUrl}`;

    // ... continue with the rest of your decryption logic ...