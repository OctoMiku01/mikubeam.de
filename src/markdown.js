// A small, safe Markdown renderer for GitHub release notes. All HTML in the input is escaped first;
// only headings, lists, paragraphs, code blocks, bold, italics, inline code and links are created.

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Only http(s) links; everything else is shown as plain text.
const safeHref = (url) => (/^https?:\/\//i.test(url) ? url : null);

function inline(text) {
  // Pull out inline code first so nothing inside it is formatted.
  const codes = [];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  html = html
    // [text](url)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
      const href = safeHref(url.replace(/&amp;/g, "&"));
      return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    })
    // Bare URLs (not already inside a link)
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+?)([.,;:!?]*)(?=$|[\s<)])/g, (match, before, url, trailing) =>
      `${before}<a href="${url}" target="_blank" rel="noopener noreferrer">${url.replace(/^https?:\/\/(www\.)?/, "")}</a>${trailing}`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, "$1<em>$2</em>");
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

export function renderMarkdown(markdown, { maxLength = 6000 } = {}) {
  let source = String(markdown ?? "").replace(/\r\n?/g, "\n").trim();
  if (!source) return "";
  if (source.length > maxLength) source = `${source.slice(0, maxLength).replace(/\s+\S*$/, "")} …`;

  const out = [];
  let list = null; // "ul" | "ol" while inside a list
  let paragraph = [];
  const closeParagraph = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      closeParagraph();
      closeList();
      const code = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      closeParagraph();
      closeList();
      // Release notes live inside a card, so headings start small.
      const level = Math.min(6, heading[1].length + 2);
      out.push(`<h${level}>${inline(heading[2].replace(/\s*#+\s*$/, ""))}</h${level}>`);
      continue;
    }
    const item = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/);
    if (item) {
      closeParagraph();
      const type = item[1] ? "ul" : "ol";
      if (list !== type) {
        closeList();
        out.push(`<${type}>`);
        list = type;
      }
      out.push(`<li>${inline(item[3])}</li>`);
      continue;
    }
    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      closeParagraph();
      closeList();
      out.push("<hr>");
      continue;
    }
    // A plain line right after a list item continues that item.
    if (list && /^\s{2,}\S/.test(line)) {
      out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ` ${inline(line.trim())}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line.trim());
  }
  closeParagraph();
  closeList();
  return out.join("\n");
}
