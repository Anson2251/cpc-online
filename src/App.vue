<script setup lang="ts">
import { darkTheme, NConfigProvider, NMessageProvider } from "naive-ui";

import IdeShell from "@/ide/components/IdeShell.vue";

const themeOverrides = {
  common: {
    fontFamily: "Inter Variable, Segoe UI, sans-serif",
    fontFamilyMono: "JetBrains Mono, Fira Code, Cascadia Mono, monospace",
  },
};
</script>

<template>
  <NConfigProvider :theme="darkTheme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <IdeShell />
    </NMessageProvider>
  </NConfigProvider>
</template>
