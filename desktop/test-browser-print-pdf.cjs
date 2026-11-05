'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createBrowserPdfExporter, getSafePrintContext, validatePdfOutputPath } = require('./browser-print-pdf.cjs');
const { assertTrustedAppSender } = require('./browser-ipc-security.cjs');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'earth-one-browser-print-test-'));
const appOrigin = 'http://127.0.0.1:43127';
const pdfBytes = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Pages /Count 2 /Kids [] >> endobj\n%%EOF\n', 'latin1');

function makeContents(url = 'http://127.0.0.1:43127/print') {
  let printCalls = 0;
  const contents = {
    mainFrame: { url },
    getURL: () => url,
    getTitle: () => 'Synthetic Print Fixture',
    isDestroyed: () => false,
    async printToPDF(options) {
      printCalls += 1;
      assert.deepEqual(options, { printBackground: true, preferCSSPageSize: true });
      return pdfBytes;
    },
    getPrintCalls: () => printCalls
  };
  return contents;
}

function createHarness({ contents = makeContents(), active = true, showSaveDialog } = {}) {
  const outputPath = path.join(testRoot, `export-${Math.random().toString(16).slice(2)}.pdf`);
  let activeNow = active;
  let dialogCalls = 0;
  const target = { tabId: 'tab_active', contents };
  const dialog = showSaveDialog || (async options => {
    assert.equal(options.title, '保存网页为 PDF');
    assert.equal(options.filters[0].extensions[0], 'pdf');
    return { canceled: false, filePath: outputPath };
  });
  const exporter = createBrowserPdfExporter({
    getActiveTarget: () => target,
    isTargetCurrent: candidate => activeNow && candidate === target,
    showSaveDialog: async options => {
      dialogCalls += 1;
      return dialog(options);
    },
    downloadsPath: testRoot
  });
  return {
    exporter,
    outputPath,
    target,
    contents,
    setActive(value) { activeNow = value; },
    getDialogCalls() { return dialogCalls; }
  };
}

