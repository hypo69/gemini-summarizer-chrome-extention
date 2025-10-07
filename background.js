// background.js

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "summarize-page",
    title: "Короче!",
    contexts: ["page"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "summarize-page") return;

  // Показываем индикатор напрямую на странице
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (msg) => {
      // Создаём индикатор
      const el = document.createElement('div');
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
    args: ["Короче! Думаю..."]
  });

  // Получаем текст
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body.innerText || document.documentElement.innerText
  }, (results) => {
    // Скрываем индикатор
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const el = document.getElementById('__gemini_indicator__');
        if (el) el.remove();
      }
    });

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

async function summarizeWithGemini(text, tabId) {
  const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
  if (!geminiApiKey) {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    return;
  }

  const prompt = `Сделай краткое и понятное резюме следующего текста:\n\n${text.substring(0, 10000)}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
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

    // Показываем модальное окно напрямую
    showSummaryOnPage(tabId, summary);

  } catch (error) {
    console.error("Ошибка при работе с Gemini:", error);
    let errorMsg = "Неизвестная ошибка";
    if (error && typeof error === 'object') {
      errorMsg = error.message || error.toString() || String(error);
    } else if (typeof error === 'string') {
      errorMsg = error;
    }
    showErrorOnPage(tabId, `Gemini: ${errorMsg.substring(0, 50)}`);
  }
}

function showErrorOnPage(tabId, message) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (msg) => {
      const el = document.createElement('div');
      el.id = '__gemini_indicator__';
      el.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(200, 0, 0, 0.9);
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
      setTimeout(() => {
        const e = document.getElementById('__gemini_indicator__');
        if (e) e.remove();
      }, 4000);
    },
    args: [message]
  });
}

function showSummaryOnPage(tabId, summary) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (summaryText) => {
      // Удаляем старое окно
      const old = document.getElementById('__gemini_modal_overlay__');
      if (old) old.remove();

      const overlay = document.createElement('div');
      overlay.id = '__gemini_modal_overlay__';
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
        box-sizing: border-box;
      `;

      const modal = document.createElement('div');
      modal.style.cssText = `
        background: white;
        border-radius: 12px;
        width: 100%;
        max-width: 600px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        overflow: hidden;
      `;

      const header = document.createElement('div');
      header.style.cssText = `
        padding: 16px 20px;
        background: #f8f9fa;
        font-weight: bold;
        font-size: 18px;
        color: #212529;
        border-bottom: 1px solid #e9ecef;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;
      header.innerHTML = `<span>Короче!</span><button id="__gemini_close__" style="background:none;border:none;font-size:24px;cursor:pointer;color:#6c757d;">&times;</button>`;

      const body = document.createElement('div');
      body.style.cssText = `
        padding: 20px;
        font-family: system-ui, sans-serif;
        font-size: 16px;
        line-height: 1.6;
        color: #212529;
        overflow-y: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
      `;
      body.textContent = summaryText;

      modal.appendChild(header);
      modal.appendChild(body);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      document.getElementById('__gemini_close__').onclick = () => {
        document.body.removeChild(overlay);
      };

      overlay.onclick = (e) => {
        if (e.target === overlay) document.body.removeChild(overlay);
      };

      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          document.body.removeChild(overlay);
          document.removeEventListener('keydown', handleEsc);
        }
      };
      document.addEventListener('keydown', handleEsc);
    },
    args: [summary]
  });
}