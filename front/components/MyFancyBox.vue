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
  Array.from(container.value.children).forEach((element) => {
    element.setAttribute('data-fancybox', `gallery-${randomId}`);
  });
  Fancybox.unbind(selector);
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
