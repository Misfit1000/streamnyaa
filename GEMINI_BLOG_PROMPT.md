# StreamNyaa Gemini Blog Prompt

This is the prompt shape used by `api/blog.ts`. The JSON blocks are filled at runtime with the selected topic, anime facts, related titles, and the current time.

```text
Write a factual, human-sounding anime blog article for StreamNyaa.

Article topic:
{
  "title": "<blog definition title>",
  "category": "<blog category>",
  "description": "<blog description>",
  "articleAngle": "<blog angle>",
  "readerGoal": "<reader promise>",
  "requiredWritingBrief": "<topic-specific writing brief>",
  "currentTimeIso": "<current ISO datetime>",
  "headlineFreshnessRule": "Use headline-based news only when selectedTopic.publishedAt is within the last 48 hours. Older headlines are not allowed.",
  "selectedTopic": {
    "type": "<topic type>",
    "title": "<exact article headline>",
    "animeTitle": "<anime title>",
    "animeId": "<AniList id>",
    "malId": "<MAL id>",
    "image": "<cover image>",
    "summary": "<fact-safe topic summary>",
    "confidence": "headline or trend",
    "reason": "<why this topic was selected>",
    "evidence": ["<fact strings>"],
    "publishedAt": "<fresh headline time when available>",
    "ageHours": "<headline age when available>",
    "headlines": ["<supporting fresh headlines when available>"]
  }
}

Selected anime facts you may use:
[
  {
    "rank": 1,
    "title": "<anime title>",
    "audienceScoreOutOf100": "<score>",
    "format": "<TV/Movie/ONA/etc>",
    "status": "<Releasing/Not Yet Released/etc>",
    "episodes": "<episode count>",
    "currentEpisode": "<current episode when available>",
    "nextEpisode": "<next episode when available>",
    "airingAtIso": "<airing time when available>",
    "genres": ["<genres>"],
    "studios": ["<studios>"],
    "cast": ["<character - VA: actor>"],
    "season": "<season year>",
    "popularityCount": "<popularity>",
    "currentTrendSignal": "<trend signal>",
    "description": "<synopsis>",
    "newsHeadlines": [
      { "title": "<headline>", "date": "<date>", "excerpt": "<excerpt>" }
    ]
  }
]

Other current anime context, for light comparison only:
[
  {
    "title": "<anime title>",
    "audienceScoreOutOf100": "<score>",
    "currentTrendSignal": "<trend signal>",
    "popularityCount": "<popularity>",
    "genres": ["<genres>"]
  }
]

Rules:
- Use only the facts above. Do not invent announcements, staff, release dates, platform availability, awards, trailers, rumors, or production details.
- Treat the supplied facts as a fact-checking boundary. Every specific claim must be supported by selectedTopic, selected anime facts, or listed newsHeadlines.
- Write with a magazine-style editorial rhythm: a strong lede, a clear nut graf explaining why the topic matters, concrete context, a fair caveat, and a useful close.
- Write about exactly one strongest topic: selectedTopic. Do not turn the article into a general list of many anime.
- The article must be about selectedTopic.animeTitle and selectedTopic.title. Do not switch to another anime, even if another anime appears in the facts list.
- Use the selected anime facts as the main body source. Other current anime context may be used only for one short comparison sentence, not as the subject.
- If selectedTopic.confidence is "headline", the headline must be fresh: selectedTopic.publishedAt must be within the last 48 hours. Do not use old headlines as current news.
- Set "headline" exactly to selectedTopic.title. Do not rewrite it, shorten it, translate it, or make a different headline.
- The heroCallout, excerpt, paragraphs, sections, takeaways, and FAQ must clearly match selectedTopic.animeTitle.
- Make this article clearly different from StreamNyaa's guide blogs: it should read like a focused current news/editorial story, not a schedule guide, ranking page, or generic recommendation list.
- Ignore broad industry release roundups if they are not directly about the selected anime. Do not write an article from generic headlines like North American releases, DVD/Blu-ray lists, manga release calendars, or weekly retail roundups.
- If selectedTopic.confidence is "headline", write one focused news article about that selected topic and explain only what the headline/facts support.
- If selectedTopic.confidence is "trend", write one focused trend-analysis article and do not present it as confirmed news.
- Match the selected topic type:
  - delayed-or-paused-airing: explain the verified airing/update context without adding unlisted causes.
  - upcoming-popular-adaptation-confirmed: explain the confirmed upcoming anime/adaptation angle. Include studio and cast only when supplied in selected anime facts or newsHeadlines.
  - why-anime-is-doing-poorly: give a fair critical analysis of weak reception using score/popularity/status/genre facts. Do not insult fans, creators, or studios.
  - new-season-trailer-cast-update: explain the announcement or preview angle only if the headline supports it.
  - viral-episode-or-ranking: explain the episode/ranking/buzz angle only if the headline supports it.
  - popular-anime-with-mixed-reception: explain the gap between popularity and weaker score/reception signals.
  - anime-trending-up-now or why-this-anime-is-doing-well: explain current momentum, score, genre, studio, and episode context.
- Follow requiredWritingBrief closely so each article type has a different structure and angle.
- Only mention delays, halted airing, production issues, viral episodes, trailers, sequels, or announcements when the selected topic or newsHeadlines explicitly support that claim.
- Do not mention APIs, AI, automation, AniList, Jikan, sources, scraping, or generated content.
- Keep it natural and editorial.
- Write like a careful anime editor: explain what happened or what the trend signal shows, why it matters, why a fan should care, what viewers should watch for next, and what remains uncertain.
- Include useful concrete context where available: score, popularity, trend signal, genre, studio, status, episode count, next episode, season, headline age, and cast.
- Use the anime description for interpretation when useful, but do not retell the whole synopsis. Pull one or two specific premise details into the analysis.
- Make every paragraph do a different job. Do not write five versions of "this anime is getting attention."
- Use transitions that feel human: "That matters because", "The more interesting part", "The risk", "For viewers", "The caveat".
- Use the exact meaning of each number: audienceScoreOutOf100 is the 0-100 score, currentTrendSignal is a trend/momentum signal, and popularityCount is audience interest. Never call currentTrendSignal an audience score.
- If the topic is trend-based, avoid claiming real-world virality as fact unless the selected topic type or headline explicitly says viral, ranking, reaction, record, or buzz.
- Never write meta-process phrases like "this topic was picked", "selected topic", "strongest visible signals", "available facts", or "current topic is tied to".
- Do not repeat the same sentence pattern across paragraphs. Avoid filler such as "worth paying attention to", "current signals", "quick factual look", "stands out", "momentum", or "on viewers' radar" more than once.
- Avoid bland phrases like "must-watch", "making waves", "only time will tell", "fans are excited", "solid entry", "worth checking out", unless the surrounding facts make the phrase meaningful.
- Do not pad with generic anime commentary. Specific facts, clear reasoning, and useful caveats are more important than length.
- Avoid piracy language and avoid telling users where to watch copyrighted content.
- Make the writing useful for Google search: clear headings, direct wording, helpful context, and natural keywords around the selected anime/topic.
- Keep every sentence fact-safe. If a fact is missing, skip it.
- The headline, excerpt, heroCallout, paragraphs, sections, takeaways, and FAQ must all stay on the same selected topic.
- The article should feel satisfying to read even if the user already knows the headline.
- Return JSON only. No markdown, no code fences.
- Keep the full JSON concise enough to complete in one response.

JSON shape:
{
  "seoTitle": "max 70 chars, include StreamNyaa",
  "metaDescription": "max 155 chars",
  "headline": "exactly selectedTopic.title",
  "excerpt": "2 sentence summary with a clear reason to read",
  "heroCallout": "one sharp sentence focused on the main insight",
  "paragraphs": ["exactly 6 paragraphs, 65-105 words each; paragraph 1 is the lede, paragraph 2 is why it matters, paragraph 3 is evidence/context, paragraph 4 is viewer impact, paragraph 5 is caveat, paragraph 6 is what to watch next"],
  "sections": [{"heading": "specific heading, not generic", "body": "110-170 words with concrete context"}],
  "takeaways": [{"label": "short label", "value": "specific value", "detail": "useful detail"}],
  "faq": [{"question": "natural reader question", "answer": "direct answer with facts and caveat"}]
}
```

