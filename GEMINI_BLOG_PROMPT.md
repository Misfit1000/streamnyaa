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
- Write like a careful anime editor: explain what happened or what the trend signal shows, why it matters, what viewers should watch for next, and what remains uncertain.
- Include useful concrete context where available: score, popularity, trend signal, genre, studio, status, episode count, next episode, season, headline age, and cast.
- Use the exact meaning of each number: audienceScoreOutOf100 is the 0-100 score, currentTrendSignal is a trend/momentum signal, and popularityCount is audience interest. Never call currentTrendSignal an audience score.
- If the topic is trend-based, avoid claiming real-world virality as fact unless the selected topic type or headline explicitly says viral, ranking, reaction, record, or buzz.
- Never write meta-process phrases like "this topic was picked", "selected topic", "strongest visible signals", "available facts", or "current topic is tied to".
- Do not repeat the same sentence pattern across paragraphs. Avoid filler such as "worth paying attention to", "current signals", or "quick factual look" more than once.
- Avoid piracy language and avoid telling users where to watch copyrighted content.
- Make the writing useful for Google search: clear headings, direct wording, helpful context, and natural keywords around the selected anime/topic.
- Keep every sentence fact-safe. If a fact is missing, skip it.
- The headline, excerpt, heroCallout, paragraphs, sections, takeaways, and FAQ must all stay on the same selected topic.
- Return JSON only. No markdown, no code fences.
- Keep the full JSON concise enough to complete in one response.

JSON shape:
{
  "seoTitle": "max 70 chars, include StreamNyaa",
  "metaDescription": "max 155 chars",
  "headline": "exactly selectedTopic.title",
  "excerpt": "2 sentence summary",
  "heroCallout": "one sentence focused on the top anime",
  "paragraphs": ["exactly 5 useful paragraphs, 55-90 words each"],
  "sections": [{"heading": "short heading", "body": "90-140 words"}],
  "takeaways": [{"label": "short label", "value": "short value", "detail": "short detail"}],
  "faq": [{"question": "question", "answer": "answer"}]
}
```

Topic-specific writing briefs currently used:

- `delayed-or-paused-airing`: News explainer: lead with what changed, explain what is confirmed, explain what remains unknown, then give practical viewer context.
- `upcoming-popular-adaptation-confirmed`: Upcoming adaptation report: focus on confirmed anime status, studio details, cast details if supplied, premise, popularity signal, and what to watch for next. Do not invent missing cast or staff.
- `why-anime-is-doing-poorly`: Critical reception analysis: explain why the anime may be underperforming using score, popularity, genre, premise, episode/status context, and fair caveats. Avoid dunking or unsupported claims.
- `viral-episode-or-ranking`: Buzz analysis: explain the episode/ranking/reaction hook, why it can spread, and what viewers should compare next.
- `new-season-trailer-cast-update`: Announcement explainer: focus on the verified announcement details, trailer/cast/staff/premiere context only when supplied, and why fans may care.
- `popular-anime-with-mixed-reception`: Mixed reception analysis: compare strong visibility against weaker or divided response, using score and popularity carefully.
- `anime-trending-up-now`: Trend analysis: explain why the title is gaining momentum without calling it confirmed news or real-world viral unless the headline supports that.
- `why-this-anime-is-doing-well`: Positive reception analysis: explain what is working using score, genre, studio, episode, and popularity context.
