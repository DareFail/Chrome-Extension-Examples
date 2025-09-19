let monitoring = {};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startMonitor") {
        startMonitoring(message.tabId);
    }
    if (message.action === "stopMonitor") {
        stopMonitoring(message.tabId);
    }
    if (message.action === "loadAllOldTransactionsAndScrape") {
        chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            func: function () {
                // --- BEGIN loadAllOldTransactionsAndScrape ---
                async function loadAllOldTransactionsAndScrape() {

                    function monthToNumber(mon) {
                        if (!mon) return null;
                        mon = mon.slice(0,3).toLowerCase();
                        return {jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
                                jul:7, aug:8, sep:9, oct:10, nov:11, dec:12}[mon] || null;
                    }

                    function extractYearedRows() {
                        let allRows = [];
                        let currentYear = (new Date()).getFullYear();

                        // ---- Card/Statement/Credit view ----
                        document.querySelectorAll('.c1-ease-card-transactions-view__table').forEach(section => {
                            let label = section.querySelector('.c1-ease-card-transactions-view__table--headersection-title')
                                ?.innerText.trim() || "Misc";
                            let statementMatch = label.match(/Statement Ending (\w{3,9})\s*(\d{1,2}),?\s*(\d{4})/i);
                            let statementEndMonth = null, statementEndYear = null;
                            if (statementMatch) {
                                statementEndMonth = monthToNumber(statementMatch[1].trim());
                                statementEndYear = Number(statementMatch[3].trim());
                            }
                            let sectionInfo = statementMatch
                                ? `${statementMatch[1].trim()} ${statementMatch[2].trim()}, ${statementMatch[3].trim()}`
                                : label;

                            section.querySelectorAll('c1-ease-table').forEach(table => {
                                table.querySelectorAll('c1-ease-row.c1-ease-table__row').forEach(row => {
                                    let cells = row.querySelectorAll('c1-ease-cell');
                                    let month = cells[1]?.querySelector('.c1-ease-txns-date-and-status__month')?.innerText.trim();
                                    let day = cells[1]?.querySelector('.c1-ease-txns-date-and-status__day')?.innerText.trim();

                                    // -- Find year per rule:
                                    let txnMonthNum = monthToNumber(month);
                                    let year = statementEndMonth && statementEndYear && txnMonthNum
                                        ? (txnMonthNum > statementEndMonth
                                            ? statementEndYear - 1
                                            : statementEndYear)
                                        : (statementEndYear // for statements without month
                                            || currentYear);

                                    // For sections with no year at all ("pending", "scheduled"):
                                    if (!statementEndMonth && !statementEndYear) year = currentYear;

                                    let date = (month && day && year) ? `${month} ${day}, ${year}` : '';

                                    if (!date && cells[1]) {
                                        let pendingText = cells[1].innerText.trim();
                                        if (/pending/i.test(pendingText)) date = 'Pending';
                                    }

                                    let descCell = cells[2];
                                    let description = descCell?.querySelector('.c1-ease-txns-description__description')?.innerText.trim() || '';
                                    let category = descCell?.querySelector('.c1-ease-card-transactions-view-table__rewards-category')?.innerText.trim() ||
                                                descCell?.querySelector('.c1-ease-txns-description__category')?.innerText.trim() ||
                                                cells[3]?.innerText.trim() || '';
                                    let card = cells[4]?.innerText.trim() || '';
                                    let amount = (cells[5]?.innerText.trim() || cells[4]?.innerText.trim() || '');

                                    allRows.push({
                                        section: sectionInfo,
                                        date: date,
                                        description,
                                        category,
                                        card,
                                        amount
                                    });
                                });
                            });
                        });

                        // ---- Old Transactions/Activity view ----
                        document.querySelectorAll('[data-testid="transaction-table-view"]').forEach(container => {
                            let year = currentYear;
                            Array.from(container.children).forEach(el => {
                                if (el.tagName === 'H3' && /\d{4}/.test(el.textContent)) {
                                    const [foundYear] = el.textContent.match(/\d{4}/);
                                    year = +foundYear;
                                    return;
                                }
                                if (el.tagName && el.tagName.toUpperCase().startsWith('C1-EASE-TABLE')) {
                                    Array.from(el.querySelectorAll('c1-ease-row.c1-ease-table__row')).forEach(row => {
                                        let cells = row.querySelectorAll('c1-ease-cell');
                                        let month = cells[0]?.querySelector('.c1-ease-txns-date-and-status__month')?.innerText.trim() || '';
                                        let day = cells[0]?.querySelector('.c1-ease-txns-date-and-status__day')?.innerText.trim() || '';
                                        let date = (month && day) ? `${month} ${day}, ${year}` : '';
                                        let descCell = cells[2];
                                        let description = descCell?.querySelector('.c1-ease-txns-description__description')?.innerText.trim() || '';
                                        let category = descCell?.querySelector('.c1-ease-txns-description__category')?.innerText.trim() ||
                                                    cells[3]?.innerText.trim() || '';
                                        // account table = amount at cell 4, balance at cell 5
                                        let amount = cells[4]?.innerText.trim() || '';
                                        allRows.push({
                                            section: `${year} Transactions`,
                                            date: date,
                                            description,
                                            category,
                                            card: '', // Not applicable here
                                            amount
                                        });
                                    });
                                }
                            });
                        });

                        return allRows;
                    }

                    function extractBalance() {
                        const currency = document.querySelector('c1-ease-currency');
                        if (currency) {
                            const dollars = currency.querySelector('.c1-ease-hero-numbers__amount')?.textContent.replace(/,/g, '') || "0";
                            const cents = currency.querySelector('.c1-ease-hero-numbers__decimal')?.textContent || "00";
                            return dollars + "." + cents;
                        }
                        return null;
                    }

                    function getLoadPrevBtn() {
                        // 1. Old style - Statement navigation
                        let btn = document.querySelector('.c1-ease-card-transactions-view__load-next-statement--button');
                        if (btn && !btn.disabled && btn.offsetParent !== null) return btn;
                        // 2. New style - View More in Account
                        let viewMore = document.querySelector('div[data-testid="transaction-view-more-link"] a.viewmore-transactions__title');
                        if (viewMore && viewMore.offsetParent !== null) return viewMore;
                        return null;
                    }
                    function randomDelay(min = 2000, max = 3500) {
                        return Math.random() * (max - min) + min;
                    }

                    // Keep clicking "load more" until all loaded
                    while (true) {
                        const btn = getLoadPrevBtn();
                        if (!btn || btn.disabled || btn.offsetParent === null || btn.innerText.trim().toLowerCase().includes('no more')) break;
                        btn.click();
                        await new Promise(res => setTimeout(res, randomDelay()));
                    }

                    const yearRows = extractYearedRows();
                    const current_balance = extractBalance();
                    const transactions = yearRows.reverse();

                    try {
                        await fetch("https://mintyhand.com/extension/transactions/", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                transactions,
                                current_balance,
                                url: window.location.href
                            })
                        });
                    } catch(e) {
                        window.console.error("Mintyhand send error:", e);
                    }
                }
                loadAllOldTransactionsAndScrape();
                // --- END loadAllOldTransactionsAndScrape ---
            }
        });
    }
    return true;
});

