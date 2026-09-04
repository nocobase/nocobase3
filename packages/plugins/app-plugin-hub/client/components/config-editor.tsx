import { yaml } from '@codemirror/lang-yaml';
import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef, type ReactElement } from 'react';

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: '13px',
    height: '360px',
  },
  '.cm-content': {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    lineHeight: '1.6',
    padding: '12px 0',
  },
  '.cm-gutters': {
    backgroundColor: 'color-mix(in oklab, var(--muted) 45%, transparent)',
    borderRight: '1px solid var(--border)',
    color: 'var(--muted-foreground)',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklab, var(--muted) 55%, transparent)',
  },
  '.cm-scroller': { overflow: 'auto' },
  '&.cm-focused': { outline: 'none' },
});

const commonExtensions = [basicSetup, yaml(), editorTheme];

export interface ConfigMergeEditorProps {
  readonly current: string;
  readonly value: string;
  readonly readOnly?: boolean;
  readonly onChange?: (value: string) => void;
}

export function ConfigMergeEditor({
  current,
  value,
  readOnly = false,
  onChange,
}: ConfigMergeEditorProps): ReactElement {
  const parentRef = useRef<HTMLDivElement>(null);
  const mergeRef = useRef<MergeView>(null);
  const onChangeRef = useRef(onChange);
  const initialCurrentRef = useRef(current);
  const initialValueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    const merge = new MergeView({
      parent,
      orientation: 'a-b',
      highlightChanges: true,
      gutter: true,
      diffConfig: { scanLimit: 1_000, timeout: 500 },
      a: {
        doc: initialCurrentRef.current,
        extensions: [
          ...commonExtensions,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
        ],
      },
      b: {
        doc: initialValueRef.current,
        extensions: [
          ...commonExtensions,
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString());
            }
          }),
        ],
      },
    });
    mergeRef.current = merge;
    return (): void => {
      merge.destroy();
      mergeRef.current = null;
    };
  }, [readOnly]);

  useEffect(() => replaceDocument(mergeRef.current?.a, current), [current]);
  useEffect(() => replaceDocument(mergeRef.current?.b, value), [value]);

  return (
    <div
      className='overflow-hidden rounded-b-xl [&_.cm-mergeView]:h-[360px] [&_.cm-mergeView]:overflow-auto [&_.cm-mergeViewEditor]:min-w-0 [&_.cm-mergeViewEditor]:basis-1/2'
      ref={parentRef}
    />
  );
}

export interface ConfigEditorProps {
  readonly value: string;
  readonly readOnly?: boolean;
  readonly onChange?: (value: string) => void;
}

export function ConfigEditor({
  value,
  readOnly = false,
  onChange,
}: ConfigEditorProps): ReactElement {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    const view = new EditorView({
      parent,
      doc: initialValueRef.current,
      extensions: [
        ...commonExtensions,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
      ],
    });
    viewRef.current = view;
    return (): void => {
      view.destroy();
      viewRef.current = null;
    };
  }, [readOnly]);

  useEffect(() => replaceDocument(viewRef.current, value), [value]);

  return <div className='overflow-hidden' ref={parentRef} />;
}

function replaceDocument(
  view: EditorView | null | undefined,
  value: string,
): void {
  if (!view || view.state.doc.toString() === value) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
  });
}
