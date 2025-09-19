document.getElementById('startBtn').addEventListener('click', async () => {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.runtime.sendMessage({ action: "startMonitor", tabId: tab.id });
    document.getElementById('status').textContent = "Started monitoring!";
});

document.getElementById('stopBtn').addEventListener('click', async () => {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.runtime.sendMessage({ action: "stopMonitor", tabId: tab.id });
    document.getElementById('status').textContent = "Stopped monitoring!";
});

document.getElementById('loadOldBtn').addEventListener('click', async () => {
    let [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    chrome.runtime.sendMessage({ action: "loadAllOldTransactionsAndScrape", tabId: tab.id });
    document.getElementById('status').textContent = "Loading old transactions!";
});