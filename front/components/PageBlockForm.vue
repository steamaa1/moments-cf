<script setup>
/**
 * PageBlockForm：块编辑器（Gutenberg-lite P1）的通用 schema 表单组件。
 *
 * 按 front/utils/pageBlockSchema.js 注册表条目（BlockSchema）把组件块 data 渲染成表单，
 * 取代旧编辑器逐 kind 手写的极简表单（pages/sys/pages/[id].vue 的 ITEM_FIELDS/componentExtra）。
 * t3 块编辑器按此接入：
 *   <PageBlockForm :schema="getPageBlockSchema(block.kind)" v-model="block.data" />
 *
 * 渲染规则：fields 的 string → UInput、number → UInput type=number（内部以字符串编辑，
 * emit 前转回数字）；lists → 条目行（行内按 itemFields 渲染 UInput，行尾删除按钮）
 * +「加一行」。
 *
 * 输出语义（与旧编辑器 compact 同构，保证落盘 JSON 干净）：emit 前丢弃空字符串字段与
 * 全空条目行；列表键恒输出（全空时输出 []，与旧编辑器 items: [] 一致）。schema 外的
 * 顶层自定义键（高级模式写入的）原样透传，编辑不丢字段。
 *
 * 数据流：本地 draft 是输入框唯一事实源，draft 变化 → buildOutput()（compaction）→
 * 与 lastEmitted 相同则跳过、不同才 emit；父组件把 emit 值回灌不会形成回路（JSON 深比较
 * 短路）。modelValue / schema 外部变化 → resync() 重建 draft，并以 syncing 标志抑制其后的
 * draft→emit 回路：组件只对用户真实编辑 emit，避免「打开面板即 dirty」误判。
 *
 * 高级模式：切换按钮把 modelValue 以 JSON.stringify(…, null, 2) 灌入 textarea，「应用」时
 * JSON.parse：成功则原样 emit（刻意不做 compaction——高级模式是表单表达不了的结构，如
 * null 标量 data、自定义键、嵌套对象的唯一逃生通道），失败 toast + 行内报错且不应用。
 *
 * 风格：深色全部走 tailwind dark: 工具类，刻意不写 scoped style——没有需要 CSS 的规则，
 * 也天然规避「:global 包裹 .dark」写法被 @vue/compiler-sfc 编译丢掉后代选择器的坑（见 AGENTS.md）。
 */
import { toast } from 'vue-sonner'

const props = defineProps({
  /** pageBlockSchema 注册表条目（BlockSchema），必传 */
  schema: { type: Object, required: true },
  /** 组件块 data：协议允许任意 JSON（对象为主，null 标量也合法） */
  modelValue: { type: null, default: null },
})

const emit = defineEmits(['update:modelValue'])

/* ---------- 工具与 schema 形状缓存 ---------- */

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value)

