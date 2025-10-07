document.getElementById('save').addEventListener('click', async () => {
  const key = document.getElementById('apiKey').value.trim();
  if (key) {
    await chrome.storage.sync.set({ geminiApiKey: key });
    window.close();
  } else {
    alert("Пожалуйста, введите API-ключ.");
  }
});

chrome.storage.sync.get(['geminiApiKey'], (result) => {
  if (result.geminiApiKey) {
    document.getElementById('apiKey').value = result.geminiApiKey;
  }
});