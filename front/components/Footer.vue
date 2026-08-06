<template>
  <footer class="footer px-4 py-6 text-xs text-gray-500 dark:text-gray-400">
    <div class="flex flex-col items-center gap-3">
      <nav aria-label="项目链接" class="project-links">
        <a href="https://github.com/kingwrcy/moments" target="_blank" rel="noopener noreferrer">原项目</a>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/steamaa1/moments-cf" target="_blank" rel="noopener noreferrer">Cloudflare 版</a>
      </nav>
      <div v-if="sysConfig.beiAnNo" class="beian-html text-center" v-html="sysConfig.beiAnNo" />
    </div>
  </footer>
</template>

<script setup lang="ts">
import type { SysConfigVO } from "~/types";
const sysConfig = useState<SysConfigVO>("sysConfig");
</script>

<style scoped>
.project-links { display: inline-flex; align-items: center; gap: .6rem; }
.project-links a { color: inherit; text-decoration: none; transition: color 160ms ease, transform 160ms ease; }
.project-links a:hover { color: #576b95; transform: translateY(-1px); }
.project-links a:focus-visible { border-radius: 4px; outline: 2px solid #9fc84a; outline-offset: 3px; }
.beian-html :deep(a) { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.beian-html :deep(img) { display: inline-block; max-height: 20px; width: auto; vertical-align: middle; }
@media (prefers-reduced-motion: reduce) { .project-links a { transition: none; } }
</style>
