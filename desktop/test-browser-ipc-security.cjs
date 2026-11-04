'use strict';

const assert = require('node:assert/strict');
const { assertTrustedAppSender } = require('./browser-ipc-security.cjs');

const appOrigin = 'http://127.0.0.1:43127';
const appContents = {};
const otherContents = {};
const topFrame = { url: `${appOrigin}/?module=browser` };
topFrame.top = topFrame;

assert.doesNotThrow(() => assertTrustedAppSender({ sender: appContents, senderFrame: topFrame }, appContents, appOrigin));
assert.throws(() => assertTrustedAppSender({ sender: otherContents, senderFrame: topFrame }, appContents, appOrigin), /非 EARTH ONE 界面/);
assert.throws(() => assertTrustedAppSender({ sender: appContents }, appContents, appOrigin), /非 EARTH ONE 界面/);

const childFrame = { url: `${appOrigin}/embedded` };
childFrame.top = topFrame;
assert.throws(() => assertTrustedAppSender({ sender: appContents, senderFrame: childFrame }, appContents, appOrigin), /嵌入式框架/);

const wrongOriginFrame = { url: 'http://127.0.0.1:43128/attacker' };
wrongOriginFrame.top = wrongOriginFrame;
assert.throws(() => assertTrustedAppSender({ sender: appContents, senderFrame: wrongOriginFrame }, appContents, appOrigin), /非 EARTH ONE 来源/);

const malformedFrame = { url: 'not a valid absolute URL' };
malformedFrame.top = malformedFrame;
assert.throws(() => assertTrustedAppSender({ sender: appContents, senderFrame: malformedFrame }, appContents, appOrigin), /无法验证/);
assert.throws(() => assertTrustedAppSender({ sender: appContents, senderFrame: topFrame }, appContents, null), /非 EARTH ONE 来源/);

console.log('BROWSER_IPC_SECURITY_TEST_PASS: exact WebContents, top-frame, and application-origin checks reject unrelated callers.');
