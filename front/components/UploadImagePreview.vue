<template>
  <div
    v-if="
      images.length > 0 &&
      ($route.path.startsWith('/new') || $route.path.startsWith('/edit'))
    "
    ref="el"
    class="grid gap-2"
    :style="gridStyle"
  >
    <div
      v-for="(img, i) in images"
      :key="img.id"
      class="relative"
      :class="
        images.length === 1
          ? 'full-cover-image-single'
          : 'full-cover-image-mult'
      "
    >
      <img :src="img.url" class="cursor-move rounded" loading="lazy" decoding="async" />
      <button
        type="button"
        aria-label="移除图片"
        class="remove-image-btn absolute top-0 right-0 m-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition duration-150 hover:bg-red-500/80 active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none motion-reduce:active:scale-100"
        @click="removeImage(i)"
      >
        <UIcon name="i-carbon-trash-can" />
      </button>
    </div>
  </div>

  <template v-else-if="imageConfigs && imageConfigs.length">
    <MyFancyBox :style="gridStyle">
      <div
        v-for="(imageConfig, z) in imageConfigs"
        :key="z"
        :href="imageConfig.url"
        :class="
          images.length === 1
            ? 'full-cover-image-single'
            : 'full-cover-image-mult'
        "
      >
        <img
          class="cursor-zoom-in rounded"
          :src="imageConfig.thumbUrl"
          loading="lazy"
          decoding="async"
          @error="fallbackToOriginal($event, imageConfig.url)"
        />
      </div>
    </MyFancyBox>
  </template>
</template>

<script setup lang="ts">
import { useSortable } from "@vueuse/integrations/useSortable";

interface ImgConfig {
  id: number;
  url: string;
  thumbUrl: string;
}

const route = useRoute();
const el = ref<HTMLElement | null>(null);
const props = defineProps<{ imgs?: string; imgConfigs?: ImgConfig[] }>();
const emit = defineEmits(["removeImage", "dragImage"]);

const images = ref<ImgConfig[]>([]);
const imageConfigs = ref<ImgConfig[]>([]);

watchEffect(() => {
  images.value = (props.imgs || "")
    .split(",")
    .filter(Boolean)
    .map((img) => ({ id: Math.random(), url: img, thumbUrl: img }));
});

watchEffect(() => {
  imageConfigs.value = (props.imgConfigs || []).map((imgConfig) => ({
    ...imgConfig,
    id: Math.random(),
  }));
});

watchEffect(() => {
  emit(
    "dragImage",
    images.value.map((img) => img.url)
  );
});

const removeImage = async (index: number) => {
  emit("removeImage", index);
};

const fallbackToOriginal = (event: Event, url: string) => {
  const image = event.currentTarget as HTMLImageElement | null;
  if (!image || image.dataset.fallbackApplied === "1") return;
  image.dataset.fallbackApplied = "1";
  image.src = url;
};

// 图片组内部排序：
// ① 容器是 v-if="images.length > 0" 渲染的，新建动态挂载时还没有图片，el 为 null；
//    若在 onMounted 里一次性初始化，实例根本建不起来，之后再加图片也拖不动。
//    因此改为监听「容器出现/可编辑态」来 start/stop（start 自身幂等）。
// ② 触摸屏上原生 HTML5 拖放无效，必须 forceFallback；fallbackTolerance 避免轻扫被误判为拖拽。
const canSortImages = computed(() => route.path.startsWith("/new") || route.path.startsWith("/edit"));
const imageSortable = useSortable(el, images, {
  forceFallback: true,
  fallbackOnBody: true,
  fallbackTolerance: 4,
  ghostClass: "image-sortable-ghost",
  chosenClass: "image-sortable-chosen",
  animation: 150,
});
watch(
  [el, canSortImages],
  ([element, sortableEnabled]) => {
    if (element && sortableEnabled) imageSortable.start();
    else imageSortable.stop();
  },
  { immediate: true }
);

const gridStyle = computed(() => {
  let style = "max-width:100%; display:grid; gap: 0.5rem; align-items: start;"; // 确保内容顶部对齐
  switch (images.value.length) {
    case 1:
      style += "grid-template-columns: 1fr; max-width:60%;";
      break;
    case 2:
      style += "grid-template-columns: 1fr 1fr; aspect-ratio: 2 / 1;";
      break;
    case 3:
      style += "grid-template-columns: 1fr 1fr 1fr; aspect-ratio: 3 / 1;";
      break;
    case 4:
      style += "grid-template-columns: 1fr 1fr; aspect-ratio: 1;";
      break;
    default:
      style += "grid-template-columns: 1fr 1fr 1fr;";
  }
  return style;
});
</script>

<style scoped>
/* 拖拽反馈：占位图半透明、被拖图轻微弱化（类由 SortableJS 运行时添加，故用 :deep） */
:deep(.image-sortable-ghost) {
  opacity: 0.35;
}
:deep(.image-sortable-chosen) {
  opacity: 0.9;
}
@media (prefers-reduced-motion: reduce) {
  :deep(.image-sortable-ghost),
  :deep(.image-sortable-chosen) {
    transition: none;
  }
}
.full-cover-image-mult {
  width: 100%;
  max-height: 300px;
  aspect-ratio: 1 / 1;

  > img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }
}

.full-cover-image-single {
  width: fit-content;

  > img {
    max-height: 300px;
    object-fit: cover;
    object-position: center;
  }
}
</style>
