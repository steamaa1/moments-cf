<script setup>
import { Fancybox } from '@fancyapps/ui/dist/index.esm.js';

const props = defineProps({
  options: Object,
});
const container = ref(null);
const randomId = randomHexStr();
const selector = `[data-fancybox="gallery-${randomId}"]`;

function bindGallery() {
  if (!container.value) return;
  const gallery = `gallery-${randomId}`;
  // 只把图片链接交给 Fancybox：直接子链接，以及每个网格包装层内的直接子链接。
  // 管理按钮等控制元素待在包装层里，不能被当成预览触发器。
  const targets = [...container.value.children].flatMap((element) =>
    element.matches('a[href], div[href]')
      ? [element]
      : [...element.children].filter((child) => child.matches('a[href]')),
  );
  // 清掉上一轮标记：图集收起/删除照片后，旧链接不应继续留在预览序列里。
  container.value.querySelectorAll('a[data-fancybox], div[data-fancybox]').forEach((element) => {
    element.removeAttribute('data-fancybox');
  });
  targets.forEach((element) => element.setAttribute('data-fancybox', gallery));
  Fancybox.unbind(selector);
  if (!targets.length) return;
  Fancybox.bind(selector, {
    Thumbs: {
      type: 'modern',
    },
    ...(props.options || {}),
  });
}

onMounted(() => nextTick(bindGallery));
onUpdated(() => nextTick(bindGallery));

function randomHexStr(len = 16, chars = '0123456789abcdefghijklmnopqrstuvwxyz') {
  let str = '';
  const length = chars.length;
  while (len > 0) {
    str += chars[Math.floor(Math.random() * length)];
    len--;
  }
  return str;
}

onUnmounted(() => {
  Fancybox.unbind(selector);
});
</script>

<template>
  <div ref="container">
    <slot></slot>
  </div>
</template>

<style></style>
