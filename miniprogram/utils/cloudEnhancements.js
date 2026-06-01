function hasCloud() {
  return !!(typeof wx !== 'undefined' && wx.cloud);
}

function normalizeError(error) {
  if (!error) return 'unknown cloud error';
  return error.message || error.errMsg || String(error);
}

function uploadFileSafe(cloudPath, filePath) {
  return new Promise(resolve => {
    if (!hasCloud()) {
      resolve({ ok: false, error: 'cloud unavailable' });
      return;
    }
    try {
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: res => resolve({ ok: true, data: res.fileID || res }),
        fail: err => resolve({ ok: false, error: normalizeError(err) })
      });
    } catch (e) {
      resolve({ ok: false, error: normalizeError(e) });
    }
  });
}

function callFunctionSafe(name, data) {
  return new Promise(resolve => {
    if (!hasCloud()) {
      resolve({ ok: false, error: 'cloud unavailable' });
      return;
    }
    try {
      wx.cloud.callFunction({
        name,
        data,
        success: res => {
          const result = res.result || {};
          if (result.success) {
            resolve({ ok: true, data: result.data, meta: result.meta || {} });
          } else {
            resolve({ ok: false, data: result.data || null, error: result.error || 'cloud function failed', meta: result.meta || {} });
          }
        },
        fail: err => resolve({ ok: false, error: normalizeError(err) })
      });
    } catch (e) {
      resolve({ ok: false, error: normalizeError(e) });
    }
  });
}

function addDocumentSafe(collection, data) {
  return new Promise(resolve => {
    if (!hasCloud()) {
      resolve({ ok: false, error: 'cloud unavailable' });
      return;
    }
    try {
      wx.cloud.database().collection(collection).add({
        data,
        success: res => resolve({ ok: true, data: res }),
        fail: err => resolve({ ok: false, error: normalizeError(err) })
      });
    } catch (e) {
      resolve({ ok: false, error: normalizeError(e) });
    }
  });
}

function updateDocumentSafe(collection, id, data) {
  return new Promise(resolve => {
    if (!hasCloud()) {
      resolve({ ok: false, error: 'cloud unavailable' });
      return;
    }
    try {
      wx.cloud.database().collection(collection).doc(id).update({
        data,
        success: res => resolve({ ok: true, data: res }),
        fail: err => resolve({ ok: false, error: normalizeError(err) })
      });
    } catch (e) {
      resolve({ ok: false, error: normalizeError(e) });
    }
  });
}

module.exports = {
  uploadFileSafe,
  callFunctionSafe,
  addDocumentSafe,
  updateDocumentSafe
};