function randomDelay(min, max) {
    return (Math.random() * (max - min) + min) * 1000;
}

async function scrapeAndPost() {
    function monthToNumber(mon) {
        if (!mon) return null;
        mon = mon.slice(0,3).toLowerCase();
        return {jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
                jul:7, aug:8, sep:9, oct:10, nov:11, dec:12}[mon] || null;
    }

    function extractYearedRows() {
        let allRows = [];
        let currentYear = (new Date()).getFullYear();

        // ---- Card/Statement/Credit view ----
        document.querySelectorAll('.c1-ease-card-transactions-view__table').forEach(section => {
            let label = section.querySelector('.c1-ease-card-transactions-view__table--headersection-title')
                ?.innerText.trim() || "Misc";
            let statementMatch = label.match(/Statement Ending (\w{3,9})\s*(\d{1,2}),?\s*(\d{4})/i);
            let statementEndMonth = null, statementEndYear = null;
            if (statementMatch) {
                statementEndMonth = monthToNumber(statementMatch[1].trim());
                statementEndYear = Number(statementMatch[3].trim());
            }
            let sectionInfo = statementMatch
                ? `${statementMatch[1].trim()} ${statementMatch[2].trim()}, ${statementMatch[3].trim()}`
                : label;

            section.querySelectorAll('c1-ease-table').forEach(table => {
                table.querySelectorAll('c1-ease-row.c1-ease-table__row').forEach(row => {
                    let cells = row.querySelectorAll('c1-ease-cell');
                    let month = cells[1]?.querySelector('.c1-ease-txns-date-and-status__month')?.innerText.trim();
                    let day = cells[1]?.querySelector('.c1-ease-txns-date-and-status__day')?.innerText.trim();

                    // -- Find year per rule:
                    let txnMonthNum = monthToNumber(month);
                    let year = statementEndMonth && statementEndYear && txnMonthNum
                        ? (txnMonthNum > statementEndMonth
                            ? statementEndYear - 1
                            : statementEndYear)
                        : (statementEndYear // for statements without month
                            || currentYear);

                    // For sections with no year at all ("pending", "scheduled"):
                    if (!statementEndMonth && !statementEndYear) year = currentYear;

                    let date = (month && day && year) ? `${month} ${day}, ${year}` : '';

                    if (!date && cells[1]) {
                        let pendingText = cells[1].innerText.trim();
                        if (/pending/i.test(pendingText)) date = 'Pending';
                    }

                    let descCell = cells[2];
                    let description = descCell?.querySelector('.c1-ease-txns-description__description')?.innerText.trim() || '';
                    let category = descCell?.querySelector('.c1-ease-card-transactions-view-table__rewards-category')?.innerText.trim() ||
                                descCell?.querySelector('.c1-ease-txns-description__category')?.innerText.trim() ||
                                cells[3]?.innerText.trim() || '';
                    let card = cells[4]?.innerText.trim() || '';
                    let amount = (cells[5]?.innerText.trim() || cells[4]?.innerText.trim() || '');

                    allRows.push({
                        id: row.id,
                        section: sectionInfo,
                        date: date,
                        description,
                        category,
                        card,
                        amount
                    });
                });
            });
        });

        // ---- Old Transactions/Activity view ----
        document.querySelectorAll('[data-testid="transaction-table-view"]').forEach(container => {
            let year = currentYear;
            Array.from(container.children).forEach(el => {
                if (el.tagName === 'H3' && /\d{4}/.test(el.textContent)) {
                    const [foundYear] = el.textContent.match(/\d{4}/);
                    year = +foundYear;
                    return;
                }
                if (el.tagName && el.tagName.toUpperCase().startsWith('C1-EASE-TABLE')) {
                    Array.from(el.querySelectorAll('c1-ease-row.c1-ease-table__row')).forEach(row => {
                        let cells = row.querySelectorAll('c1-ease-cell');
                        let month = cells[0]?.querySelector('.c1-ease-txns-date-and-status__month')?.innerText.trim() || '';
                        let day = cells[0]?.querySelector('.c1-ease-txns-date-and-status__day')?.innerText.trim() || '';
                        let date = (month && day) ? `${month} ${day}, ${year}` : '';
                        let descCell = cells[2];
                        let description = descCell?.querySelector('.c1-ease-txns-description__description')?.innerText.trim() || '';
                        let category = descCell?.querySelector('.c1-ease-txns-description__category')?.innerText.trim() ||
                                    cells[3]?.innerText.trim() || '';
                        // account table = amount at cell 4, balance at cell 5
                        let amount = cells[4]?.innerText.trim() || '';
                        allRows.push({
                            id: row.id,
                            section: `${year} Transactions`,
                            date: date,
                            description,
                            category,
                            card: '', // Not applicable here
                            amount
                        });
                    });
                }
            });
        });

        return allRows;
    }

    function extractBalance() {
        const currency = document.querySelector('c1-ease-currency');
        if (currency) {
            const dollars = currency.querySelector('.c1-ease-hero-numbers__amount')?.textContent.replace(/,/g, '') || "0";
            const cents = currency.querySelector('.c1-ease-hero-numbers__decimal')?.textContent || "00";
            return dollars + "." + cents;
        }
        return null;
    }
    const yearRows = extractYearedRows();
    const current_balance = extractBalance();
    const transactions = yearRows.reverse();

    try {
        await fetch("https://mintyhand.com/extension/transactions/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                transactions,
                current_balance,
                url: location.href
            })
        });
    } catch(e) {
        window.console.error("Mintyhand send error:", e);
    }
}

async function startMonitoring(tabId) {
    stopMonitoring(tabId); // ensure no duplicate timers
    async function reloadAndScrape() {
        try {
            await chrome.tabs.update(tabId);
            await new Promise(res => setTimeout(res, 5000));
            await chrome.scripting.executeScript({
                target: { tabId },
                func: scrapeAndPost,
                args: []
            });
        } catch (e) {
            console.log("Monitor error:", e);
        }
        if (monitoring[tabId]?.active) {
            monitoring[tabId].timer = setTimeout(reloadAndScrape, randomDelay(20, 30));
        }
    }
    monitoring[tabId] = { url, active: true };
    monitoring[tabId].timer = setTimeout(reloadAndScrape, 1000);
}

function stopMonitoring(tabId) {
    if (monitoring[tabId]) {
        clearTimeout(monitoring[tabId].timer);
        monitoring[tabId].active = false;
        delete monitoring[tabId];
    }
}