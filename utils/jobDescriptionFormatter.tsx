import React from 'react';

/**
 * Strips HTML tags and entities to return a clean, plain text preview snippet.
 */
export function getJobDescriptionSnippet(rawDesc?: string | null, maxChars = 140): string {
  if (!rawDesc || typeof rawDesc !== 'string') return 'No description provided.';

  let text = rawDesc
    // Remove scripts or style tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Replace <br> and <p> with spaces
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<\/li>/gi, ' ')
    .replace(/<li[^>]*>/gi, ' • ')
    // Strip remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/gi, "'")
    .replace(/&#039;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&bull;/gi, '•')
    // Remove decorative equal signs / dashes
    .replace(/[=_-]{5,}/g, ' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // If starts with "Vacancy Uploaded On", skip the upload preamble
  text = text.replace(/^Vacancy(?:\s+Uploaded\s+On)?\s*:[^•\n]+?(?:Uploaded By [^•\n]+)?\s*/i, '').trim();

  if (text.length <= maxChars) return text || 'No description provided.';
  return text.slice(0, maxChars).trim() + '...';
}

/**
 * Cleans and sanitizes raw HTML from API for safe and beautiful display across day and night themes.
 */
export function cleanJobDescriptionHtml(rawHtml?: string | null): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  let html = rawHtml
    // Remove inline color / background style overrides so theme is strictly respected
    .replace(/style="[^"]*?(?:color|background)[^"]*?"/gi, '')
    .replace(/style='[^']*?(?:color|background)[^']*?'/gi, '')
    // Remove deprecated <font> tags
    .replace(/<\/?font[^>]*>/gi, '')
    // Decode common entities that break rendering
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/gi, "'")
    .replace(/&#039;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&bull;/gi, '•')
    // Turn excessive separator lines into a clean styled hr
    .replace(/={5,}|-{5,}|_{5,}/g, '<hr class="my-3 border-gray-300 dark:border-white/10" />')
    // Ensure lists have proper spacing and theme text
    .replace(/<ul>/gi, '<ul class="list-disc pl-5 my-2 space-y-1.5 text-slate-800 dark:text-slate-200">')
    .replace(/<ol>/gi, '<ol class="list-decimal pl-5 my-2 space-y-1.5 text-slate-800 dark:text-slate-200">')
    .replace(/<li>/gi, '<li class="text-slate-800 dark:text-slate-200 leading-relaxed">')
    // Ensure bold headings have proper styling
    .replace(/<strong>/gi, '<strong class="font-bold text-slate-900 dark:text-white">')
    .replace(/<b>/gi, '<b class="font-bold text-slate-900 dark:text-white">');

  return html;
}

interface FormattedJobDescriptionProps {
  description?: string | null;
  className?: string;
  maxLines?: number;
}

/**
 * Component that formats and displays job descriptions seamlessly in both Day and Night modes,
 * handling raw HTML, markdown lists, metadata headers, and plain text.
 */
export const FormattedJobDescription: React.FC<FormattedJobDescriptionProps> = ({
  description,
  className = '',
  maxLines,
}) => {
  if (!description || !description.trim()) {
    return <p className={`geist-caption text-gray-500 dark:text-[#6b7280] ${className}`}>No detailed description provided.</p>;
  }

  const raw = description.trim();
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(raw);

  const styleProps: React.CSSProperties = maxLines
    ? {
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: maxLines,
        overflow: 'hidden',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      }
    : {
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      };

  if (hasHtmlTags) {
    const cleanedHtml = cleanJobDescriptionHtml(raw);
    return (
      <div
        className={`formatted-jd-content text-slate-800 dark:text-slate-200 leading-relaxed text-xs sm:text-sm space-y-2 ${className}`}
        style={styleProps}
        dangerouslySetInnerHTML={{ __html: cleanedHtml }}
      />
    );
  }

  // Format plain text or markdown with bullets
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  return (
    <div className={`text-slate-800 dark:text-slate-200 leading-relaxed text-xs sm:text-sm space-y-2 ${className}`} style={styleProps}>
      {lines.map((line, idx) => {
        if (/^[=_-]{5,}$/.test(line)) {
          return <hr key={idx} className="my-2.5 border-gray-300 dark:border-white/10" />;
        }
        if (/^[-*•·▪●]\s+/.test(line)) {
          const bulletText = line.replace(/^[-*•·▪●]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0 mt-0.5">•</span>
              <span className="text-slate-800 dark:text-slate-200">{bulletText}</span>
            </div>
          );
        }
        if (line.endsWith(':') || /^(responsibilities|requirements|qualifications|about the role|key skills|job summary):?$/i.test(line)) {
          return (
            <h4 key={idx} className="font-bold text-slate-900 dark:text-white mt-3 mb-1 text-xs sm:text-sm">
              {line}
            </h4>
          );
        }
        return <p key={idx} className="mb-1.5 last:mb-0 text-slate-800 dark:text-slate-200">{line}</p>;
      })}
    </div>
  );
};

export default FormattedJobDescription;
