document.getElementById('save').addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const model = document.getElementById('model').value;

    if (!apiKey) {
        alert("Пожалуйста, введите API-ключ.");
        return;
    }

    await chrome.storage.sync.set({
        geminiApiKey: apiKey,
        geminiModel: model
    });

    window.close();
});

document.getElementById('more').addEventListener('click', async () => {
    // Получаем активную вкладку
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Передаём URL и ID вкладки в чат-окно
    const url = new URL(chrome.runtime.getURL('chat.html'));
    url.searchParams.set('tabId', tab.id);
    url.searchParams.set('url', encodeURIComponent(tab.url));

    // Открываем новую вкладку
    chrome.tabs.create({ url: url.toString() });
});

// Загрузка сохранённых значений
chrome.storage.sync.get(['geminiApiKey', 'geminiModel'], (result) => {
    if (result.geminiApiKey) {
        document.getElementById('apiKey').value = result.geminiApiKey;
    }
    if (result.geminiModel) {
        document.getElementById('model').value = result.geminiModel;
    }
});