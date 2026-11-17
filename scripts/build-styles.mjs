// 把 styles.css 内联成 TS 常量：宿主项目无需任何 CSS 构建配置，组件运行时注入
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const out = `// 由 scripts/build-styles.mjs 从 styles.css 生成，勿手改\nexport const DEV_PICKER_CSS = ${JSON.stringify(css)};\n`;
writeFileSync(join(root, 'src/styles.generated.ts'), out);
console.log(`styles.generated.ts: ${css.length} bytes`);
