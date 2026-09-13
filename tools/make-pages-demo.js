'use strict';
/**
 * Собирает содержимое ветки gh-pages из main.
 *
 * Сайт написан для размещения в КОРНЕ домена (все внутренние ссылки и пути
 * к ассетам — абсолютные, вида "/assets/..."). GitHub Pages для обычного
 * репозитория отдаёт содержимое ветки не с корня домена, а с подпути
 * "/<имя-репозитория>/" — поэтому при показе демо на GitHub Pages браузер
 * резолвит "/assets/..." в корень домена (username.github.io/assets/...),
 * а не в подпуть, и все стили/скрипты/картинки не находятся (404).
 *
 * Этот скрипт копирует сайт в отдельную папку и добавляет префикс BASE
 * («/<имя-репозитория>») ко всем внутренним абсолютным href/src/action в
 * HTML и к путям в site.webmanifest — только для демо-ветки gh-pages.
 * Реальный хостинг (ветка main) остаётся с путями от корня домена, как и
 * задумано в ТЗ.
 *
 * Использование (из корня проекта):
 *   node tools/make-pages-demo.js <путь-для-сборки>
 *
 * Как обновить демо на GitHub Pages после изменений в main:
 *   1. node tools/make-pages-demo.js ../lmz-pages-build
 *   2. git checkout gh-pages
 *   3. Удалить всё содержимое рабочей копии, кроме .git
 *   4. Скопировать содержимое ../lmz-pages-build обратно в корень проекта
 *   5. git add -A && git commit -m "Update Pages demo" && git push origin gh-pages
 *   6. git checkout main
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..');
const DEST = process.argv[2];
const REPO_NAME = 'lmz-omsk-site'; // должно совпадать с именем репозитория на GitHub
const BASE = '/' + REPO_NAME;

if (!DEST) {
  console.error('usage: node tools/make-pages-demo.js <destDir>');
  process.exit(1);
}

const SKIP_DIRS = new Set(['.git', 'mail', 'tools', 'node_modules']);
const SKIP_FILES = new Set(['.gitignore']);

function copyRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      copyRecursive(path.join(srcDir, entry.name), path.join(destDir, entry.name));
    } else {
      if (SKIP_FILES.has(entry.name)) continue;
      const srcFile = path.join(srcDir, entry.name);
      const destFile = path.join(destDir, entry.name);
      if (entry.name.endsWith('.html')) {
        let html = fs.readFileSync(srcFile, 'utf8');
        html = html.replace(/(href|src|action)="(\/(?!\/)[^"]*)"/g, (m, attr, p) => `${attr}="${BASE}${p}"`);
        fs.writeFileSync(destFile, html, 'utf8');
      } else if (entry.name === 'site.webmanifest') {
        let json = fs.readFileSync(srcFile, 'utf8');
        json = json.replace(/"start_url":\s*"\/"/, `"start_url": "${BASE}/"`);
        json = json.replace(/"src":\s*"(\/[^"]*)"/g, (m, p) => `"src": "${BASE}${p}"`);
        fs.writeFileSync(destFile, json, 'utf8');
      } else {
        fs.copyFileSync(srcFile, destFile);
      }
    }
  }
}

fs.rmSync(DEST, { recursive: true, force: true });
copyRecursive(SRC, DEST);
fs.writeFileSync(path.join(DEST, '.nojekyll'), '');
console.log('Pages demo build written to', DEST, 'with base', BASE);
