import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const preview = await readFile(new URL('../../front/components/UploadImagePreview.vue', import.meta.url), 'utf8');

// 取出编辑态的删除按钮整块做断言，避免误判文件其它位置的同名类
const button = preview.match(/<button\b[^>]*aria-label="移除图片"[\s\S]*?<\/button>/);
assert.ok(button, '编辑态图片必须有移除按钮');
const [block] = button;

// 浮层必须透明：原先的不透明白块压在照片上很突兀
assert.doesNotMatch(block, /bg-white/, '删除按钮不得使用不透明白底');
assert.match(block, /bg-black\/\d+/, '删除按钮必须是半透明深色浮层以透出照片');
assert.match(block, /backdrop-blur/, '半透明浮层需要背景模糊保证图标可读');

// 点击必须有过渡动画（原实现无 transition，点击毫无反馈）
assert.match(block, /transition\b/, '删除按钮必须有过渡动画');
assert.match(block, /active:scale-\d+/, '删除按钮必须有按下缩放反馈');
assert.match(block, /hover:bg-red-/, '删除按钮悬停必须有危险色提示');

// 减少动效偏好
assert.match(block, /motion-reduce:transition-none/, '必须尊重减少动态效果偏好');
assert.match(block, /motion-reduce:active:scale-100/, '减少动效时不得缩放');

// 可达性：div 点击式改为 button，获得键盘与焦点支持
assert.match(block, /type="button"/, '删除按钮必须是 button 而非 div');
assert.match(block, /aria-label="移除图片"/, '删除按钮必须有可访问名称');
assert.match(block, /focus-visible:outline/, '删除按钮必须有可见焦点样式');

console.log('image-preview-delete-button: PASS');
