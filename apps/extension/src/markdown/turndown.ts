import TurndownService from 'turndown';
// @ts-expect-error turndown-plugin-gfm ships no type declarations
import { gfm } from 'turndown-plugin-gfm';

export function createTurndownService(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    hr: '---',
    br: '\n',
    linkStyle: 'inlined',
    linkReferenceStyle: 'full',
  });
  service.use(gfm);
  return service;
}
