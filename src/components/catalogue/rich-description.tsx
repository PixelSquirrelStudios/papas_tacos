'use client';

import { useId, useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { descriptionHtml } from '@/lib/catalogue/rich-text';

export function RichDescription({ content, className = '', ...props }: Omit<ComponentProps<'div'>, 'children' | 'dangerouslySetInnerHTML' | 'content'> & { content: string }) {
  return <div {...props} className={`break-words [&_p+p]:mt-3 [&_p:empty]:min-h-4 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li+li]:mt-1 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-brand-yellow [&_blockquote]:pl-3 [&_a]:text-brand-yellow [&_a]:underline [&_strong]:font-bold [&_b]:font-bold ${className}`} dangerouslySetInnerHTML={{ __html: descriptionHtml(content) }} />;
}

export function ExpandableDescription({ description, name, className, previewLines = 6, equalHeight = false }: { description: string; name: string; className?: string; previewLines?: number; equalHeight?: boolean }) {
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const rectangles: DOMRect[] = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        rectangles.push(...Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0));
      }
      const lines: { top: number; bottom: number }[] = [];
      for (const rect of rectangles.sort((first, second) => first.top - second.top)) {
        const previous = lines.at(-1);
        if (previous && rect.top < previous.bottom) previous.bottom = Math.max(previous.bottom, rect.bottom);
        else lines.push({ top: rect.top, bottom: rect.bottom });
      }
      const top = element.getBoundingClientRect().top;
      const height = parseFloat(getComputedStyle(element).lineHeight) * previewLines;
      const hiddenLine = equalHeight ? lines.findIndex((line) => line.bottom - top > height) : lines.length > previewLines ? previewLines : -1;
      setPreviewHeight(hiddenLine > 0 ? Math.min(equalHeight ? height : Infinity, (lines[hiddenLine - 1].bottom + lines[hiddenLine].top) / 2 - top) : null);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [description, previewLines, equalHeight]);
  return <div className={className}>
    <div className="text-sm leading-relaxed" style={{ height: equalHeight && !expanded ? `${previewLines * 1.625}em` : undefined }}>
      <RichDescription ref={content} id={id} content={description} className="overflow-hidden text-sm leading-relaxed text-muted-foreground" style={{ maxHeight: expanded || previewHeight === null ? undefined : previewHeight }} />
    </div>
    {(equalHeight || previewHeight !== null) && <div className="mt-1 min-h-9">{previewHeight !== null && <button type="button" aria-expanded={expanded} aria-controls={id} aria-label={`${expanded ? 'Show less' : 'Show full description'} for ${name}`} onClick={() => setExpanded(!expanded)} className="flex min-h-9 items-center gap-1 text-xs font-semibold text-brand-yellow">{expanded ? 'Show Less' : 'Show More'}{expanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}</button>}</div>}
  </div>;
}