import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild } from '@angular/core';
import { FinderTree } from './finder-tree';

export interface FinderWindowLocation {
  resource: string;
  share: string;
}

type Snap = 'tile' | 'max';
type WindowRect = { x: number; y: number; width: number; height: number };

interface FinderWindow {
  id: number;
  layer: number;
  start?: FinderWindowLocation;
  floating?: WindowRect;
  snap?: Snap;
  rect?: WindowRect;
}

interface WindowDrag {
  window: FinderWindow;
  pointer: number;
  clientX: number;
  clientY: number;
  titleOffset: number;
  widthRatio: number;
  origin: WindowRect;
  position?: WindowRect;
}

@Component({
  template: `
    <div class="desktop" [class.stacked]="windows.length > 1" [class.narrow]="!canSplit" [class.dragging]="drag?.position">
      <div #surface class="surface">
        <section *ngFor="let window of windows; trackBy: trackWindow" class="window" [class.foreground]="active === window.id" [class.tiled]="window.snap && window.rect"
          [style.left.px]="window.rect?.x" [style.top.px]="window.rect?.y"
          [style.width.px]="window.rect?.width" [style.height.px]="window.rect?.height" [style.z-index]="window.layer"
          (pointerdown)="pointerDown($event, window)" (focusin)="activate(window.id)" (dblclick)="toggleFromTitle($event, window)"
          (lostpointercapture)="finishDrag($event, true)">
          <app-workspace [class.floating-window]="windows.length > 1" [class.draggable-window]="window.rect" [windowId]="window.id" [windowStart]="window.start" [foreground]="active === window.id"
            [canOpenWindow]="windows.length < 4" [canCloseWindow]="window.id !== 0"
            (newWindow)="open($event)" (closeWindow)="close(window.id)"></app-workspace>
        </section>
        <div *ngIf="snapPreview as guide" class="snap-guide" aria-hidden="true"
          [style.left.px]="guide.x" [style.top.px]="guide.y" [style.width.px]="guide.width" [style.height.px]="guide.height"></div>
      </div>
    </div>
  `,
  providers: [FinderTree],
  styleUrls: ['./workspace-desktop.component.less'],
})
export class WorkspaceDesktopComponent implements AfterViewInit, OnDestroy {
  @ViewChild('surface', { static: true }) private surface: ElementRef<HTMLElement>;
  windows: FinderWindow[] = [{ id: 0, layer: 1 }];
  active = 0;
  drag?: WindowDrag;
  snapPreview?: WindowRect;
  private pendingSnap?: { mode: Snap; slot: number };
  private sequence = 0;
  private topLayer = 1;
  private width = 0;
  private height = 0;
  private resizeObserver: ResizeObserver;

  get canSplit() { return this.width >= 840; }

  ngAfterViewInit() {
    this.resizeObserver = new ResizeObserver(([entry]) => {
      this.width = entry.contentRect.width;
      this.height = entry.contentRect.height;
      this.updateRects();
    });
    this.resizeObserver.observe(this.surface.nativeElement);
  }

  ngOnDestroy() { this.resizeObserver.disconnect(); }

  trackWindow(_index: number, window: FinderWindow) { return window.id; }

  activate(id: number) {
    if (this.active === id) return;
    const window = this.windows.find(item => item.id === id);
    if (!window) return;
    window.layer = ++this.topLayer;
    this.active = id;
  }

  open(start: FinderWindowLocation) {
    if (this.windows.length >= 4) return;
    const id = ++this.sequence;
    this.windows = [...this.windows, { id, start, layer: ++this.topLayer }];
    this.active = id;
    this.tileWindows();
  }

  close(id: number) {
    if (id === 0) return;
    this.windows = this.windows.filter(window => window.id !== id);
    if (this.active === id) this.activate(this.windows.reduce((top, window) => window.layer > top.layer ? window : top).id);
    this.tileWindows();
  }

  private tileWindows() {
    for (const window of this.windows) window.snap = 'tile';
    this.updateRects();
  }

  private defaultRect(window: FinderWindow): WindowRect {
    const offset = (window.id % 4) * 24;
    return this.fit({
      x: this.width * .045 + offset, y: this.height * .055 + offset,
      width: this.width * .8, height: this.height * .8,
    });
  }

  private fit(rect: WindowRect): WindowRect {
    const width = Math.min(this.width, rect.width);
    const height = Math.min(this.height, rect.height);
    return {
      x: Math.max(Math.min(0, 260 - width), Math.min(rect.x, this.width - Math.min(width, 400))),
      y: Math.max(0, Math.min(rect.y, this.height - Math.min(height, 125))),
      width, height,
    };
  }

