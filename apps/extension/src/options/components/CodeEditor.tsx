import React, { useEffect, useRef, useState } from 'react';
import { browser } from '../../utils/browser';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  mode: 'javascript' | 'css';
  height?: string;
  minHeight?: string;
  placeholder?: string;
  readOnly?: boolean;
}

let aceLoaderPromise: Promise<void> | null = null;

async function loadScriptAsync(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
}

async function ensureAceLoaded(): Promise<void> {
  if (typeof window !== 'undefined' && (window as any).ace) {
    return;
  }
  if (aceLoaderPromise) {
    return aceLoaderPromise;
  }

  aceLoaderPromise = (async () => {
    try {
      const getLibUrl = (file: string) => {
        try {
          return browser.runtime.getURL(`libs/${file}`);
        } catch {
          return `../libs/${file}`;
        }
      };

      await loadScriptAsync(getLibUrl('ace.js'));
      await Promise.all([
        loadScriptAsync(getLibUrl('ace-mode-javascript.js')),
        loadScriptAsync(getLibUrl('ace-mode-css.js')),
        loadScriptAsync(getLibUrl('ace-theme-monokai.js')),
        loadScriptAsync(getLibUrl('ace-ext-language_tools.js')),
      ]);

      // Patch workers to load from Blob to comply with MV3 CSP
      const ace = (window as any).ace;
      if (ace?.config) {
        ace.config.set('loadWorkerFromBlob', true);

        try {
          const [jsWorkerRes, cssWorkerRes] = await Promise.all([
            fetch(getLibUrl('worker-javascript.js')),
            fetch(getLibUrl('worker-css.js')),
          ]);
          const jsWorkerCode = await jsWorkerRes.text();
          const cssWorkerCode = await cssWorkerRes.text();

          if (ace.require) {
            ace.require(['ace/worker/worker_client'], (workerClient: any) => {
              if (workerClient?.createWorker) {
                const orig = workerClient.createWorker;
                workerClient.createWorker = function (workerUrl: string) {
                  let code = null;
                  if (workerUrl && (workerUrl.includes('worker-javascript') || workerUrl.includes('javascript_worker'))) {
                    code = jsWorkerCode;
                  } else if (workerUrl && (workerUrl.includes('worker-css') || workerUrl.includes('css_worker'))) {
                    code = cssWorkerCode;
                  }
                  if (code) {
                    const blob = new Blob([code], { type: 'application/javascript' });
                    return new Worker(URL.createObjectURL(blob));
                  }
                  return orig.call(this, workerUrl);
                };
              }
            });
          }
        } catch (workerErr) {
          console.warn('[CodeEditor] Could not patch Ace workers:', workerErr);
        }
      }
    } catch (err) {
      console.warn('[CodeEditor] Failed to load Ace scripts:', err);
    }
  })();

  return aceLoaderPromise;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  mode,
  height = '220px',
  minHeight = '140px',
  placeholder = '',
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const [isAceReady, setIsAceReady] = useState(false);
  const isInternalChangeRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    ensureAceLoaded().then(() => {
      if (mounted) {
        setIsAceReady(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Initialize and bind Ace editor
  useEffect(() => {
    if (!isAceReady || !containerRef.current) return;

    const ace = (window as any).ace;
    if (!ace) return;

    const editor = ace.edit(containerRef.current);
    editorRef.current = editor;

    editor.session.setMode(`ace/mode/${mode}`);
    editor.setTheme('ace/theme/monokai');
    editor.setOptions({
      fontSize: 13.5,
      showPrintMargin: false,
      wrap: true,
      useSoftTabs: true,
      tabSize: 2,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
      readOnly,
    });

    editor.setValue(value || '', -1);

    const handleChange = () => {
      isInternalChangeRef.current = true;
      const currentVal = editor.getValue();
      onChange(currentVal);
      isInternalChangeRef.current = false;
    };

    editor.session.on('change', handleChange);

    // Auto resize observer
    const resizeObserver = new ResizeObserver(() => {
      editor.resize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      editor.destroy();
      editorRef.current = null;
    };
  }, [isAceReady, mode]);

  // Update editor value if changed externally
  useEffect(() => {
    if (editorRef.current && !isInternalChangeRef.current) {
      const cur = editorRef.current.getValue();
      if (cur !== value) {
        editorRef.current.setValue(value || '', -1);
      }
    }
  }, [value]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        minHeight,
        borderRadius: '10px',
        overflow: 'hidden',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        backgroundColor: '#272822', // Monokai dark background
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          display: isAceReady ? 'block' : 'none',
        }}
      />
      {!isAceReady && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          style={{
            width: '100%',
            height: '100%',
            padding: '12px',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '13.5px',
            lineHeight: 1.5,
            color: '#f8fafc',
            backgroundColor: '#272822',
            border: 'none',
            outline: 'none',
            resize: 'none',
            boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  );
};
