'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function parseHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 4096 || value.includes('\u0000')) return null;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getSafePrintContext(contents) {
  if (!contents || typeof contents.isDestroyed !== 'function' || contents.isDestroyed() ||
      typeof contents.getURL !== 'function' || typeof contents.printToPDF !== 'function') return null;
  let url;
  let mainFrameUrl;
  try {
    url = parseHttpUrl(contents.getURL());
    mainFrameUrl = parseHttpUrl(contents.mainFrame?.url);
  } catch {
    return null;
  }
  if (!url || !mainFrameUrl || url.origin !== mainFrameUrl.origin) return null;
  let title = '';
  try { title = contents.getTitle() || ''; } catch {}
  return { url: url.href, origin: url.origin, title };
}

function sanitizePdfFilename(title) {
  const safe = String(title || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 100);
  return `${safe || '网页'}.pdf`;
}

async function validatePdfOutputPath(filePath, { fsPromises = fs.promises, pathApi = path } = {}) {
  if (typeof filePath !== 'string' || !filePath || filePath.includes('\u0000') || !pathApi.isAbsolute(filePath) ||
      pathApi.extname(filePath).toLowerCase() !== '.pdf') return null;
  if (pathApi.sep === '\\' && filePath.replace(/\//g, '\\').startsWith('\\\\')) return null;
  const absolutePath = pathApi.resolve(filePath);
  const basename = pathApi.basename(absolutePath);
  if (!basename || basename === '.' || basename === '..') return null;
  try {
    const directoryStat = await fsPromises.stat(pathApi.dirname(absolutePath));
    if (!directoryStat.isDirectory()) return null;
  } catch {
    return null;
  }
  try {
    const destinationStat = await fsPromises.lstat(absolutePath);
    if (!destinationStat.isFile() || destinationStat.isSymbolicLink()) return null;
  } catch (error) {
    if (error?.code !== 'ENOENT') return null;
  }
  return absolutePath;
}

async function writePdfAtomically(filePath, bytes, {
  fsPromises = fs.promises,
  pathApi = path,
  makeId = randomUUID
} = {}) {
  if (!Buffer.isBuffer(bytes) || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new TypeError('无效的 PDF 数据。');
  }
  const temporaryPath = pathApi.join(pathApi.dirname(filePath), `.earth-one-pdf-${makeId()}.tmp`);
  let handle = null;
  try {
    handle = await fsPromises.open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await fsPromises.rename(temporaryPath, filePath);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fsPromises.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

function createBrowserPdfExporter({
  getActiveTarget,
  isTargetCurrent,
  showSaveDialog,
  downloadsPath,
  fsPromises = fs.promises,
  pathApi = path,
  makeId = randomUUID
}) {
  if (typeof getActiveTarget !== 'function' || typeof isTargetCurrent !== 'function' ||
      typeof showSaveDialog !== 'function' || typeof downloadsPath !== 'string') {
    throw new TypeError('PDF 导出器缺少必要的主进程依赖。');
  }

  async function saveActiveTab() {
    let target;
    try { target = getActiveTarget(); } catch {}
    const contents = target?.contents;
    const initialContext = getSafePrintContext(contents);
    if (!target || !initialContext || !isTargetCurrent(target)) {
      return { success: false, error: '当前没有可打印的活动 Chromium 网页。' };
    }

    const defaultPath = pathApi.join(downloadsPath, sanitizePdfFilename(initialContext.title));
    let selection;
    try {
      selection = await showSaveDialog({
        title: '保存网页为 PDF',
        defaultPath,
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }]
      });
    } catch {
      return { success: false, error: '无法打开 PDF 保存对话框。' };
    }
    if (!selection || selection.canceled || typeof selection.filePath !== 'string') {
      return { success: false, cancelled: true };
    }

    const outputPath = await validatePdfOutputPath(selection.filePath, { fsPromises, pathApi });
    if (!outputPath) return { success: false, error: '所选保存位置无效；请选择本机上的 .pdf 文件。' };

    const contextAfterDialog = getSafePrintContext(contents);
    if (!isTargetCurrent(target) || !contextAfterDialog || contextAfterDialog.url !== initialContext.url) {
      return { success: false, error: '活动网页已变化；未生成 PDF。' };
    }

    let bytes;
    try {
      bytes = await contents.printToPDF({ printBackground: true, preferCSSPageSize: true });
    } catch {
      return { success: false, error: 'Chromium 无法生成此网页的 PDF。' };
    }
    if (!Buffer.isBuffer(bytes) || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      return { success: false, error: 'Chromium 返回的 PDF 数据无效。' };
    }

    const contextAfterPrint = getSafePrintContext(contents);
    if (!isTargetCurrent(target) || !contextAfterPrint || contextAfterPrint.url !== initialContext.url) {
      return { success: false, error: '活动网页已变化；PDF 未保存。' };
    }

    try {
      await writePdfAtomically(outputPath, bytes, { fsPromises, pathApi, makeId });
      return { success: true };
    } catch {
      return { success: false, error: '无法将 PDF 保存到所选位置。' };
    }
  }

  return { saveActiveTab };
}

module.exports = {
  createBrowserPdfExporter,
  getSafePrintContext,
  sanitizePdfFilename,
  validatePdfOutputPath,
  writePdfAtomically
};