Topic-specific writing briefs currently used:

- `delayed-or-paused-airing`: News explainer: lead with the confirmed change, explain what viewers can safely know, separate unknown causes from verified facts, and close with what to watch next.
- `upcoming-popular-adaptation-confirmed`: Upcoming adaptation report: make it feel like a preview article. Cover the premise, confirmed anime status, studio, cast if supplied, audience interest, why the adaptation could matter, and what remains unknown. Do not invent missing cast or staff.
- `why-anime-is-doing-poorly`: Critical reception analysis: make it fair but sharp. Explain the gap between visibility and weak response, possible viewer friction points supported by premise/genre/status/score facts, and what could still improve. Avoid dunking or unsupported claims.
- `viral-episode-or-ranking`: Buzz analysis: make it read like a timely reaction piece. Explain the episode/ranking/reaction hook, why it can spread, what context matters, and whether the attention looks durable.
- `new-season-trailer-cast-update`: Announcement explainer: make it read like a clean news analysis. Focus on verified trailer/cast/staff/premiere details only when supplied, why fans may care, and what details are still missing.
- `popular-anime-with-mixed-reception`: Mixed reception analysis: make it feel balanced and specific. Compare strong visibility against weaker or divided response, using score, popularity, premise, genre, and episode context carefully.
- `anime-trending-up-now`: Trend analysis: make it feel observant, not generic. Explain what kind of momentum is visible, what the title offers, what could be driving attention, and where caution is needed.
- `why-this-anime-is-doing-well`: Positive reception analysis: make it specific and useful. Explain what appears to be working, how score/genre/studio/episode context supports that, and why viewers may be sticking with it.
