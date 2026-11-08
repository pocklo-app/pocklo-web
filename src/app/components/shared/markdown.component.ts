import { Component, ElementRef, Input, OnChanges } from "@angular/core";
import { marked, Renderer } from "marked";
import Prism from "prismjs";

import "prismjs/components/prism-csharp";
import "prismjs/components/prism-css";

marked.setOptions({
  breaks: true,
  gfm: true,
});

@Component({
  selector: "markdown",
  template: `<article [class]="safePreview ? 'markdown-body' : 'markdown-shell'" [innerHTML]="rendered"></article>`,
})
export class MarkdownComponent implements OnChanges {
  @Input() data: string;
  @Input() safePreview = false;

  rendered = "";

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  ngOnChanges() {
    const markdown = this.data || "";
    if (this.safePreview) {
      const renderer = new Renderer();
      renderer.html = () => "";
      renderer.image = () => "";
      this.rendered = marked.parse(markdown, { renderer }) as string;
    } else {
      this.rendered = marked.parse(markdown) as string;
    }

    queueMicrotask(() => {
      Prism.highlightAllUnder(this.elementRef.nativeElement);
    });
  }
}
