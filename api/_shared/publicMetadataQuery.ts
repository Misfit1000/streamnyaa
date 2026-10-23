import { Kind, parse, print, valueFromASTUntyped, type SelectionSetNode, type DocumentNode } from 'graphql';
import { HttpInputError } from './boundedHttp.js';

const invalid = (message = 'Unsupported public metadata query.') => new HttpInputError(message, 400);
const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;

/** Read-only catalogue queries only. Limits apply after fragment expansion. */
export function publicMetadataQuery(body: any) {
  if (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 16_384) throw invalid();
  let document: DocumentNode;
  try { document = parse(body.query, { maxTokens: 4000 }); } catch { throw invalid('Invalid metadata query.'); }
  const operations = document.definitions.filter(node => node.kind === Kind.OPERATION_DEFINITION);
  if (operations.length !== 1 || operations[0].operation !== 'query'
    || document.definitions.some(node => node.kind !== Kind.OPERATION_DEFINITION && node.kind !== Kind.FRAGMENT_DEFINITION)) throw invalid();
  const operation = operations[0];
  if (body.operationName && body.operationName !== operation.name?.value) throw invalid();
  const variables = body.variables ?? {};
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) throw invalid();
  function checkValue(value: any, depth = 0): void {
    if (depth > 6 || typeof value === 'string' && value.length > 512 || typeof value === 'number' && !Number.isFinite(value)) throw invalid();
    if (Array.isArray(value)) { if (value.length > 256) throw invalid(); value.forEach(item => checkValue(item, depth + 1)); }
    else if (value && typeof value === 'object') { if (Object.keys(value).length > 50) throw invalid(); Object.values(value).forEach(item => checkValue(item, depth + 1)); }
  }
  checkValue(variables);
  const values = { ...variables };
  for (const variable of operation.variableDefinitions || []) {
    if (!(variable.variable.name.value in values) && variable.defaultValue) values[variable.variable.name.value] = valueFromASTUntyped(variable.defaultValue);
  }
  const fragments = new Map(document.definitions.filter(node => node.kind === Kind.FRAGMENT_DEFINITION).map(node => [node.name.value, node]));
  let fields = 0, aliases = 0, roots = 0;
  const walk = (set: SelectionSetNode, depth: number, stack: Set<string>) => {
    if (depth > 12) throw invalid('Metadata query is too deep.');
    for (const node of set.selections) {
      if (node.kind === Kind.FRAGMENT_SPREAD) {
        const fragment = fragments.get(node.name.value);
        if (!fragment || stack.has(node.name.value)) throw invalid();
        walk(fragment.selectionSet, depth, new Set([...stack, node.name.value]));
      } else if (node.kind === Kind.INLINE_FRAGMENT) walk(node.selectionSet, depth, stack);
      else {
        if (++fields > 500 || node.alias && ++aliases > 8) throw invalid('Metadata query is too large.');
        if (depth === 1 && (++roots > 2 || !['Page', 'Media', 'GenreCollection'].includes(node.name.value))) throw invalid();
        if (node.name.value.startsWith('__')) throw invalid();
        for (const argument of node.arguments || []) {
          const value = valueFromASTUntyped(argument.value, values);
          checkValue(value);
          if (['perPage', 'page'].includes(argument.name.value) && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > (argument.name.value === 'perPage' ? 50 : 1000))) throw invalid();
        }
        if (node.selectionSet) walk(node.selectionSet, depth + 1, stack);
      }
    }
  };
  walk(operation.selectionSet, 1, new Set());
  // Unknown envelope properties and key ordering cannot split identical cache entries.
  const declared = new Set((operation.variableDefinitions || []).map(node => node.variable.name.value));
  return { query: print(document), variables: stable(Object.fromEntries(Object.entries(variables).filter(([key]) => declared.has(key)))), ...(operation.name ? { operationName: operation.name.value } : {}) };
}

export function publicProviderPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096 || !/^\/[a-z0-9/_?=&.,:%+\-[\]]*$/i.test(value)
    || value.startsWith('//') || /\.\.|%2e|%2f|%5c/i.test(value.split('?')[0]) || /%00/i.test(value)) throw invalid('Invalid provider path.');
  return value;
}

export function publicTmdbPath(value: unknown) {
  const path = publicProviderPath(value);
  if (!/^\/(?:search\/(?:tv|movie|multi)|(?:tv|movie)\/[1-9]\d*(?:\/(?:images|external_ids))?|find\/[a-z0-9_]+)(?:\?|$)/i.test(path)) throw invalid('Unsupported public TMDB path.');
  const url = new URL(path, 'https://api.themoviedb.org');
  url.searchParams.delete('api_key');
  for (const [key, value] of url.searchParams) {
    if (!['query','language','page','year','first_air_date_year','include_adult','external_source','include_image_language','append_to_response'].includes(key)
      || value.length > 512 || url.searchParams.getAll(key).length !== 1) throw invalid('Unsupported TMDB query parameter.');
    // A read token can expose account state through appended responses too.
    if (key === 'append_to_response' && value.split(',').some(part => !['images','external_ids','videos'].includes(part))) throw invalid('Only public TMDB enrichment is allowed.');
    if (key === 'page' && (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > 500)) throw invalid();
  }
  url.searchParams.sort();
  return url.pathname + url.search;
}
