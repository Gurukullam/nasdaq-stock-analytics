function renderTable(containerId, rows, tableId) {
  const box = document.getElementById(containerId);
  if (!box) return;

  if (!Array.isArray(rows) || rows.length === 0) {
    box.innerHTML = '<div class="empty-state">No data returned.</div>';
    setRecordCount(containerId.replace('Result', ''), 0);
    return;
  }

  const table = document.createElement('table');
  table.id = tableId;

  // --- header ---
  const cols = Object.keys(rows[0]);
  const thead = document.createElement('thead');
  const thr = document.createElement('tr');
  cols.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c;
    th.className = 'sortable';
    th.onclick = () => sortTable(tableId, c);
    thr.appendChild(th);
  });
  thead.appendChild(thr);
  table.appendChild(thead);

  // --- body ---
  const tbody = document.createElement('tbody');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    cols.forEach(c => {
      const td = document.createElement('td');
      let v = r[c];
      
      // Format numbers
      if (v !== '' && v !== null && v !== undefined) {
        const num = parseFloat(v);
        if (!isNaN(num) && c !== 'Metric' && c !== 'Symbol') {
          td.textContent = formatFinancialNumber(num);
          td.className = 'numeric';
        } else {
          td.textContent = v;
        }
      } else {
        td.textContent = '--';
        td.style.color = 'var(--text-muted)';
      }
      
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  box.innerHTML = '';
  box.appendChild(table);
  setRecordCount(containerId.replace('Result', ''), rows.length);
}

/* ------------------------------------------
   Number formatter — matches NASDAQ style
   ------------------------------------------ */
function formatFinancialNumber(num) {
  if (num === 0) return '$0';
  
  const abs = Math.abs(num);
  
  // Ratios / EPS (small decimals)
  if (abs < 10 && !Number.isInteger(num)) {
    return num.toFixed(2);
  }
  
  // Percentages (already multiplied by 100 in ratios)
  if (abs > 100 && Number.isInteger(num) && num <= 10000) {
    return num.toLocaleString('en-US') + '%';
  }
  
  // Large numbers: $60.9B, $44.3B, etc.
  if (abs >= 1e12) {
    return '$' + (num / 1e12).toFixed(2) + 'T';
  }
  if (abs >= 1e9) {
    return '$' + (num / 1e9).toFixed(1) + 'B';
  }
  if (abs >= 1e6) {
    return '$' + (num / 1e6).toFixed(1) + 'M';
  }
  if (abs >= 1e3) {
    return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  
  return '$' + num.toLocaleString('en-US');
}