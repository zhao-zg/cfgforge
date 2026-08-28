/**
 * SearchService — editor-core wrapper for value/SearchService.
 *
 * Delegates to @cfgforge/value's SearchService.search(), passing the
 * EditorService's current CfgValue snapshot.
 *
 * Java source: EditorServer.handleSearch (lines 159-167).
 */

import { SearchService as ValueSearchService } from '@cfgforge/value';
import type { SearchResult, SearchResultItem, SearchResultCode } from '@cfgforge/value';
import type { EditorService } from './EditorService.js';

// Re-export types for convenience
export type { SearchResult, SearchResultItem, SearchResultCode };

export class SearchService {
  static search(editor: EditorService, q: string, max: number): SearchResult {
    return ValueSearchService.search(editor.cfgValue(), q, max);
  }
}
