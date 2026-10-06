/**
 * 站内内置的状态图案集（「图案 + 文案」四组）——单一数据源。
 *
 * 两个消费方共用本文件，避免各写一份导致漂移：
 *   1. 用户状态设置面板 front/components/StatusIcon.vue（选择心情/工作/活动/休息图案）
 *   2. 自定义页面编辑器的「图案」选择器（把图案插入正文当装饰）
 *
 * 数据与 worker/src/index.js 的 BUILTIN_STATUSES 保持一致；增删图案时两边同步。
 * 纯数据模块（无 Vue 依赖），可被 node --test 直接 import。
 *
 * @type {Array<{ group: string, items: Array<{ icon: string, content: string }> }>}
 */
export const STATUS_PATTERN_GROUPS = [
  { group: '心情想法', items: [{ icon: '😄', content: '美滋滋' }, { icon: '😞', content: '郁闷' }, { icon: '😴', content: '数羊' }, { icon: '😶', content: '发呆' }, { icon: '🤔', content: '胡思乱想' }, { icon: '🦲', content: '头秃' }, { icon: '😪', content: '疲惫' }, { icon: '💔', content: '裂开' }, { icon: '🌤️', content: '等天晴' }, { icon: '⚡', content: '冲' }, { icon: '🧊', content: '融化' }] },
  { group: '工作学习', items: [{ icon: '💼', content: '忙' }, { icon: '🐟', content: '摸鱼' }, { icon: '🧱', content: '搬砖' }, { icon: '✈️', content: '出差' }, { icon: '📚', content: '沉迷学习' }, { icon: '🏃', content: '飞奔回家' }, { icon: '💻', content: '写代码' }] },
  { group: '活动', items: [{ icon: '📝', content: '打卡' }, { icon: '🍽️', content: '聚餐' }, { icon: '☕', content: '喝咖啡' }, { icon: '🍻', content: '喝酒' }, { icon: '🏋️', content: '运动' }, { icon: '🛍️', content: '买买买' }, { icon: '🧋', content: '喝奶茶' }, { icon: '🍚', content: '干饭' }, { icon: '👶', content: '带娃' }, { icon: '🦸', content: '拯救世界' }, { icon: '🌊', content: '浪' }] },
  { group: '休息', items: [{ icon: '🎧', content: '听歌' }, { icon: '📺', content: '追剧' }, { icon: '🍉', content: '吃瓜' }, { icon: '🎮', content: '玩游戏' }, { icon: '📱', content: '看直播' }, { icon: '😴', content: '睡觉' }, { icon: '🧘', content: '闭关' }, { icon: '🏠', content: '宅' }] },
]
