// background.js

// Обработчик сообщений от content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "openChat") {
        chrome.tabs.create({ url: chrome.runtime.getURL('chat.html') });
    }
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "summarize-page",
        title: "Короче!",
        contexts: ["page"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== "summarize-page") return;

    showIndicatorOnPage(tab.id, "Короче! Думаю...");

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.body.innerText || document.documentElement.innerText
    }, (results) => {
        hideIndicatorOnPage(tab.id);

        if (chrome.runtime.lastError) {
            showErrorOnPage(tab.id, "Не удалось получить текст");
            return;
        }

        const text = results?.[0]?.result;
        if (!text || text.trim().length < 10) {
            showErrorOnPage(tab.id, "Страница пуста");
            return;
        }

        summarizeWithGemini(text, tab.id);
    });
});

// --- Индикатор напрямую на странице ---
function showIndicatorOnPage(tabId, message) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (msg) => {
            let el = document.getElementById('__gemini_indicator__');
            if (el) el.remove();
            el = document.createElement('div');
            el.id = '__gemini_indicator__';
            el.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0,0,0,0.88);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 320px;
        text-align: center;
        pointer-events: none;
      `;
            el.textContent = msg;
            document.body.appendChild(el);
        },
        args: [message]
    });
}

function hideIndicatorOnPage(tabId) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
            const el = document.getElementById('__gemini_indicator__');
            if (el) el.remove();
        }
    });
}

function showErrorOnPage(tabId, message) {
    showIndicatorOnPage(tabId, message);
    setTimeout(() => hideIndicatorOnPage(tabId), 4000);
}

// --- Работа с Gemini ---
async function summarizeWithGemini(text, tabId) {
    const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
    if (!geminiApiKey) {
        chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
        return;
    }

    const prompt = `Сделай краткое и понятное резюме следующего текста:\n\n${text.substring(0, 10000)}`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, // ← ИСПРАВЛЕНО: убраны пробелы
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            }
        );

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || "Ошибка Gemini API");
        }

        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!summary) {
            throw new Error("Пустой ответ от модели");
        }

        // Показываем модальное окно через content.js (но с проверкой)
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => !!window.__gemini_content_script_loaded
        }, (results) => {
            if (results?.[0]?.result) {
                chrome.tabs.sendMessage(tabId, { action: "showSummary", summary });
            } else {
                showSummaryDirectly(tabId, summary);
            }
        });

    } catch (error) {
        console.error("Ошибка Gemini:", error);
        let msg = error.message || "Неизвестная ошибка";
        showErrorOnPage(tabId, `Gemini: ${msg.substring(0, 50)}`); // ← ИСПРАВЛЕНО: tabId вместо tab.id
    }
}

// Резерв: показ модального окна напрямую
function showSummaryDirectly(tabId, summary) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (text) => {
            const old = document.getElementById('__gemini_modal_fallback__');
            if (old) old.remove();

            const overlay = document.createElement('div');
            overlay.id = '__gemini_modal_fallback__';
            overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.6);
        z-index: 2147483646;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
      `;
            const modal = document.createElement('div');
            modal.style.cssText = `
        background: white;
        border-radius: 12px;
        width: 100%;
        max-width: 600px;
        max-height: 80vh;
        padding: 20px;
        font-family: system-ui, sans-serif;
        overflow: auto;
      `;
            modal.textContent = text;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const close = () => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            };
            overlay.onclick = close;
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        },
        args: [summary]
    });
}