import { XMLParser } from "fast-xml-parser";

export default async function handler(req: any, res: any) {
  try {
    const { q, c, f, p } = req.query;
    const url = new URL("https://nyaa.si/?page=rss");
    if (q) url.searchParams.append("q", q);
    if (c) url.searchParams.append("c", c);
    if (f) url.searchParams.append("f", f);
    if (p) url.searchParams.append("p", p);

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
      }
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch from Nyaa' });
    }

    const xmlData = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });
    let result = parser.parse(xmlData);
    
    const items = result.rss?.channel?.item || [];
    const formattedItems = (Array.isArray(items) ? items : [items]).map((item) => ({
      title: item.title,
      link: item.link,
      guid: item.guid,
      pubDate: item.pubDate,
      seeders: item["nyaa:seeders"],
      leechers: item["nyaa:leechers"],
      downloads: item["nyaa:downloads"],
      infoHash: item["nyaa:infoHash"],
      categoryId: item["nyaa:categoryId"],
      category: item["nyaa:category"],
      size: item["nyaa:size"],
      comments: item["nyaa:comments"],
      trusted: item["nyaa:trusted"],
      remake: item["nyaa:remake"],
    }));

    res.json(formattedItems);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