  private snappedRect(snap: Snap, slot: number): WindowRect {
    const gap = 8;
    const fullHeight = this.height - gap * 2;
    if (snap === 'max') return { x: gap, y: gap, width: this.width - gap * 2, height: fullHeight };
    const halfWidth = (this.width - gap * 3) / 2;
    const halfHeight = (this.height - gap * 3) / 2;
    const three = this.windows.length === 3;
    const grid = this.windows.length === 4;
    const right = three ? slot > 0 : slot % 2 === 1;
    const bottom = slot >= 2;
    return {
      x: right ? halfWidth + gap * 2 : gap,
      y: bottom ? halfHeight + gap * 2 : gap,
      width: halfWidth, height: grid || (three && right) ? halfHeight : fullHeight,
    };
  }

  private updateRects() {
    for (const [slot, window] of this.windows.entries()) {
      if (this.windows.length === 1 || !this.canSplit) window.rect = undefined;
      else if (this.drag?.window === window && this.drag.position) window.rect = this.fit(this.drag.position);
      else window.rect = window.snap ? this.snappedRect(window.snap, slot) : this.fit(window.floating ?? this.defaultRect(window));
    }
  }

  private snapAt(x: number, y: number) {
    if (y <= 22 && Math.abs(x - this.width / 2) <= 130) return { mode: 'max' as const, slot: 0 };
    const atEdge = x <= 32 || x >= this.width - 32 || y <= 24 || y >= this.height - 24;
    if (!atEdge) return undefined;
    const slot = this.windows.findIndex((_, index) => {
      const rect = this.snappedRect('tile', index);
      return x >= rect.x - 24 && x <= rect.x + rect.width + 24 && y >= rect.y - 24 && y <= rect.y + rect.height + 24;
    });
    return slot < 0 ? undefined : { mode: 'tile' as const, slot };
  }

  private titleTarget(event: MouseEvent) {
    const target = event.target as Element;
    return target.closest('[data-window-drag]') && !target.closest('button, a, input, select, textarea, label');
  }

  pointerDown(event: PointerEvent, window: FinderWindow) {
    this.activate(window.id);
    if (this.drag || !window.rect || event.button !== 0 || !event.isPrimary || !this.titleTarget(event)) return;
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.drag = {
      window, pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      titleOffset: event.clientY - bounds.top, widthRatio: (event.clientX - bounds.left) / bounds.width,
      origin: window.rect,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  @HostListener('window:pointermove', ['$event'])
  pointerMove(event: PointerEvent) {
    const drag = this.drag;
    if (!drag || drag.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.clientX;
    const dy = event.clientY - drag.clientY;
    if (!drag.position && Math.hypot(dx, dy) < 5) return;
    const bounds = this.surface.nativeElement.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (drag.window.snap) {
      const floating = this.fit(drag.window.floating ?? this.defaultRect(drag.window));
      drag.position = { ...floating, x: x - floating.width * drag.widthRatio, y: y - drag.titleOffset };
    } else {
      drag.position = { ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy };
    }
    this.pendingSnap = this.snapAt(x, y);
    this.snapPreview = this.pendingSnap ? this.snappedRect(this.pendingSnap.mode, this.pendingSnap.slot) : undefined;
    this.updateRects();
  }

  @HostListener('window:pointerup', ['$event'])
  finishDrag(event: PointerEvent, cancelled = false) {
    const drag = this.drag;
    if (!drag || drag.pointer !== event.pointerId) return;
    const snap = this.pendingSnap;
    this.drag = undefined;
    this.pendingSnap = undefined;
    this.snapPreview = undefined;
    if (!cancelled && drag.position && this.canSplit) {
      if (snap) {
        if (!drag.window.snap) drag.window.floating = drag.origin;
        if (snap.mode === 'max') drag.window.snap = 'max';
        else {
          const previous = this.windows.indexOf(drag.window);
          [this.windows[previous], this.windows[snap.slot]] = [this.windows[snap.slot], this.windows[previous]];
          this.tileWindows();
        }
      } else {
        drag.window.floating = this.fit(drag.position);
        drag.window.snap = undefined;
      }
    }
    this.updateRects();
  }

  @HostListener('window:pointercancel', ['$event'])
  cancelDrag(event: PointerEvent) { this.finishDrag(event, true); }

  toggleFromTitle(event: MouseEvent, window: FinderWindow) {
    if (!window.rect || !this.titleTarget(event)) return;
    this.activate(window.id);
    window.snap = window.snap === 'max' ? 'tile' : 'max';
    this.updateRects();
  }
}
