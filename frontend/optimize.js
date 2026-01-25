/* optimize.js */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 1. Конфигурация путей
const BASE_PATH = '/home/ivan/Downloads/portfolio_prod/portfolio-platform/frontend';
const FILES_TO_SCAN = [
  path.join(BASE_PATH, 'index.html'),
  path.join(BASE_PATH, 'styles.css')
];

// Поддерживаемые форматы для сжатия
const EXTENSIONS = ['.png', '.jpg', '.jpeg'];

// 2. Функция поиска путей к картинкам
function findImagesInContent(content, type) {
  const images = new Set();
  
  if (type === 'html') {
    // Ищем src="..."
    const regex = /<img[^>]+src=["']([^"']+)["']/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      images.add(match[1]);
    }
  } else if (type === 'css') {
    // Ищем url(...)
    const regex = /url\((['"]?)(.*?)\1\)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      images.add(match[1]);
    }
  }
  return Array.from(images);
}

// 3. Основная логика
async function main() {
  console.log('🚀 Начинаю сканирование файлов...');
  const allImages = new Set();

  // Сканируем файлы
  for (const filePath of FILES_TO_SCAN) {
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Файл не найден: ${filePath}`);
      continue;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.css' ? 'css' : 'html';
    
    const found = findImagesInContent(content, type);
    
    // Превращаем относительные пути в абсолютные
    found.forEach(relPath => {
      // Игнорируем внешние ссылки и data-uri
      if (relPath.startsWith('http') || relPath.startsWith('data:')) return;
      
      // Вычисляем полный путь. Для простоты считаем от корня frontend, 
      // но для CSS может потребоваться path.dirname(filePath)
      const absolutePath = path.resolve(path.dirname(filePath), relPath);
      allImages.add(absolutePath);
    });
  }

  console.log(`🔎 Найдено уникальных изображений: ${allImages.size}`);

  // Обрабатываем изображения
  for (const imgPath of allImages) {
    const ext = path.extname(imgPath).toLowerCase();
    
    // Пропускаем, если это не картинка или уже webp
    if (!EXTENSIONS.includes(ext)) continue;
    if (!fs.existsSync(imgPath)) {
      console.warn(`❌ Файл изображения не существует: ${imgPath}`);
      continue;
    }

    const webpPath = imgPath + '.webp'; // image.png -> image.png.webp

    // Проверяем, нужно ли обновлять (если исходник новее сжатой версии)
    let needConvert = true;
    if (fs.existsSync(webpPath)) {
      const statSrc = fs.statSync(imgPath);
      const statDest = fs.statSync(webpPath);
      if (statDest.mtime > statSrc.mtime) {
        needConvert = false;
      }
    }

    if (needConvert) {
      try {
        await sharp(imgPath)
          .webp({ quality: 80 }) // Качество 80%
          .toFile(webpPath);
        console.log(`✅ Сжато: ${path.basename(imgPath)} -> .webp`);
      } catch (err) {
        console.error(`💥 Ошибка сжатия ${path.basename(imgPath)}:`, err.message);
      }
    } else {
      console.log(`⏭️ Пропущено (актуально): ${path.basename(imgPath)}`);
    }
  }
  console.log('🎉 Готово!');
}

main();
