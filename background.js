chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadImages') {
    request.images.forEach((url, index) => {
      const filename = `xianyu_images/image_${index + 1}.jpg`;
      chrome.downloads.download({
        url: url,
        filename: filename,
        conflictAction: 'uniquify'
      });
    });
    sendResponse({ status: 'started' });
  }
  return true;
});
