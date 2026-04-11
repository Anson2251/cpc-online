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
import { EditorState, type Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet, ViewPlugin } from "@codemirror/view";
import { useThemeVars } from "naive-ui";
import { onBeforeUnmount, onMounted, ref, watch, computed } from "vue";

import { KEYWORD_TOKENS, TokenType } from "@/libs/cpc-core/src/lexer/tokens";
import builtInFunctions from "@/libs/cpc-core/src/runtime/builtin-functions";

const KEYWORDS = Object.keys(KEYWORD_TOKENS).sort();
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
  KEYWORDS.filter((keyword) => !TYPE_LOOKUP.has(keyword) && !BOOLEAN_LOOKUP.has(keyword)),
);

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

  const upper = word.text.toUpperCase();
  const options = keywordCompletions.filter((item) => item.label.startsWith(upper));
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
const commentMark = Decoration.mark({ class: "cm-pc-comment" });
const stringMark = Decoration.mark({ class: "cm-pc-string" });

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    const tokenRegex = /\/\/.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b[A-Za-z_][A-Za-z0-9_]*\b/gm;
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

      const upper = token.toUpperCase();
      if (TYPE_LOOKUP.has(upper)) {
        builder.add(start, end, typeMark);
      } else if (BOOLEAN_LOOKUP.has(upper)) {
        builder.add(start, end, booleanMark);
      } else if (BUILTIN_LOOKUP.has(upper)) {
        builder.add(start, end, builtinMark);
      } else if (KEYWORD_LOOKUP.has(upper)) {
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
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;

function focusEditor(): void {
  view?.focus();
}

defineExpose({
  focusEditor,
});

function createEditorState(content: string): EditorState {
  const pseudocodeExtensions: Extension[] = props.enablePseudocode
    ? [pseudocodeHighlighting, autocompletion({ override: [keywordCompletionSource] })]
    : [];

  return EditorState.create({
    doc: content,
    extensions: [
      lineNumbers(),
      history(),
      bracketMatching(),
      ...pseudocodeExtensions,
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