/** 非标量值字符串化进输入框（JSON.parse 来的数据不会循环引用，catch 仅为不抛错兜底） */
const safeJsonText = value => {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** schema.lists 可缺省，渲染与输出管线统一从这两处取，杜绝逐处判空 */
const schemaFields = computed(() => (Array.isArray(props.schema && props.schema.fields) ? props.schema.fields : []))
const schemaLists = computed(() => (Array.isArray(props.schema && props.schema.lists) ? props.schema.lists : []))

/** 必填/可选标注只加在顶层字段（行内靠 placeholder 提示，保持行紧凑） */
const fieldLabel = field => (field.optional ? `${field.label}（可选）` : field.label)

/* ---------- draft：输入框唯一事实源 ---------- */

const draft = reactive({ scalars: {}, lists: {}, extras: {} })

const emptyRow = itemFields => Object.fromEntries(itemFields.map(field => [field.key, '']))

/**
 * 行对象归一：itemFields 全键补齐为字符串（number → String、非标量 → JSON 字符串，
 * 保证输入框可显示可编辑），行内其余自定义键原样保留、输出时透传。
 * 统一走 entries + fromEntries：__proto__ 之类的键用普通赋值会打到原型 setter 上，
 * fromEntries（CreateDataProperty）才能把它落成自有属性。
 */
const normalizeRow = (row, itemFields) => {
  const itemKeys = new Set(itemFields.map(field => field.key))
  const entries = itemFields.map(field => {
    const value = row[field.key]
    if (typeof value === 'string') return [field.key, value]
    if (typeof value === 'number' && Number.isFinite(value)) return [field.key, String(value)]
    if (value == null) return [field.key, '']
    return [field.key, safeJsonText(value)]
  })
  for (const [key, value] of Object.entries(row)) {
    if (!itemKeys.has(key)) entries.push([key, value])
  }
  return Object.fromEntries(entries)
}

/**
 * 用外部值重建 draft（modelValue / schema 变化、高级模式应用共用）。
 * 容错：非对象 data → 空表单；列表值非数组 → 空列表（原值非空则进 extras 透传，不静默丢）；
 * 非对象行丢弃（七个 page-ui 组件对非对象行本来就渲染不出内容）；顶层 schema 字段为
 * 非标量值时原值进 extras（表单显示空，高级模式可改回）。
 */
const syncDraft = value => {
  const source = isPlainObject(value) ? value : {}
  const fieldKeys = new Set(schemaFields.value.map(field => field.key))
  const listKeys = new Set(schemaLists.value.map(list => list.key))
  const scalars = {}
  const extraEntries = []
  for (const field of schemaFields.value) {
    const raw = source[field.key]
    if (typeof raw === 'string') {
      scalars[field.key] = raw
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      scalars[field.key] = String(raw)
    } else if (raw == null) {
      scalars[field.key] = ''
    } else {
      extraEntries.push([field.key, raw])
    }
  }
  const lists = {}
  for (const list of schemaLists.value) {
    const raw = source[list.key]
    if (Array.isArray(raw)) {
      lists[list.key] = raw.filter(isPlainObject).map(row => normalizeRow(row, list.itemFields))
    } else {
      lists[list.key] = []
      if (raw != null) extraEntries.push([list.key, raw])
    }
  }
  for (const [key, raw] of Object.entries(source)) {
    if (!fieldKeys.has(key) && !listKeys.has(key)) extraEntries.push([key, raw])
  }
  draft.scalars = scalars
  draft.lists = lists
  draft.extras = Object.fromEntries(extraEntries)
}

/* ---------- 输出管线：emit 前的 compaction（与旧编辑器 compact 同构） ---------- */

/** 空字符串/纯空白值不输出（对象、数字、false 等非字符串值恒通过） */
const compactValue = value => String(value ?? '').trim() !== ''

/**
 * draft → 输出对象：
 *   - string 字段：trim 后为空 → 不输出，否则原样（不 trim 值本身）；
 *   - number 字段：空 → 不输出，Number() 后有限才输出数字（防 NaN 被 stringify 成 null 落盘）；
 *   - 列表：逐行过滤空字符串键（含行内自定义键），全空行整行丢弃；列表键恒输出；
 *   - extras（顶层自定义键）：空字符串丢弃，其余原样透传。
 */
const buildOutput = () => {
  const entries = []
  for (const field of schemaFields.value) {
    const value = draft.scalars[field.key]
    if (field.type === 'number') {
      const text = String(value ?? '').trim()
      const num = Number(text)
      if (text !== '' && Number.isFinite(num)) entries.push([field.key, num])
    } else if (compactValue(value)) {
      entries.push([field.key, value])
    }
  }
  for (const list of schemaLists.value) {
    const rows = draft.lists[list.key]
      .map(row => Object.fromEntries(Object.entries(row).filter(([, value]) => compactValue(value))))
      .filter(row => Object.keys(row).length > 0)
    entries.push([list.key, rows])
  }
  for (const [key, value] of Object.entries(draft.extras)) {
    if (compactValue(value)) entries.push([key, value])
  }
  return Object.fromEntries(entries)
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** 深克隆基线值（断开引用，防父组件原地修改与我们记录的 lastEmitted 连体） */
const cloneJson = value => {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

/* ---------- 同步与 emit 回路 ---------- */

const lastEmitted = ref(null)
let syncing = false

/** 外部值 → draft 重建的统一入口：抑制紧随其后的一次 draft→emit（避免打开面板即 dirty） */
const resync = value => {
  syncing = true
  try {
    syncDraft(value)
  } finally {
    nextTick(() => {
      syncing = false
    })
  }
}

const emitCompact = () => {
  if (syncing) return
  const output = buildOutput()
  if (sameJson(output, lastEmitted.value)) return
  lastEmitted.value = cloneJson(output)
  emit('update:modelValue', output)
}

watch(draft, emitCompact, { deep: true })

/* 外部变化（父组件换引用或原地改）才重建 draft；自己 emit 的回灌被深比较短路 */
watch(
  () => props.modelValue,
  value => {
    if (sameJson(value, lastEmitted.value)) return
    lastEmitted.value = cloneJson(value)
    resync(value)
  },
  { deep: true },
)

/* 复用实例换 schema（t3 若不按块重建组件）时同样重建 draft，基线重置为新 modelValue */
watch(() => props.schema, () => {
  lastEmitted.value = cloneJson(props.modelValue)
  resync(props.modelValue)
})

/* 初始化：基线 = 初始 modelValue，不主动 emit——组件只对用户编辑负责 */
lastEmitted.value = cloneJson(props.modelValue)
resync(props.modelValue)

/* ---------- 列表行操作 ---------- */

const addRow = list => draft.lists[list.key].push(emptyRow(list.itemFields))
const removeRow = (list, index) => draft.lists[list.key].splice(index, 1)

/* ---------- 高级模式：JSON 直编（表单外结构的逃生通道） ---------- */

const advanced = ref(false)
const jsonText = ref('')
const jsonError = ref('')

/** 打开时以当前 modelValue 为快照（编辑期间不跟随外部变化，防打断输入）；收起丢弃未应用编辑 */
const toggleAdvanced = () => {
  if (advanced.value) {
    advanced.value = false
    return
  }
  jsonText.value = JSON.stringify(props.modelValue ?? null, null, 2)
  jsonError.value = ''
  advanced.value = true
}

/** 应用：解析成功原样 emit（不 compaction），失败 toast + 行内报错且不应用 */
const applyJson = () => {
  let parsed
  try {
    parsed = JSON.parse(jsonText.value)
  } catch (error) {
    jsonError.value = `JSON 解析失败：${error?.message || error}`
    toast.error(jsonError.value)
    return
  }
  jsonError.value = ''
  lastEmitted.value = cloneJson(parsed)
  emit('update:modelValue', parsed)
  resync(parsed)
  advanced.value = false
  toast.success('已应用 JSON 编辑')
}
</script>

<template>
  <div class="page-block-form space-y-4">
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-semibold text-gray-700 dark:text-gray-200">{{ schema?.label }}参数</p>
      <UButton
        size="xs"
        color="white"
        :icon="advanced ? 'i-carbon-chevron-up' : 'i-carbon-json'"
        @click="toggleAdvanced"
      >
        {{ advanced ? '收起' : '高级模式' }}
      </UButton>
    </div>

    <!-- 普通模式：schema 驱动的表单 -->
    <template v-if="!advanced">
      <UFormGroup v-for="field in schemaFields" :key="field.key" :label="fieldLabel(field)">
        <UInput
          v-model="draft.scalars[field.key]"
          :type="field.type === 'number' ? 'number' : 'text'"
          :placeholder="field.placeholder"
        />
      </UFormGroup>

      <section v-for="list in schemaLists" :key="list.key" class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-xs font-semibold text-gray-500 dark:text-gray-400">{{ list.label }}列表</p>
          <UButton size="xs" color="white" icon="i-carbon-add" @click="addRow(list)">加一行</UButton>
        </div>
        <div
          v-for="(row, index) in draft.lists[list.key]"
          :key="index"
          class="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-gray-300 p-2 dark:border-gray-600"
        >
          <UInput
            v-for="field in list.itemFields"
            :key="field.key"
            v-model="row[field.key]"
            :placeholder="field.placeholder"
            :aria-label="field.label"
            size="sm"
            class="min-w-[8rem] flex-1"
          />
          <UButton
            size="xs"
            color="red"
            variant="soft"
            icon="i-carbon-trash-can"
            aria-label="删除本行"
            @click="removeRow(list, index)"
          />
        </div>
        <p v-if="!draft.lists[list.key]?.length" class="text-xs text-gray-400 dark:text-gray-500">
          暂无{{ list.label }}，点「加一行」新增
        </p>
      </section>
    </template>

    <!-- 高级模式：JSON 直编 -->
    <template v-else>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        直接编辑 JSON（支持表单外的自定义字段；格式错误不会应用），「应用」后覆盖表单值
      </p>
      <textarea
        v-model="jsonText"
        rows="10"
        spellcheck="false"
        class="w-full rounded-lg border border-gray-300 bg-white p-3 font-mono text-xs leading-5 outline-none focus:border-primary-500 dark:border-gray-600 dark:bg-neutral-900 dark:text-gray-100"
      />
      <p v-if="jsonError" class="text-xs text-red-500 dark:text-red-400">{{ jsonError }}</p>
      <div class="flex justify-end gap-2">
        <UButton size="xs" color="white" @click="advanced = false">收起</UButton>
        <UButton size="xs" icon="i-carbon-checkmark" @click="applyJson">应用</UButton>
      </div>
    </template>
  </div>
</template>
