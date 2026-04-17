<script setup lang="ts">
import { marked } from "marked";
import { computed, ref, nextTick, watch, onMounted, onBeforeUnmount } from "vue";

import { useThemeVars, NPerformantEllipsis } from "naive-ui";

import cpcGuideRaw from "@/libs/cpc-core/docs/cpc-guide.md?raw";
import cpcInsertRaw from "@/libs/cpc-core/docs/cpc-insert.md?raw";
import cpcExtendedRaw from "@/libs/cpc-core/docs/cpc-extended.md?raw";

interface DocEntry {
  key: string;
  label: string;
  content: string;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

const renderer = new marked.Renderer();

renderer.heading = function (data) {
  const text = data.text;
  const depth = data.depth;
  const id = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
  return `<h${depth} id="${id}">${text}</h${depth}>`;
};

marked.setOptions({ renderer });

const docs: DocEntry[] = [
  { key: "cpc-guide", label: "CPC Guide", content: cpcGuideRaw },
  { key: "cpc-insert", label: "CPC Insert", content: cpcInsertRaw },
  { key: "cpc-extended", label: "CPC Extended", content: cpcExtendedRaw },
];

const props = defineProps<{
  activeDocKey: string;
}>();

const activeDoc = computed(() => docs.find((d) => d.key === props.activeDocKey) ?? docs[0]);

const tocItems = computed<TocItem[]>(() => {
  const regex = /^(#{2,4})\s+(.+)$/gm;
  const items: TocItem[] = [];
  let match: RegExpExecArray | null;
  const usedIds = new Map<string, number>();

  while ((match = regex.exec(activeDoc.value.content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const baseId = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    const count = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}-${count}`;
    items.push({ id, text, level });
  }

  return items;
});

const renderedHtml = computed(() => {
  return marked.parse(activeDoc.value.content, { async: false }) as string;
});

const scrollRef = ref<HTMLElement | null>(null);
const tocHovered = ref(false);
const activeHeadingId = ref<string>("");

let observer: IntersectionObserver | null = null;

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activeHeadingId.value = entry.target.id;
        }
      }
    },
    {
      root: scrollRef.value,
      rootMargin: "0px 0px -70% 0px",
      threshold: 0,
    },
  );
});

watch(
  [scrollRef, renderedHtml],
  () => {
    if (!scrollRef.value || !observer) return;
    observer.disconnect();
    const headings = scrollRef.value.querySelectorAll("h2[id], h3[id], h4[id]");
    headings.forEach((h) => observer!.observe(h));
  },
  { flush: "post" },
);

onBeforeUnmount(() => {
  observer?.disconnect();
});

function scrollToHeading(id: string): void {
  const el = scrollRef.value?.querySelector(`#${CSS.escape(id)}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

watch(
  () => props.activeDocKey,
  async () => {
    await nextTick();
    if (scrollRef.value) {
      scrollRef.value.scrollTop = 0;
    }
  },
);

const theme = useThemeVars();
</script>

<template>
  <div class="doc-viewer-root">
    <div
      class="toc-trigger"
      @mouseenter="tocHovered = true"
      @mouseleave="tocHovered = false"
    >
      <div class="toc-lines">
        <div
          v-for="item in tocItems"
          :key="item.id"
          class="toc-line"
          :class="{ active: item.id === activeHeadingId }"
          :style="{ width: `${(4 - item.level + 1) * 33}%` }"
          @click="scrollToHeading(item.id)"
        />
      </div>
    </div>

    <Transition name="toc-fade">
      <div
        v-if="tocHovered && tocItems.length > 0"
        class="toc-panel"
        @mouseenter="tocHovered = true"
        @mouseleave="tocHovered = false"
      >
        <div class="toc-title">Outline</div>
        <div
          v-for="item in tocItems"
          :key="item.id"
          class="toc-item"
          :class="{ active: item.id === activeHeadingId }"
          :style="{ paddingLeft: `${(item.level - 2) * 12 + 8}px` }"
          @click="scrollToHeading(item.id)"
        >
          <NPerformantEllipsis>{{ item.text }}</NPerformantEllipsis>
        </div>
      </div>
    </Transition>

    <div ref="scrollRef" class="doc-scroll">
      <div class="doc-content" v-html="renderedHtml" />
    </div>
  </div>
</template>

<style scoped>
.doc-viewer-root {
  height: 100%;
  box-sizing: border-box;
  position: relative;
}

.doc-scroll {
  height: 100%;
  overflow-y: auto;
  padding-bottom: 6em;
  box-sizing: border-box;
}

.toc-trigger {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  width: 16px;
  height: 100%;
  cursor: pointer;
}

.toc-lines {
  position: absolute;
  top: 40%;
  width: 16px;
  left: 0;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px 2px;
}

.toc-line {
  height: 3px;
  border-radius: 2px;
  background: v-bind("theme.textColor3");
  opacity: 0.15;
  transition: opacity 0.2s, background 0.2s;
  cursor: pointer;
}

.toc-line.active {
  opacity: 0.6;
  background: v-bind("theme.primaryColor");
}

.toc-trigger:hover .toc-line {
  opacity: 0.35;
}

.toc-trigger:hover .toc-line.active {
  opacity: 0.8;
}

.toc-panel {
  pointer-events: auto;
  position: absolute;
  top: 10vh;
  left: 4px;
  width: min(220px, calc(100% - 24px));
  max-height: 70vh;
  overflow-y: auto;
  padding: 10px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, v-bind("theme.cardColor") 92%, transparent);
  border: 1px solid v-bind("theme.borderColor");
  backdrop-filter: blur(8px);
  box-shadow: v-bind("theme.boxShadow2");
  font-size: 12px;
  z-index: 999;
  padding-left: 32px;
  transform: translateX(-24px);
}

.toc-title {
  position: sticky;
  top: 0;
  z-index: 1;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: v-bind("theme.textColor3");
  padding: 0 8px 6px;
  padding-top: 16px;
  transform: translateY(-12px);
  border-bottom: 1px solid v-bind("theme.borderColor");
  margin-bottom: 4px;
  background: color-mix(in srgb, v-bind("theme.cardColor") 92%, transparent);
}

.toc-item {
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  color: v-bind("theme.textColor2");
  transition: background 0.15s, color 0.15s;
  overflow: hidden;
}

.toc-item:hover {
  background: v-bind("theme.actionColor");
  color: v-bind("theme.textColor1");
}

.toc-item.active {
  color: v-bind("theme.primaryColor");
  font-weight: 500;
}

.toc-fade-enter-active,
.toc-fade-leave-active {
  transition: opacity 0.15s ease;
}

.toc-fade-enter-from,
.toc-fade-leave-to {
  opacity: 0;
}

.doc-content {
  padding: 8px 12px;
  padding-left: 24px;
  box-sizing: border-box;
  font-size: 13px;
  line-height: 1.6;
  color: v-bind("theme.textColor1");
}

.doc-content :deep(h1),
.doc-content :deep(h2),
.doc-content :deep(h3),
.doc-content :deep(h4) {
  margin-top: 1em;
  margin-bottom: 0.4em;
  font-weight: 600;
  color: v-bind("theme.textColor1");
}

.doc-content :deep(h1) {
  font-size: 1.3em;
}

.doc-content :deep(h2) {
  font-size: 1.15em;
}

.doc-content :deep(h3) {
  font-size: 1.05em;
}

.doc-content :deep(p) {
  margin: 0.5em 0;
}

.doc-content :deep(ul),
.doc-content :deep(ol) {
  padding-left: 1.5em;
  margin: 0.4em 0;
}

.doc-content :deep(li) {
  margin: 0.2em 0;
}

.doc-content :deep(code) {
  font-family: var(--font-mono, "Cascadia Code", "Fira Code", "Consolas", monospace);
  font-size: 0.9em;
  padding: 0.15em 0.35em;
  border-radius: 3px;
  background: v-bind("theme.actionColor");
  color: v-bind("theme.textColor1");
}

.doc-content :deep(pre) {
  margin: 0.6em 0;
  padding: 10px 12px;
  border-radius: 6px;
  overflow-x: auto;
  background: v-bind("theme.actionColor");
}

.doc-content :deep(pre code) {
  padding: 0;
  background: transparent;
  font-size: 0.88em;
  line-height: 1.5;
}

.doc-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.6em 0;
  font-size: 0.92em;
}

.doc-content :deep(th),
.doc-content :deep(td) {
  padding: 6px 10px;
  border: 1px solid v-bind("theme.borderColor");
  text-align: left;
}

.doc-content :deep(th) {
  background: v-bind("theme.actionColor");
  font-weight: 600;
}

.doc-content :deep(blockquote) {
  margin: 0.6em 0;
  padding: 0.4em 1em;
  border-left: 3px solid v-bind("theme.primaryColor");
  background: v-bind("theme.actionColor");
  border-radius: 0 4px 4px 0;
}

.doc-content :deep(hr) {
  border: none;
  border-top: 1px solid v-bind("theme.borderColor");
  margin: 1em 0;
}

.doc-content :deep(a) {
  color: v-bind("theme.primaryColor");
  text-decoration: none;
}

.doc-content :deep(a:hover) {
  text-decoration: underline;
}

.doc-content :deep(strong) {
  font-weight: 600;
}
</style>
