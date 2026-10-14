// Toggle the overlay when the toolbar icon (or Alt+Shift+D) is used.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "toggle" });
  } catch (e) {
    // Content script not present (tab opened before install) -> inject it.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tab.id, { type: "toggle" });
    } catch (err) {
      console.warn("Can't run on this page (e.g. chrome:// or Web Store):", err);
    }
  }
});
