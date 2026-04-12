<script setup lang="ts">
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { Compartment, EditorSelection, EditorState, RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  keymap,
  lineNumbers,
  type DecorationSet,
  ViewPlugin,
} from "@codemirror/view";
import { useThemeVars } from "naive-ui";
import { onBeforeUnmount, onMounted, ref, watch, computed } from "vue";

import { KEYWORD_TOKENS, OPERATOR_TOKENS, TokenType } from "@/libs/cpc-core/src/lexer/tokens";
import builtInFunctions from "@/libs/cpc-core/src/runtime/builtin-functions";

const KEYWORDS = Object.keys(KEYWORD_TOKENS).sort();
const OPERATOR_WORDS = Object.keys(OPERATOR_TOKENS).filter((token) => /^[A-Z]+$/.test(token));
const OPERATOR_SYMBOLS = Object.keys(OPERATOR_TOKENS).filter((token) => !/^[A-Z]+$/.test(token));
const TYPE_LOOKUP = new Set<string>([
  TokenType.INTEGER,
  TokenType.REAL,
  TokenType.CHAR,
  TokenType.STRING,
  TokenType.BOOLEAN,
  TokenType.DATE,
]);
const BOOLEAN_LOOKUP = new Set<string>([TokenType.TRUE, TokenType.FALSE]);
const BUILTIN_LOOKUP = new Set<string>(Object.keys(builtInFunctions));
const KEYWORD_LOOKUP = new Set(
  KEYWORDS.filter(
    (keyword) => !TYPE_LOOKUP.has(keyword) && !BOOLEAN_LOOKUP.has(keyword) && !OPERATOR_WORDS.includes(keyword),
  ),
);
const OPERATOR_WORD_LOOKUP = new Set<string>(OPERATOR_WORDS);
const OPERATOR_SYMBOL_LOOKUP = new Set<string>(OPERATOR_SYMBOLS);

const keywordCompletions: Completion[] = [
  ...KEYWORDS.map((label) => {
    if (TYPE_LOOKUP.has(label)) {
      return { label, type: "type" as const };
    }
    if (BOOLEAN_LOOKUP.has(label)) {
      return { label, type: "constant" as const };
    }
    return { label, type: "keyword" as const };
  }),
  ...OPERATOR_WORDS.map((label) => ({ label, type: "keyword" as const })),
  ...Object.keys(builtInFunctions)
    .sort()
    .map((label) => ({ label, type: "function" as const })),
];

function keywordCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[A-Za-z_]*/);
  if (!word) {
    return null;
  }
  if (!context.explicit && word.from === word.to) {
    return null;
  }

  const options = keywordCompletions.filter((item) => item.label.startsWith(word.text));
  return {
    from: word.from,
    options,
    validFor: /[A-Za-z_]*/,
  };
}

const keywordMark = Decoration.mark({ class: "cm-pc-keyword" });
const typeMark = Decoration.mark({ class: "cm-pc-type" });
const booleanMark = Decoration.mark({ class: "cm-pc-boolean" });
const builtinMark = Decoration.mark({ class: "cm-pc-builtin" });
const operatorMark = Decoration.mark({ class: "cm-pc-operator" });
const commentMark = Decoration.mark({ class: "cm-pc-comment" });
const stringMark = Decoration.mark({ class: "cm-pc-string" });

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    const tokenRegex = /\/\/.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|<-|<=|>=|<>|[=<>+\-*/&]|\b[A-Za-z_][A-Za-z0-9_]*\b/gm;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      const token = match[0];

      if (token.startsWith("//")) {
        builder.add(start, end, commentMark);
        continue;
      }
      if (token.startsWith('"') || token.startsWith("'")) {
        builder.add(start, end, stringMark);
        continue;
      }

      if (TYPE_LOOKUP.has(token)) {
        builder.add(start, end, typeMark);
      } else if (BOOLEAN_LOOKUP.has(token)) {
        builder.add(start, end, booleanMark);
      } else if (BUILTIN_LOOKUP.has(token)) {
        builder.add(start, end, builtinMark);
      } else if (OPERATOR_SYMBOL_LOOKUP.has(token) || OPERATOR_WORD_LOOKUP.has(token)) {
        builder.add(start, end, operatorMark);
      } else if (KEYWORD_LOOKUP.has(token)) {
        builder.add(start, end, keywordMark);
      }
    }
  }

  return builder.finish();
}

