console.log("闲鱼助手 v1.2 已加载 - 严格过滤版");

function init() {
  if (document.getElementById('xianyu-scraper-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'xianyu-scraper-btn';
  btn.innerText = '下载商品资料';
  btn.style.cssText = `
    position: fixed;
    right: 20px;
    top: 100px;
    z-index: 9999;
    padding: 10px 20px;
    background-color: #ffda00;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-weight: bold;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;

  btn.onclick = async () => {
    window.scrollBy(0, 100);
    setTimeout(() => window.scrollBy(0, -100), 100);
    await new Promise(r => setTimeout(r, 500));
    const data = grabData();
    await downloadAsZip(data.images, data.description);
  };

  document.body.appendChild(btn);
}

function grabData() {
  // 1. 抓取描述
  let description = "";
  const infoContainer = document.querySelector('div[class*="item-main-info"]');
  if (infoContainer) {
    const descEl = infoContainer.querySelector('div[class*="main--"]');
    if (descEl) {
      description = descEl.innerText.trim();
    }
  }

  // 2. 抓取图片 - 优先使用主图画廊，避免重复
  let images = [];

  // 策略 A: 锁定主图画廊容器 (item-main-window) - 包含所有高清图
  const mainGallery = document.querySelector('div[class*="item-main-window"]');
  if (mainGallery) {
    const imgs = mainGallery.querySelectorAll('img');
    console.log(`主图画廊容器找到 ${imgs.length} 个img元素`);
    imgs.forEach((img, index) => {
      const url = img.src || img.getAttribute('data-src') || img.getAttribute('srcset');
      console.log(`  [${index}] URL: ${url}`);
      if (url && url.includes('alicdn.com')) images.push(url);
    });
    console.log(`从主图画廊抓取到 ${images.length} 张图片`);
  }

  // 策略 B: 如果主图画廊没有图片，才使用左侧缩略图容器
  if (images.length === 0) {
    const sideGallery = document.querySelector('div[class*="side-container"]');
    if (sideGallery) {
      const imgs = sideGallery.querySelectorAll('img');
      console.log(`缩略图容器找到 ${imgs.length} 个img元素`);
      imgs.forEach((img, index) => {
        const url = img.src || img.getAttribute('data-src');
        console.log(`  [${index}] URL: ${url}`);
        if (url && url.includes('alicdn.com')) images.push(url);
      });
      console.log(`从缩略图容器抓取到 ${images.length} 张图片`);
    }
  }

  // 策略 C: 兜底扫描，但严格排除推荐位容器
  if (images.length === 0) {
    const allImgs = document.querySelectorAll('img');
    console.log(`兜底扫描找到 ${allImgs.length} 个img元素`);
    allImgs.forEach((img, index) => {
      // 检查图片是否在推荐位容器内
      const isInsideFeeds = img.closest('div[class*="feeds"]') || img.closest('div[class*="recommend"]');
      if (isInsideFeeds) return; // 跳过推荐位图片

      const rect = img.getBoundingClientRect();
      const url = img.src || img.getAttribute('data-src');
      // 限制在页面上半部分 (Top < 800) 且宽度较大
      if (url && url.includes('alicdn.com') && url.includes('fleamarket') && rect.top < 800 && rect.width > 50) {
        console.log(`  [${index}] URL: ${url}, Top: ${rect.top}, Width: ${rect.width}`);
        images.push(url);
      }
    });
    console.log(`从兜底扫描抓取到 ${images.length} 张图片`);
  }

  // 3. 处理图片 URL，获取高清原图并去重
  const processedImages = images.map(url => {
    let cleanUrl = url.split(' ')[0];
    const jpgMatch = cleanUrl.match(/.*\.jpg/i);
    const pngMatch = cleanUrl.match(/.*\.png/i);
    if (jpgMatch) return jpgMatch[0];
    if (pngMatch) return pngMatch[0];
    return cleanUrl;
  });

  // 更智能的去重逻辑：提取图片ID进行去重
  const imageMap = new Map();
  processedImages.forEach(url => {
    if (!url.startsWith('http')) return;
    
    // 提取图片ID：去掉URL中的所有尺寸参数和查询参数
    let imageId = url;
    
    // 移除查询参数
    imageId = imageId.split('?')[0];
    
    // 移除所有尺寸参数（如 _220x10000Q90.jpg_.webp, _790x10000Q90.jpg_.webp, _Q90.jpg_.webp）
    // 匹配模式：_数字x数字Q数字.jpg_.webp 或 _Q数字.jpg_.webp
    imageId = imageId.replace(/_\d+x\d+Q\d+\.jpg(_\.webp)?$/i, '.jpg');
    imageId = imageId.replace(/_Q\d+\.jpg(_\.webp)?$/i, '.jpg');
    
    // 移除其他常见参数（如 _.webp, _progressive）
    imageId = imageId.replace(/_\.webp$/i, '');
    imageId = imageId.replace(/_progressive$/i, '');
    
    // 如果这个ID还没出现过，添加到结果中
    if (!imageMap.has(imageId)) {
      imageMap.set(imageId, url);
    } else {
      console.log(`发现重复图片，已跳过: ${imageId}`);
    }
  });

  const uniqueImages = Array.from(imageMap.values());

  console.log(`原始图片数: ${images.length}, 去重后: ${uniqueImages.length}`);

  return { description, images: uniqueImages };
}

async function downloadAsZip(images, description) {
  if (typeof JSZip === 'undefined') {
    alert('JSZip 库未加载，请刷新页面重试');
    return;
  }

  // 创建临时进度提示
  let progressDiv = document.getElementById('xianyu-progress');
  if (!progressDiv) {
    progressDiv = document.createElement('div');
    progressDiv.id = 'xianyu-progress';
    progressDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 20px 40px;
      border-radius: 10px;
      z-index: 10000;
      font-size: 16px;
      font-family: sans-serif;
    `;
    document.body.appendChild(progressDiv);
  }
  progressDiv.innerText = '正在准备下载...';

  const zip = new JSZip();
  const folder = zip.folder("xianyu_images");

  try {
    // 添加描述文件
    if (description) {
      folder.file("商品描述.txt", description);
    }

    let successCount = 0;
    const promises = images.map(async (url, i) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network error');
        const blob = await response.blob();
        const extension = url.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
        folder.file(`image_${i + 1}.${extension}`, blob);
        successCount++;
        progressDiv.innerText = `正在下载 (${successCount}/${images.length})...`;
      } catch (e) {
        console.error(`Failed: ${url}`, e);
      }
    });

    await Promise.all(promises);

    if (successCount === 0) {
      alert('下载失败，可能是跨域限制。');
      progressDiv.remove();
      return;
    }

    progressDiv.innerText = '正在生成压缩包...';
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `闲鱼商品图片_${new Date().getTime()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    progressDiv.innerText = '下载成功！';
    setTimeout(() => progressDiv.remove(), 2000);
  } catch (error) {
    console.error(error);
    alert('打包下载失败。');
    progressDiv.remove();
  }
}

function showModal(data) {
  const oldModal = document.getElementById('xianyu-scraper-modal');
  if (oldModal) oldModal.remove();

  const modal = document.createElement('div');
  modal.id = 'xianyu-scraper-modal';
  modal.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80%; max-height: 80%; background: white; z-index: 10000; padding: 20px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.5); overflow-y: auto; font-family: sans-serif;`;

  const closeBtn = document.createElement('button');
  closeBtn.innerText = '✕';
  closeBtn.onclick = () => modal.remove();
  closeBtn.style.cssText = `float: right; border: none; background: none; font-size: 24px; cursor: pointer; color: #999;`;

  const title = document.createElement('h2');
  title.innerText = '抓取结果';
  title.style.marginTop = '0';

  // 显示版本号
  const versionInfo = document.createElement('div');
  versionInfo.style.cssText = `font-size: 12px; color: #999; margin-bottom: 15px;`;
  versionInfo.innerText = '闲鱼助手 v1.2';

  const descContent = document.createElement('div');
  descContent.innerText = data.description || "未找到描述";
  descContent.style.cssText = `white-space: pre-wrap; background: #f9f9f9; padding: 15px; border-radius: 5px; border: 1px solid #eee; max-height: 150px; overflow-y: auto; margin-bottom: 10px;`;

  const copyDescBtn = document.createElement('button');
  copyDescBtn.innerText = '复制描述';
  copyDescBtn.style.cssText = `padding: 5px 15px; background: #ffda00; border: none; border-radius: 3px; cursor: pointer; margin-bottom: 20px;`;
  copyDescBtn.onclick = () => {
    navigator.clipboard.writeText(data.description);
    copyDescBtn.innerText = '已复制！';
    setTimeout(() => copyDescBtn.innerText = '复制描述', 2000);
  };

  const imgContainer = document.createElement('div');
  imgContainer.style.display = 'grid';
  imgContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(120px, 1fr))';
  imgContainer.style.gap = '10px';

  data.images.forEach(src => {
    const img = document.createElement('img');
    img.src = src;
    img.style.width = '100%';
    img.style.height = '120px';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '5px';
    imgContainer.appendChild(img);
  });

  const zipBtn = document.createElement('button');
  zipBtn.id = 'xianyu-zip-btn';
  zipBtn.innerText = '打包下载所有图片 (ZIP)';
  zipBtn.style.cssText = `display: block; width: 100%; margin-top: 30px; padding: 15px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: bold;`;
  zipBtn.onclick = () => downloadAsZip(data.images, data.description);

  modal.appendChild(closeBtn);
  modal.appendChild(title);
  modal.appendChild(versionInfo);
  modal.appendChild(descContent);
  modal.appendChild(copyDescBtn);
  modal.appendChild(imgContainer);
  modal.appendChild(zipBtn);

  document.body.appendChild(modal);
}

let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    init();
  }
}, 1000);

init();
