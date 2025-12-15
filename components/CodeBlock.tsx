
import React, { useState } from 'react';
import { CopyIcon, CheckIcon } from './icons';

interface CodeBlockProps {
  language: string;
  code: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
  };

  return (
    <div className="bg-gray-900 rounded-lg my-2 overflow-hidden border border-gray-700">
      <div className="flex justify-between items-center px-4 py-1 bg-gray-800 text-gray-400 text-xs">
        <span>{language}</span>
        <button onClick={handleCopy} className="flex items-center gap-1.5 text-gray-400 hover:text-white">
          {copied ? (
            <>
              <CheckIcon /> Copied!
            </>
          ) : (
            <>
              <CopyIcon /> Copy code
            </>
          )}
        </button>
      </div>
      <pre className="p-4 text-sm overflow-x-auto text-white"><code className={`language-${language}`}>{code}</code></pre>
    </div>
  );
};