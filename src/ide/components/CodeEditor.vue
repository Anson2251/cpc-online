<script setup lang="ts">
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { useThemeVars } from "naive-ui";
import { onBeforeUnmount, onMounted, ref, watch, computed } from "vue";

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
}));

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;

function createEditorState(content: string): EditorState {
  return EditorState.create({
    doc: content,
    extensions: [
      lineNumbers(),
      history(),
      bracketMatching(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
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
    view?.focus();
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
</style>
