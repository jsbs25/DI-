'use strict';

function assertTrustedAppSender(event, mainContents, appOrigin) {
  if (!mainContents || !event || event.sender !== mainContents || !event.senderFrame) {
    throw new Error('拒绝来自非 EARTH ONE 界面的浏览器控制请求。');
  }
  if (event.senderFrame.top !== event.senderFrame) {
    throw new Error('拒绝来自嵌入式框架的浏览器控制请求。');
  }

  let senderOrigin;
  try {
    senderOrigin = new URL(event.senderFrame.url).origin;
  } catch {
    throw new Error('无法验证浏览器控制请求来源。');
  }
  if (typeof appOrigin !== 'string' || senderOrigin !== appOrigin) {
    throw new Error('拒绝来自非 EARTH ONE 来源的浏览器控制请求。');
  }
}

module.exports = { assertTrustedAppSender };
