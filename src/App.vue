<script setup lang="ts">
import { darkTheme, NConfigProvider, NMessageProvider } from "naive-ui";

import IdeShell from "@/ide/components/IdeShell.vue";

const themeOverrides = {
  common: {
    fontFamily: "ZSFT-go, Inter Variable, sans-serif",
    fontFamilyMono: "ZSFT-443, JetBrains Mono, Cascadia Mono, Fira Code, monospace",
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

