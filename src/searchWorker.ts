// Web Worker for handling large dataset operations off the main thread


// Define types locally since we can't easily import from the main file in a standalone worker
export interface LedgerEntry {
    sNo: string;
    invoiceNo: string;
    date: string;
    party: string;
    amount: number;
    narration: string;
    dueDays: number;
    mobileNo: string;
    comment: string;
    colour: string;
    timestamp: number;
    monthYear: string;
    searchString: string;
}

let DATA: LedgerEntry[] = [];

// Handle incoming messages
self.onmessage = (e: MessageEvent) => {
    const { type, payload, id } = e.data;

    try {
        switch (type) {
            case 'SET_DATA':
                DATA = payload;
                self.postMessage({ type: 'DATA_SET', id });
                break;

            case 'FILTER':
                handleFilter(payload, id);
                break;

            case 'GET_PARTIES':
                handleGetParties(id);
                break;

            case 'GET_NARRATIONS':
                handleGetNarrations(id);
                break;

            case 'GET_REPORTS':
                handleGetReports(id);
                break;

            case 'GET_PARTY_DATA':
                handleGetPartyData(payload, id);
                break;

            case 'GET_NARRATION_DATA':
                handleGetNarrationData(payload, id);
                break;
            case 'GET_MONTHS':
                handleGetMonths(id);
                break;
        }
    } catch (err) {
        console.error("Worker Error:", err);
        self.postMessage({ type: 'ERROR', error: String(err), id });
    }
};

function handleGetMonths(id: string) {
    const months = new Set<string>();
    for (let i = 0; i < DATA.length; i++) {
        if (DATA[i].monthYear) months.add(DATA[i].monthYear);
    }
    const result = Array.from(months).sort((a, b) => {
        try {
            const dateA = new Date(a.split(' ')[1] + '-' + a.split(' ')[0] + '-01'); // Simple parse
            const dateB = new Date(b.split(' ')[1] + '-' + b.split(' ')[0] + '-01');
            return dateB.getTime() - dateA.getTime();
        } catch (e) { return 0; }
    });
    self.postMessage({ type: 'MONTHS_RESULT', id, payload: result });
}

function handleGetPartyData(payload: any, id: string) {
    const { party, narrationFilter, showDueOnly } = payload;
    if (!party) return self.postMessage({ type: 'PARTY_DATA_RESULT', id, payload: [] });

    const results = DATA.filter(entry => {
        if (entry.party !== party) return false;
        if (narrationFilter && !entry.narration?.toLowerCase().includes(narrationFilter.toLowerCase())) return false;
        if (showDueOnly) {
            const status = (entry.narration || '').toLowerCase();
            const isSettled = status.includes('received') || status.includes('cancel') || status.includes('delete') || status.includes('credit note');
            if (isSettled) return false;
        }
        return true;
    });

    self.postMessage({ type: 'PARTY_DATA_RESULT', id, payload: results });
}

function handleGetNarrationData(payload: any, id: string) {
    const { narration } = payload;
    if (!narration) return self.postMessage({ type: 'NARRATION_DATA_RESULT', id, payload: [] });

    const results = DATA.filter(entry => {
        const entryNar = (entry.narration || '').trim();
        if (entryNar !== narration) return false;

        const status = entryNar.toLowerCase();
        const isSettled = status.includes('received') || status.includes('cancel') || status.includes('delete') || status.includes('credit note');

        return !isSettled;
    });

    self.postMessage({ type: 'NARRATION_DATA_RESULT', id, payload: results });
}

