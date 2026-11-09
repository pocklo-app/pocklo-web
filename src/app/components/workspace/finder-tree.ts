import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import type { Entry, Workspace } from './workspace.component';

interface MoveSelection {
  items: Entry[];
  source: string;
}

export const FINDER_DRAG_TYPE = 'application/x-pocklo-finder';

@Injectable()
export class FinderTree {
  readonly changed = new Subject<void>();
  drag?: MoveSelection & { windowId: number };
  dropTarget?: { id: string; name: string; row: boolean; windowId: number };
  clipboard?: MoveSelection & { showBar: boolean };
  moving = false;

  private cache = new Map<string, { data: Workspace; time: number }>();
  private requests = new Map<string, Promise<Workspace>>();

  private key(scope: string, id: string) { return scope + ':' + id; }

  cached(scope: string, id: string) { return this.cache.get(this.key(scope, id)); }

  fetch(scope: string, id: string, read: () => Promise<Workspace>) {
    const key = this.key(scope, id);
    const existing = this.requests.get(key);
    if (existing) return existing;
    const request = read();
    this.requests.set(key, request);
    void request.then(data => {
      if (this.requests.get(key) !== request) return;
      this.requests.delete(key);
      if (!data.resource.folder) return;
      const listing = { data, time: Date.now() };
      this.cache.set(key, listing);
      this.cache.set(this.key(scope, data.resource.id), listing);
    }, () => {
      if (this.requests.get(key) === request) this.requests.delete(key);
    });
    return request;
  }

  forget(scope: string, id: string) { this.cache.delete(this.key(scope, id)); }

  clearClipboardItems(ids: string[]) {
    if (!this.clipboard) return;
    const items = this.clipboard.items.filter(item => !ids.includes(item.id));
    this.clipboard = items.length ? { ...this.clipboard, items } : undefined;
  }

  invalidate() {
    this.cache.clear();
    this.requests.clear();
    this.changed.next();
  }
}
