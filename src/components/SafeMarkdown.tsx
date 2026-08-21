import React from "react";

interface SafeMarkdownProps {
  content: string;
}

export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ content }) => {
  if (!content) return null;

  // Split content by code block markers (```)
  // This yields alternating chunks: normal text and code blocks
  const parts = content.split(/```/g);

  return (
    <>
      {parts.map((part, index) => {
        const isCodeBlock = index % 2 === 1;

        if (isCodeBlock) {
          // Extract language and code content
          const firstLineBreak = part.indexOf("\n");
          let language = "";
          let code = part;

          if (firstLineBreak !== -1) {
            language = part.substring(0, firstLineBreak).trim();
            code = part.substring(firstLineBreak + 1);
          }

          return (
            <pre key={index} className="code-block-wrapper">
              {language && <div className="code-block-lang">{language}</div>}
              <code>{code.trim()}</code>
            </pre>
          );
        } else {
          // Parse normal text blocks (split by paragraphs / double newlines)
          const paragraphs = part.split(/\n\n+/g);

          return paragraphs.map((para, paraIdx) => {
            const trimmed = para.trim();
            if (!trimmed) return null;

            // Split by single newlines for line breaks inside paragraphs
            const lines = trimmed.split(/\n/g);

            return (
              <p key={`${index}-${paraIdx}`} className="markdown-paragraph">
                {lines.map((line, lineIdx) => (
                  <React.Fragment key={lineIdx}>
                    {parseInlineStyles(line)}
                    {lineIdx < lines.length - 1 && <br />}
                  </React.Fragment>
                ))}
              </p>
            );
          });
        }
      })}
    </>
  );
};

// Tokenizer for bold (**text**) and inline code (`code`)
function parseInlineStyles(text: string): React.ReactNode[] {
  // Regex to match bold, inline code, or plain text
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const innerText = part.slice(2, -2);
      return <strong key={idx}>{innerText}</strong>;
    } else if (part.startsWith("`") && part.endsWith("`")) {
      const innerText = part.slice(1, -1);
      return <code key={idx}>{innerText}</code>;
    } else {
      return <span key={idx}>{part}</span>;
    }
  });
}