function handleGetReports(id: string) {
    const ageingGroups: Record<string, { amount: number, count: number }> = {
        '0-30 days': { amount: 0, count: 0 },
        '31-60 days': { amount: 0, count: 0 },
        '61-90 days': { amount: 0, count: 0 },
        '90+ days': { amount: 0, count: 0 }
    };

    const narrationMap = new Map<string, { amount: number, count: number }>();
    const partyMap = new Map<string, { amount: number, bills: number }>();

    for (let i = 0; i < DATA.length; i++) {
        const entry = DATA[i];
        const status = (entry.narration || '').toLowerCase();
        const isSettled = status === 'received' || status === 'cancel' || status === 'credit note' || status === 'delete';

        if (isSettled) continue;

        // Ageing
        const days = entry.dueDays;
        if (days <= 30) {
            ageingGroups['0-30 days'].amount += entry.amount;
            ageingGroups['0-30 days'].count++;
        } else if (days <= 60) {
            ageingGroups['31-60 days'].amount += entry.amount;
            ageingGroups['31-60 days'].count++;
        } else if (days <= 90) {
            ageingGroups['61-90 days'].amount += entry.amount;
            ageingGroups['61-90 days'].count++;
        } else {
            ageingGroups['90+ days'].amount += entry.amount;
            ageingGroups['90+ days'].count++;
        }

        // Narration Grouping
        const nKey = entry.narration?.trim() || 'UNSPECIFIED';
        const nStat = narrationMap.get(nKey) || { amount: 0, count: 0 };
        nStat.amount += entry.amount;
        nStat.count++;
        narrationMap.set(nKey, nStat);

        // Party Grouping
        const pKey = entry.party;
        const pStat = partyMap.get(pKey) || { amount: 0, bills: 0 };
        pStat.amount += entry.amount;
        pStat.bills++;
        partyMap.set(pKey, pStat);
    }

    self.postMessage({
        type: 'REPORTS_RESULT',
        id,
        payload: {
            ageingGroups: Object.entries(ageingGroups),
            narrationGroups: Array.from(narrationMap.entries()).sort((a, b) => b[1].amount - a[1].amount),
            partyGroups: Array.from(partyMap.entries()).sort((a, b) => b[1].amount - a[1].amount)
        }
    });
}
function handleFilter(params: any, id: string) {
    const { query, pendingOnly, dateFilters } = params;
    const { showFilters, filterMonth, startBound, endBoundTime } = dateFilters || {};

    // Search words
    const searchWords = (query || '').toLowerCase().split(/[^a-z0-9]/).filter((w: string) => w.length > 0);
    const hasSearch = searchWords.length > 0;

    const results: LedgerEntry[] = [];
    let totOutstanding = 0;
    let ovrCount = 0;

    const len = DATA.length;
    for (let i = 0; i < len; i++) {
        const entry = DATA[i];

        // 1. SEARCH
        if (hasSearch) {
            let matchesAll = true;
            for (let j = 0; j < searchWords.length; j++) {
                if (!entry.searchString.includes(searchWords[j])) {
                    matchesAll = false;
                    break;
                }
            }
            if (!matchesAll) continue;
        }

        // 2. DATE
        if (showFilters) {
            if (filterMonth && entry.monthYear !== filterMonth) continue;
            if (startBound !== null && entry.timestamp < startBound) continue;
            if (endBoundTime !== null && entry.timestamp > endBoundTime) continue;
        }

        // 3. PENDING ONLY
        const status = (entry.narration || '').toLowerCase();
        const isSettled = status === 'received' || status === 'cancel' || status === 'credit note' || status === 'delete';

        if (pendingOnly && isSettled) continue;

        // Match found
        results.push(entry);

        if (!isSettled) {
            totOutstanding += entry.amount;
            if (entry.dueDays > 30) ovrCount++;
        }
    }

    self.postMessage({
        type: 'FILTER_RESULT',
        id,
        payload: {
            filteredData: results,
            metrics: { totalOutstanding: totOutstanding, overdueCount: ovrCount }
        }
    });
}

function handleGetParties(id: string) {
    // Unique parties
    const parties = Array.from(new Set(DATA.map(e => e.party))).filter(Boolean).sort();
    self.postMessage({ type: 'PARTIES_RESULT', id, payload: parties });
}

function handleGetNarrations(id: string) {
    // Unique narrations (unsettled mostly)
    const relevant = DATA
        .map(e => (e.narration || '').trim())
        .filter(n => {
            if (!n) return false;
            const low = n.toLowerCase();
            return !low.includes('received') && !low.includes('cancel') && !low.includes('delete') && !low.includes('credit note');
        });
    const narrations = Array.from(new Set(relevant)).sort();
    self.postMessage({ type: 'NARRATIONS_RESULT', id, payload: narrations });
}
