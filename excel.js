// ============================================
// NASDAQ Analysis AI — Excel Export Engine
// Phase 1: Multi-sheet workbook generation
// ============================================

/**
 * Main entry point called by app.js
 * @param {Array} rows - array of objects from the current table
 * @param {string} source - 'historical' | 'financials'
 */
function generateExcel(rows, source) {
    if (typeof XLSX === 'undefined') {
        alert('Excel library not loaded. Falling back to CSV.');
        return;
    }

    const wb = XLSX.utils.book_new();
    wb.Props = {
        Title: 'NASDAQ Analysis',
        Subject: 'Multi-Ticker Export',
        Author: 'NASDAQ Analysis AI',
        CreatedDate: new Date()
    };

    // --- Sheet 1: Summary ---
    const summary = buildSummarySheet(rows, source);
    const wsSummary = XLSX.utils.aoa_to_sheet(summary);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // --- Data sheets ---
    if (source === 'historical') {
        const wsHist = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, wsHist, 'Historical Prices');
    }

    if (source === 'financials') {
        // Split by statement type if rows contain a Type indicator,
        // otherwise dump all into one sheet and let the user pivot.
        const types = [
            { key: 'income',     name: 'Income Statement' },
            { key: 'balance',    name: 'Balance Sheet' },
            { key: 'cashflow',   name: 'Cash Flow' },
            { key: 'ratios',     name: 'Financial Ratios' }
        ];

        types.forEach(t => {
            const subset = rows.filter(r =>
                (r.Type || '').toLowerCase() === t.key ||
                (r.type || '').toLowerCase() === t.key
            );
            if (subset.length) {
                const ws = XLSX.utils.json_to_sheet(subset);
                XLSX.utils.book_append_sheet(wb, ws, t.name);
            }
        });

        // If no Type column exists, dump everything as generic financials
        if (!types.some(t => rows.some(r =>
            (r.Type || '').toLowerCase() === t.key ||
            (r.type || '').toLowerCase() === t.key
        ))) {
            const ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, 'Financial Data');
        }
    }

    // --- Write file ---
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `NASDAQ_Analysis_${source}_${dateStr}.xlsx`;
    XLSX.writeFile(wb, filename);
}

/**
 * Build a Summary sheet (array-of-arrays for aoa_to_sheet)
 */
function buildSummarySheet(rows, source) {
    const out = [];
    out.push(['NASDAQ Analysis AI — Export Summary']);
    out.push(['Generated', new Date().toLocaleString()]);
    out.push(['Source', source === 'historical' ? 'Historical Prices' : 'Financial Statements']);
    out.push(['Records', rows.length.toString()]);
    out.push([]);

    if (rows.length) {
        const cols = Object.keys(rows[0]);
        out.push(['Columns', cols.join(', ')]);
        out.push([]);

        // Unique symbols
        const symCol = cols.find(c => c.toLowerCase() === 'symbol') || cols[0];
        const symbols = [...new Set(rows.map(r => r[symCol]).filter(Boolean))];
        out.push(['Symbols', symbols.length.toString()]);
        out.push(...symbols.map(s => [s]));
    }

    return out;
}