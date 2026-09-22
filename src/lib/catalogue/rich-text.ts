import sanitizeHtml from 'sanitize-html';
import { Parser } from 'htmlparser2';

export function descriptionHtml(value: string) {
  const hasMarkup = /<\/?[a-z][^>]*>/i.test(value);
  const input = hasMarkup ? value : value.trim().split(/\r?\n\s*\r?\n/).map((paragraph) => `<p>${paragraph.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/\r?\n/g, '<br />')}</p>`).join('');
  if (!value.trim()) return '';
  return sanitizeHtml(input, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'a'],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['https', 'mailto'],
    allowProtocolRelative: false,
  });
}

export function descriptionText(value: string) {
  let text = '';
  const blocks = new Set(['p', 'br', 'li', 'ul', 'ol', 'blockquote']);
  const parser = new Parser({
    ontext(content) { text += content; },
    onopentag(name) { if (blocks.has(name)) text += ' '; },
    onclosetag(name) { if (blocks.has(name)) text += ' '; },
  });
  parser.end(descriptionHtml(value));
  return text.replace(/\s+/g, ' ').trim();
}