const cloud = require('./cloudEnhancements');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function testMissingCloudReturnsOkFalse() {
  global.wx = {};
  const result = await cloud.callFunctionSafe('skinDiaryAnalysis', {});
  assert(result.ok === false, 'missing wx.cloud should return ok false');
  assert(result.error.includes('cloud unavailable'), 'error should explain cloud unavailable');
}

async function testUploadFailureDoesNotThrow() {
  global.wx = {
    cloud: {
      uploadFile(options) {
        options.fail(new Error('upload failed'));
      }
    }
  };
  const result = await cloud.uploadFileSafe('x/y.jpg', 'tmp/a.jpg');
  assert(result.ok === false, 'upload failure should return ok false');
}

async function testCallFunctionSuccessShape() {
  global.wx = {
    cloud: {
      callFunction(options) {
        options.success({ result: { success: true, data: { ok: 1 } } });
      }
    }
  };
  const result = await cloud.callFunctionSafe('buyingConsultation', { productName: 'test' });
  assert(result.ok === true, 'function success should return ok true');
  assert(result.data.ok === 1, 'function data should unwrap result data');
}

(async () => {
  await testMissingCloudReturnsOkFalse();
  await testUploadFailureDoesNotThrow();
  await testCallFunctionSuccessShape();
  console.log('cloudEnhancements tests passed');
})();