const pseudocodeHighlighting = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  },
) as Extension;

const theme = useThemeVars();
const editorThemeVars = computed(() => ({
  "--cm-bg": theme.value.cardColor,
  "--cm-fg": theme.value.textColor1,
  "--cm-fg-muted": theme.value.textColor3,
  "--cm-gutter-bg": theme.value.bodyColor,
  "--cm-gutter-fg": theme.value.textColor3,
  "--cm-line-active": theme.value.actionColor,
  "--cm-selection": theme.value.infoColorSuppl,
  "--cm-selection-opacity": "0.24",
  "--cm-cursor": theme.value.primaryColor,
  "--cm-bracket-match-bg": theme.value.hoverColor,
  "--cm-border": theme.value.dividerColor,
  "--cm-font": theme.value.fontFamilyMono,
  "--cm-keyword": theme.value.primaryColor,
  "--cm-operator": theme.value.warningColor,
  "--cm-type": theme.value.successColor,
  "--cm-boolean": theme.value.warningColor,
  "--cm-comment": theme.value.textColor3,
  "--cm-string": theme.value.infoColor,
  "--cm-builtin": theme.value.errorColor,
  "--cm-complete-bg": theme.value.popoverColor,
  "--cm-complete-fg": theme.value.textColor1,
  "--cm-complete-border": theme.value.borderColor,
  "--cm-complete-active": theme.value.primaryColorSuppl,
  "--cm-complete-active-fg": theme.value.textColor1,
}));

const props = defineProps<{
  modelValue: string;
  enablePseudocode?: boolean;
  breakpoints?: number[];
  activeDebugLine?: number | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "toggle-breakpoint": [line: number];
}>();

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
const pseudocodeCompartment = new Compartment();
const breakpointCompartment = new Compartment();
const debugLineCompartment = new Compartment();

class BreakpointMarker extends GutterMarker {
  toDOM(): HTMLElement {
    const marker = document.createElement("span");
    marker.className = "cm-pc-breakpoint-dot";
    return marker;
  }
}

const breakpointMarker = new BreakpointMarker();

function createPseudocodeExtension(): Extension {
  return props.enablePseudocode
    ? [pseudocodeHighlighting, autocompletion({ override: [keywordCompletionSource] })]
    : [];
}

function createBreakpointExtension(): Extension {
  return gutter({
    class: "cm-pc-breakpoint-gutter",
    lineMarker: (_view, line) => {
      const lineNumber = _view.state.doc.lineAt(line.from).number;
      return props.breakpoints?.includes(lineNumber) ? breakpointMarker : null;
    },
    initialSpacer: () => breakpointMarker,
    domEventHandlers: {
      mousedown: (_view, line, event) => {
        event.preventDefault();
        emit("toggle-breakpoint", _view.state.doc.lineAt(line.from).number);
        return true;
      },
    },
  });
}

function createDebugLineExtension(): Extension {
  if (!props.activeDebugLine || props.activeDebugLine < 1) {
    return [];
  }

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        const line = props.activeDebugLine;
        if (!line || line > view.state.doc.lines) {
          this.decorations = Decoration.none;
          return;
        }

        this.decorations = Decoration.set([
          Decoration.line({ class: "cm-pc-active-debug-line" }).range(
            view.state.doc.line(line).from,
          ),
        ]);
      }
    },
    {
      decorations: (instance) => instance.decorations,
    },
  );
}

function focusEditor(): void {
  view?.focus();
}

defineExpose({
  focusEditor,
});

function createEditorState(content: string): EditorState {
  return EditorState.create({
    doc: content,
    extensions: [
      lineNumbers(),
      breakpointCompartment.of(createBreakpointExtension()),
      history(),
      bracketMatching(),
      pseudocodeCompartment.of(createPseudocodeExtension()),
      debugLineCompartment.of(createDebugLineExtension()),
      keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          emit("update:modelValue", update.state.doc.toString());
        }
      }),
    ],
  });
}

onMounted(() => {
  if (!host.value) {
    return;
  }

  view = new EditorView({
    state: createEditorState(props.modelValue),
    parent: host.value,
  });

  requestAnimationFrame(() => {
    focusEditor();
  });
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

watch(
  () => props.modelValue,
  (nextValue) => {
    if (!view) {
      return;
    }

    const current = view.state.doc.toString();
    if (current === nextValue) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: nextValue,
      },
    });
  },
);

