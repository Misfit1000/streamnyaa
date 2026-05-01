const query = `
query($search: String, $page: Int) {
  Page(page: $page, perPage: 5) {
    media(type: ANIME, search: $search, sort: SEARCH_MATCH, genre: "Action", isAdult: false) {
      title { romaji }
      genres
      isAdult
    }
  }
}
`;
fetch('https://graphql.anilist.co', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, variables: { search: 'Naruto', page: 1 } })
}).then(r=>r.json()).then(d => console.dir(d, {depth: null}));