async function main() {
  const trustedFrame = { url: `${appOrigin}/?module=browser` };
  trustedFrame.top = trustedFrame;
  const trustedContents = {};
  assert.doesNotThrow(() => assertTrustedAppSender({ sender: trustedContents, senderFrame: trustedFrame }, trustedContents, appOrigin));
  const foreignFrame = { url: 'http://127.0.0.1:43128/attacker' };
  foreignFrame.top = foreignFrame;
  assert.throws(
    () => assertTrustedAppSender({ sender: trustedContents, senderFrame: foreignFrame }, trustedContents, appOrigin),
    /非 EARTH ONE 来源/
  );

  for (const unsafeUrl of [
    'file:///tmp/private.html',
    'data:text/html,blocked',
    'javascript:alert(1)',
    'about:blank',
    'ftp://127.0.0.1/file',
    'http://user:password@127.0.0.1:43127/page'
  ]) {
    const unsafeContents = makeContents(unsafeUrl);
    assert.equal(getSafePrintContext(unsafeContents), null, `unsupported or credential URL must be rejected: ${unsafeUrl}`);
  }
  const crossOriginContents = makeContents('http://127.0.0.1:43127/page');
  crossOriginContents.mainFrame.url = 'http://127.0.0.1:43128/other-origin';
  assert.equal(getSafePrintContext(crossOriginContents), null, 'main-frame origin mismatch must be rejected');
  const destroyedContents = makeContents();
  destroyedContents.isDestroyed = () => true;
  assert.equal(getSafePrintContext(destroyedContents), null, 'destroyed WebContents must be rejected');

  const inactive = createHarness({ active: false });
  const inactiveResult = await inactive.exporter.saveActiveTab();
  assert.equal(inactiveResult.success, false);
  assert.equal(inactive.getDialogCalls(), 0, 'inactive or hidden tabs must be rejected before opening a dialog');
  assert.equal(inactive.contents.getPrintCalls(), 0);

  const cancelledContents = makeContents();
  const cancelled = createHarness({
    contents: cancelledContents,
    showSaveDialog: async () => ({ canceled: true })
  });
  const cancelledResult = await cancelled.exporter.saveActiveTab();
  assert.deepEqual(cancelledResult, { success: false, cancelled: true });
  assert.equal(cancelledContents.getPrintCalls(), 0, 'dialog cancellation must not generate a PDF');
  assert.equal(fs.existsSync(cancelled.outputPath), false, 'dialog cancellation must not write a file');

  const invalidPathContents = makeContents();
  const invalidPath = createHarness({
    contents: invalidPathContents,
    showSaveDialog: async () => ({ canceled: false, filePath: 'relative.pdf' })
  });
  const invalidPathResult = await invalidPath.exporter.saveActiveTab();
  assert.equal(invalidPathResult.success, false);
  assert.equal(invalidPathContents.getPrintCalls(), 0, 'invalid destinations must be rejected before printToPDF');
  assert.equal(await validatePdfOutputPath(`${invalidPath.outputPath}\u0000.pdf`), null, 'NUL paths must be rejected');
  assert.equal(await validatePdfOutputPath(path.join(testRoot, 'not-a-pdf.txt')), null, 'non-PDF paths must be rejected');
  assert.equal(await validatePdfOutputPath('\\\\server\\share\\print.pdf', { pathApi: path.win32 }), null, 'network-share paths must be rejected');
  assert.equal(await validatePdfOutputPath(testRoot), null, 'directories cannot be PDF targets');

  const symlinkTarget = path.join(testRoot, 'symlink-target.pdf');
  const symlinkPath = path.join(testRoot, 'symlink.pdf');
  fs.writeFileSync(symlinkTarget, 'unchanged');
  fs.symlinkSync(symlinkTarget, symlinkPath);
  assert.equal(await validatePdfOutputPath(symlinkPath), null, 'symlink output paths must be rejected');

  let finishDialog;
  const switchedContents = makeContents();
  const switched = createHarness({
    contents: switchedContents,
    showSaveDialog: () => new Promise(resolve => { finishDialog = resolve; })
  });
  const pendingPrint = switched.exporter.saveActiveTab();
  await new Promise(resolve => setImmediate(resolve));
  switched.setActive(false);
  finishDialog({ canceled: false, filePath: switched.outputPath });
  const switchedResult = await pendingPrint;
  assert.equal(switchedResult.success, false, 'a tab switch while the native dialog is open must abort printing');
  assert.equal(switchedContents.getPrintCalls(), 0);
  assert.equal(fs.existsSync(switched.outputPath), false);

  const success = createHarness();
  const successResult = await success.exporter.saveActiveTab();
  assert.deepEqual(successResult, { success: true }, 'success must not return a local file path to the renderer');
  const savedPdf = fs.readFileSync(success.outputPath);
  assert.equal(savedPdf.subarray(0, 5).toString('ascii'), '%PDF-', 'saved output must have a PDF header');
  const syntheticPageTree = savedPdf.toString('latin1').match(/\/Type\s*\/Pages\b[\s\S]{0,128}?\/Count\s+(\d+)/);
  assert.equal(Number(syntheticPageTree?.[1]), 2, 'the local synthetic PDF fixture must preserve its two-page tree');
  assert.equal(success.contents.getPrintCalls(), 1);
  assert.equal(fs.readdirSync(testRoot).some(name => name.endsWith('.tmp')), false, 'atomic writer must remove temporary files');

  const preloadSource = fs.readFileSync(path.join(__dirname, 'preload.cjs'), 'utf8');
  const invokeCalls = [];
  let exposedApi;
  const fakeElectron = {
    contextBridge: { exposeInMainWorld: (_name, api) => { exposedApi = api; } },
    ipcRenderer: {
      invoke: (...args) => { invokeCalls.push(args); return Promise.resolve({ success: true }); },
      on() {},
      removeListener() {}
    }
  };
  vm.runInNewContext(preloadSource, {
    require: name => name === 'electron' ? fakeElectron : require(name),
    Promise
  }, { filename: 'preload.cjs' });
  await exposedApi.printToPdf('/renderer/forged.pdf', 'tab_someone_else');
  assert.deepEqual(invokeCalls, [['browser:print-to-pdf']], 'the renderer bridge must send no path, URL, or tab ID');

  console.log('BROWSER_PRINT_PDF_UNIT_PASS: exact app-origin boundary, active-tab recheck, unsupported schemes, dialog cancellation, path validation, renderer-independent save path, atomic PDF bytes and page tree verified.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  try { fs.rmSync(testRoot, { recursive: true, force: true }); } catch {}
});
