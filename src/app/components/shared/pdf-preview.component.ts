import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { BaseService } from '../../services/base.service';

@Component({
  selector: 'app-pdf-preview',
  template: `
    <div class="pdf-controls" *ngIf="document">
      <button type="button" [disabled]="loading || page <= 1" (click)="render(page - 1)">上一页</button>
      <span aria-live="polite">{{page}} / {{document.numPages}}</span>
      <button type="button" [disabled]="loading || page >= document.numPages" (click)="render(page + 1)">下一页</button>
    </div>
    <p *ngIf="loading" role="status">正在读取 PDF…</p>
    <p *ngIf="error" role="alert">{{error}}</p>
    <canvas #canvas [hidden]="!!error || !document" role="img" [attr.aria-label]="name + '，第 ' + page + ' 页'"></canvas>
  `,
  styles: [`
    :host { display: block; }
    .pdf-controls { position: sticky; top: 0; display: flex; justify-content: center; align-items: center; gap: 12px; padding: 8px; background: var(--panel); }
    button { padding: 6px 10px; color: inherit; background: var(--canvas); border: 1px solid var(--line); border-radius: 4px; }
    button:disabled { opacity: .55; }
    p { padding: 12px; }
    canvas { display: block; max-width: calc(100% - 24px); height: auto; margin: 12px auto; background: white; }
    canvas[hidden] { display: none; }
  `],
})
export class PdfPreviewComponent implements OnInit, OnDestroy {
  @Input() url: string;
  @Input() name: string;
  @ViewChild('canvas', { static: true }) private canvas: ElementRef<HTMLCanvasElement>;

  document: PDFDocumentProxy;
  page = 1;
  loading = true;
  error = '';
  private task: PDFDocumentLoadingTask;
  private rendering: RenderTask;
  private destroyed = false;

  async ngOnInit() {
    try {
      const pdf: typeof import('pdfjs-dist') = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (this.destroyed) return;
      const assets = new URL('assets/pdfjs/', window.document.baseURI).href;
      pdf.GlobalWorkerOptions.workerSrc = assets + 'pdf.worker.min.mjs';
      this.task = pdf.getDocument({
        url: this.url,
        httpHeaders: BaseService.token ? { Token: BaseService.token } : {},
        cMapUrl: assets + 'cmaps/',
        standardFontDataUrl: assets + 'standard_fonts/',
        wasmUrl: assets + 'wasm/',
      });
      this.document = await this.task.promise;
      if (!this.destroyed) await this.render(1);
    } catch {
      if (!this.destroyed) {
        this.error = '无法读取 PDF，可下载原文件。';
        this.loading = false;
      }
    }
  }

  async render(number: number) {
    this.loading = true;
    try {
      const page = await this.document.getPage(number);
      if (this.destroyed) return;
      const canvas = this.canvas.nativeElement;
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, 1500 / base.width, 2600 / base.height);
      const viewport = page.getViewport({ scale });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      this.rendering = page.render({ canvas, viewport });
      await this.rendering.promise;
      this.page = number;
    } catch {
      if (!this.destroyed) this.error = '无法渲染此页，可下载原文件。';
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.rendering?.cancel();
    void this.task?.destroy().catch(() => {});
  }
}