watch(
  () => props.enablePseudocode,
  () => {
    if (!view) {
      return;
    }
    view.dispatch({
      effects: pseudocodeCompartment.reconfigure(createPseudocodeExtension()),
    });
  },
);

watch(
  () => (props.breakpoints ?? []).join(","),
  () => {
    if (!view) {
      return;
    }
    view.dispatch({
      effects: breakpointCompartment.reconfigure(createBreakpointExtension()),
    });
  },
);

watch(
  () => props.activeDebugLine,
  (line) => {
    if (!view) {
      return;
    }

    view.dispatch({
      effects: debugLineCompartment.reconfigure(createDebugLineExtension()),
    });

    if (!line || line < 1 || line > view.state.doc.lines) {
      return;
    }

    const targetLine = view.state.doc.line(line);
    view.dispatch({
      selection: EditorSelection.cursor(targetLine.from),
      scrollIntoView: true,
    });
  },
);
</script>

<template>
  <div ref="host" class="code-editor-host" :style="editorThemeVars" />
</template>

<style scoped>
.code-editor-host {
  height: 100%;
  min-height: 0;
  background: var(--cm-bg);
  border-top: 1px solid var(--cm-border);
}

.code-editor-host :deep(.cm-editor) {
  height: 100%;
  background: var(--cm-bg);
  color: var(--cm-fg);
}

.code-editor-host :deep(.cm-scroller) {
  overflow: auto;
  font-family: var(--cm-font), monospace;
}

.code-editor-host :deep(.cm-content) {
  caret-color: var(--cm-cursor);
}

.code-editor-host :deep(.cm-gutters) {
  background: var(--cm-gutter-bg);
  color: var(--cm-gutter-fg);
  border-right: 1px solid var(--cm-border);
}

.code-editor-host :deep(.cm-pc-breakpoint-gutter) {
  width: 16px;
}

.code-editor-host :deep(.cm-pc-breakpoint-dot) {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--cm-builtin);
}

.code-editor-host :deep(.cm-pc-active-debug-line) {
  background: color-mix(in srgb, var(--cm-selection) 18%, transparent);
}

.code-editor-host :deep(.cm-activeLine) {
  background: var(--cm-line-active);
}

.code-editor-host :deep(.cm-activeLineGutter) {
  background: var(--cm-line-active);
}

.code-editor-host :deep(.cm-cursor),
.code-editor-host :deep(.cm-dropCursor) {
  border-left: 2px solid var(--cm-cursor) !important;
}

.code-editor-host :deep(.cm-selectionBackground) {
  background: color-mix(in srgb, var(--cm-selection) var(--cm-selection-opacity), transparent);
}

.code-editor-host :deep(.cm-matchingBracket) {
  background: var(--cm-bracket-match-bg);
  color: var(--cm-fg);
  outline: none;
}

.code-editor-host :deep(.cm-foldPlaceholder) {
  background: var(--cm-line-active);
  color: var(--cm-fg-muted);
  border-color: var(--cm-border);
}

.code-editor-host :deep(.cm-pc-keyword) {
  color: var(--cm-keyword);
  font-weight: 600;
}

.code-editor-host :deep(.cm-pc-operator) {
  color: var(--cm-operator);
  font-weight: 600;
}

.code-editor-host :deep(.cm-pc-type) {
  color: var(--cm-type);
  font-weight: 600;
}

.code-editor-host :deep(.cm-pc-boolean) {
  color: var(--cm-boolean);
  font-weight: 600;
}

.code-editor-host :deep(.cm-pc-comment) {
  color: var(--cm-comment);
  font-style: italic;
}

.code-editor-host :deep(.cm-pc-builtin) {
  color: var(--cm-builtin);
  font-weight: 600;
}

.code-editor-host :deep(.cm-pc-string) {
  color: var(--cm-string);
}

.code-editor-host :deep(.cm-tooltip-autocomplete) {
  background: var(--cm-complete-bg);
  color: var(--cm-complete-fg);
  border: 1px solid var(--cm-complete-border);
}

.code-editor-host :deep(.cm-tooltip-autocomplete ul li) {
  color: var(--cm-complete-fg);
}

.code-editor-host :deep(.cm-tooltip-autocomplete ul li[aria-selected]) {
  background: var(--cm-complete-active);
  color: var(--cm-complete-active-fg);
}

.code-editor-host :deep(.cm-tooltip-autocomplete .cm-completionIcon) {
  opacity: 0.8;
}
</style>
