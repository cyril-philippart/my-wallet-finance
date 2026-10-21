const SHEET_NAME = 'Cotations';

function setupQuotesSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const existing = spreadsheet.getSheetByName(SHEET_NAME);
  if (existing && existing.getLastRow() > 0) {
    throw new Error('La feuille Cotations existe déjà. Exécutez upgradePerformanceColumns au lieu de setupQuotesSheet.');
  }
  const sheet = existing || spreadsheet.insertSheet(SHEET_NAME);
  sheet.getRange('A1:Q1').setValues([['ticker', 'nom', 'prix', 'devise', 'statut', 'lu_le', 'heure_cotation', 'cloture_jour', 'date_jour', 'cloture_mois', 'date_mois', 'cloture_annee', 'date_annee', 'taux_eur', 'taux_eur_jour', 'taux_eur_mois', 'taux_eur_annee']]);
  sheet.getRange('A2:B7').setValues([
    ['EPA:AI', 'Air Liquide'],
    ['INDEXEURO:PX1', 'CAC 40'],
    ['INDEXNASDAQ:.IXIC', 'Nasdaq Composite'],
    ['INDEXSP:.INX', 'S&P 500'],
    ['BTCEUR', 'Bitcoin'],
    ['ETHEUR', 'Ethereum']
  ]);
  for (let row = 2; row <= 7; row++) {
    const liveTicker = isCryptoTicker_(sheet.getRange(row, 1).getValue()) ? '"CURRENCY:"&A' + row : 'A' + row;
    sheet.getRange(row, 3).setFormula('=IFERROR(GOOGLEFINANCE(' + liveTicker + ';"price");"")');
    sheet.getRange(row, 4).setFormula('=IFERROR(GOOGLEFINANCE(A' + row + ';"currency");"EUR")');
    sheet.getRange(row, 5).setFormula('=IF(C' + row + '="";"ERROR";"OK")');
    sheet.getRange(row, 6).setFormula('=NOW()');
  }
  installPerformanceFormulas_(sheet, 2, 7);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 7);
}

function upgradePerformanceColumns() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Feuille Cotations introuvable');
  sheet.getRange('H1:Q1').setValues([['cloture_jour', 'date_jour', 'cloture_mois', 'date_mois', 'cloture_annee', 'date_annee', 'taux_eur', 'taux_eur_jour', 'taux_eur_mois', 'taux_eur_annee']]);
  ensureFxRows_(sheet);
  const lastRow = Math.max(2, sheet.getLastRow());
  repairLiveFormulas_(sheet, 2, lastRow);
  installPerformanceFormulas_(sheet, 2, lastRow);
  sheet.autoResizeColumns(1, 17);
}

function ensureFxRows_(sheet) {
  const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat() : [];
  [['CURRENCY:USDEUR', 'Dollar vers euro'], ['CURRENCY:CHFEUR', 'Franc suisse vers euro']].forEach(item => {
    if (existing.indexOf(item[0]) === -1) sheet.appendRow([item[0], item[1]]);
  });
}

function repairLiveFormulas_(sheet, firstRow, lastRow) {
  for (let row = firstRow; row <= lastRow; row++) {
    if (!sheet.getRange(row, 1).getValue()) continue;
    const ticker = String(sheet.getRange(row, 1).getValue());
    const googleAlias = googleTickerAlias_(ticker);
    if (isCryptoTicker_(ticker)) sheet.getRange(row, 3).setFormula('=IFERROR(GOOGLEFINANCE("CURRENCY:"&A' + row + ';"price");"")');
    else if (googleAlias) sheet.getRange(row, 3).setFormula('=IFERROR(GOOGLEFINANCE("' + googleAlias + '";"price");"")');
    else if (isBoursoramaTicker_(ticker)) sheet.getRange(row, 3).setFormula('=IFERROR(BOURSO(A' + row + ');"")');
    else if (ticker.indexOf('CURRENCY:') === 0) sheet.getRange(row, 3).setFormula('=IFERROR(GOOGLEFINANCE(A' + row + ');"")');
    else sheet.getRange(row, 3).setFormula('=IFERROR(GOOGLEFINANCE(A' + row + ';"price");"")');
    if (googleAlias || isBoursoramaTicker_(ticker)) sheet.getRange(row, 4).setValue('EUR');
    else if (!sheet.getRange(row, 4).getFormula()) sheet.getRange(row, 4).setFormula('=IFERROR(GOOGLEFINANCE(A' + row + ';"currency");"EUR")');
    if (!sheet.getRange(row, 5).getFormula()) sheet.getRange(row, 5).setFormula('=IF(C' + row + '="";"ERROR";"OK")');
    if (!sheet.getRange(row, 6).getFormula()) sheet.getRange(row, 6).setFormula('=NOW()');
    if (isBoursoramaTicker_(ticker)) sheet.getRange(row, 7).setFormula('=IFERROR(BOURSO_DATE(A' + row + ');"")');
  }
}

function installPerformanceFormulas_(sheet, firstRow, lastRow) {
  for (let row = firstRow; row <= lastRow; row++) {
    if (!sheet.getRange(row, 1).getValue()) continue;
    const ticker = String(sheet.getRange(row, 1).getValue());
    const googleAlias = googleTickerAlias_(ticker);
    if (!googleAlias && isBoursoramaTicker_(ticker)) {
      sheet.getRange(row, 8).setFormula('=IFERROR(BOURSO_PREV(A' + row + ');"")');
      sheet.getRange(row, 9).setFormula('=IFERROR(BOURSO_PREV_DATE(A' + row + ');"")');
      sheet.getRange(row, 10).setFormula('=IFERROR(BOURSO_MONTH(A' + row + ');"")');
      sheet.getRange(row, 11).setFormula('=IFERROR(BOURSO_MONTH_DATE(A' + row + ');"")');
      sheet.getRange(row, 12, 1, 2).clearContent();
      sheet.getRange(row, 14, 1, 4).setValues([[1, 1, 1, 1]]);
      continue;
    }
    const sourceTicker = googleAlias
      ? '"' + googleAlias + '"'
      : 'IF(OR(A' + row + '="BTCEUR";A' + row + '="ETHEUR");"CURRENCY:"&A' + row + ';A' + row + ')';
    const dailyDate = 'WORKDAY(TODAY();-1)';
    const monthDate = 'WORKDAY(EOMONTH(TODAY();-1)+1;-1)';
    const yearDate = 'WORKDAY(DATE(YEAR(TODAY());1;1);-1)';
    const daily = 'GOOGLEFINANCE(' + sourceTicker + ';"close";' + dailyDate + ')';
    const month = 'GOOGLEFINANCE(' + sourceTicker + ';"close";' + monthDate + ')';
    const year = 'GOOGLEFINANCE(' + sourceTicker + ';"close";' + yearDate + ')';
    sheet.getRange(row, 8).setFormula('=IFERROR(INDEX(' + daily + ';2;2);"")');
    sheet.getRange(row, 9).setFormula('=IF(H' + row + '="";"";' + dailyDate + ')');
    sheet.getRange(row, 10).setFormula('=IFERROR(INDEX(' + month + ';2;2);"")');
    sheet.getRange(row, 11).setFormula('=IF(J' + row + '="";"";' + monthDate + ')');
    sheet.getRange(row, 12).setFormula('=IFERROR(INDEX(' + year + ';2;2);"")');
    sheet.getRange(row, 13).setFormula('=IF(L' + row + '="";"";' + yearDate + ')');
    sheet.getRange(row, 14).setFormula('=IF(D' + row + '="EUR";1;IFERROR(GOOGLEFINANCE("CURRENCY:"&D' + row + '&"EUR");""))');
    sheet.getRange(row, 15).setFormula('=IF(D' + row + '="EUR";1;IFERROR(INDEX(GOOGLEFINANCE("CURRENCY:"&D' + row + '&"EUR";"close";I' + row + ');2;2);""))');
    sheet.getRange(row, 16).setFormula('=IF(D' + row + '="EUR";1;IFERROR(INDEX(GOOGLEFINANCE("CURRENCY:"&D' + row + '&"EUR";"close";K' + row + ');2;2);""))');
    sheet.getRange(row, 17).setFormula('=IF(D' + row + '="EUR";1;IFERROR(INDEX(GOOGLEFINANCE("CURRENCY:"&D' + row + '&"EUR";"close";M' + row + ');2;2);""))');
  }
}

function doPost(event) {
  const expected = PropertiesService.getScriptProperties().getProperty('SYNC_SECRET');
  if (!expected || !event || event.parameter.key !== expected) return jsonResponse({ok: false, error: 'UNAUTHORIZED'});
  let payload;
  try { payload = JSON.parse(event.postData && event.postData.contents || '{}'); }
  catch (error) { return jsonResponse({ok: false, error: 'INVALID_JSON'}); }
  if (payload.action !== 'upsertAssets' || !Array.isArray(payload.assets)) return jsonResponse({ok: false, error: 'INVALID_ACTION'});
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return jsonResponse({ok: false, error: 'SHEET_NOT_FOUND'});
  const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat().map(value => String(value).trim().toUpperCase()) : [];
  let added = 0;
  payload.assets.forEach(asset => {
    const ticker = String(asset && asset.ticker || '').trim().toUpperCase();
    const name = String(asset && asset.name || '').trim();
    if (!ticker || !name || existing.indexOf(ticker) !== -1) return;
    const row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, 2).setValues([[ticker, name]]);
    repairLiveFormulas_(sheet, row, row);
    installPerformanceFormulas_(sheet, row, row);
    existing.push(ticker);
    added++;
  });
  SpreadsheetApp.flush();
  return jsonResponse({ok: true, added: added});
}

function isBoursoramaTicker_(ticker) {
  return /^(1r|OPCVM:)/i.test(String(ticker || '').trim());
}

function isCryptoTicker_(ticker) {
  return /^(BTC|ETH)EUR$/i.test(String(ticker || '').trim());
}

function googleTickerAlias_(ticker) {
  const aliases = {
    '1RTHLT': 'EPA:HLT'
  };
  return aliases[String(ticker || '').trim().toUpperCase()] || '';
}

function BOURSO_FETCH_(code) {
  code = String(code || '').trim();
  if (!code) return '';
  const opcvm = /^OPCVM:/i.test(code);
  const identifier = opcvm ? code.replace(/^OPCVM:/i, '') : code;
  const url = 'https://www.boursorama.com/bourse/' + (opcvm ? 'opcvm' : 'trackers') + '/cours/' + encodeURIComponent(identifier) + '/';
  try {
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: {'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html'}
    });
    if (response.getResponseCode() !== 200) return '#HTTP_' + response.getResponseCode();
    return response.getContentText();
  } catch (error) {
    return '#FETCH_ERROR: ' + error.message;
  }
}

function BOURSO(code) {
  if (/^OPCVM:/i.test(String(code || '').trim())) {
    const rows = BOURSO_HISTORY_ROWS_(code);
    return String(rows).indexOf('#') === 0 ? rows : rows.length ? rows[0].price : '#PRIX_NON_TROUVE';
  }
  const html = BOURSO_FETCH_(code);
  if (!html || String(html).indexOf('#') === 0) return html;
  const block = html.match(/<div[^>]*class="[^"]*c-faceplate__price[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (!block) return '#BLOC_PRIX_NON_TROUVE';
  return boursoNumber_(block[1], /<span[^>]*class="[^"]*c-instrument--last[^"]*"[^>]*>([\d\s.,]+)<\/span>/i, '#PRIX_NON_TROUVE');
}

function BOURSO_PREV(code) {
  const rows = BOURSO_HISTORY_ROWS_(code);
  return String(rows).indexOf('#') === 0 ? rows : rows.length > 1 ? rows[1].price : '#PREV_NON_TROUVEE';
}

function BOURSO_DATE(code) {
  const rows = BOURSO_HISTORY_ROWS_(code);
  return String(rows).indexOf('#') === 0 ? rows : rows.length ? rows[0].date : '#DATE_NON_TROUVEE';
}

function BOURSO_PREV_DATE(code) {
  const rows = BOURSO_HISTORY_ROWS_(code);
  return String(rows).indexOf('#') === 0 ? rows : rows.length > 1 ? rows[1].date : '#DATE_PREV_NON_TROUVEE';
}

function BOURSO_MONTH(code) {
  const row = BOURSO_MONTH_ROW_(code);
  return String(row).indexOf('#') === 0 ? row : row.price;
}

function BOURSO_MONTH_DATE(code) {
  const row = BOURSO_MONTH_ROW_(code);
  return String(row).indexOf('#') === 0 ? row : row.date;
}

function BOURSO_MONTH_ROW_(code) {
  const rows = BOURSO_HISTORY_ROWS_(code);
  if (String(rows).indexOf('#') === 0) return rows;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let index = 0; index < rows.length; index++) if (rows[index].date < monthStart) return rows[index];
  return '#MOIS_NON_TROUVE';
}

function BOURSO_HISTORY_ROWS_(code) {
  code = String(code || '').trim();
  if (!code) return [];
  const opcvm = /^OPCVM:/i.test(code);
  const identifier = opcvm ? code.replace(/^OPCVM:/i, '') : code;
  const url = 'https://www.boursorama.com/bourse/' + (opcvm ? 'opcvm' : 'trackers') + '/cours/historique/' + encodeURIComponent(identifier);
  const cache = CacheService.getScriptCache();
  const cacheKey = 'bourso-history-' + Utilities.base64EncodeWebSafe(url).slice(-180);
  const cached = cache.get(cacheKey);
  if (cached) {
    const values = JSON.parse(cached);
    return values.map(function(row) { return {date: new Date(row.date), price: row.price}; });
  }
  let html;
  try {
    const response = UrlFetchApp.fetch(url, {muteHttpExceptions: true, headers: {'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html'}});
    if (response.getResponseCode() !== 200) return '#HTTP_HISTO_' + response.getResponseCode();
    html = response.getContentText();
  } catch (error) {
    return '#FETCH_HISTO_ERROR: ' + error.message;
  }
  const matches = html.match(/<tr[^>]*class="[^"]*c-table__row[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const rows = [];
  matches.forEach(function(rowHtml) {
    const cells = rowHtml.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
    if (cells.length < 2) return;
    const dateText = boursoText_(cells[0]);
    const priceText = boursoText_(cells[1]);
    const dateParts = dateText.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const price = Number(priceText.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
    if (!dateParts || !Number.isFinite(price)) return;
    rows.push({date: new Date(Number(dateParts[3]), Number(dateParts[2]) - 1, Number(dateParts[1]), 12), price: price});
  });
  rows.sort(function(a, b) { return b.date.getTime() - a.date.getTime(); });
  if (rows.length) cache.put(cacheKey, JSON.stringify(rows.map(function(row) { return {date: row.date.getTime(), price: row.price}; })), 300);
  return rows.length ? rows : '#HISTORIQUE_NON_TROUVE';
}

function boursoText_(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function boursoNumber_(html, regex, missingError) {
  const match = String(html).match(regex);
  if (!match || !match[1]) return missingError;
  const value = Number(match[1].replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : '#CONVERSION_ERREUR';
}

function doGet(event) {
  const expected = PropertiesService.getScriptProperties().getProperty('SYNC_SECRET');
  if (!expected || !event || event.parameter.key !== expected) {
    return jsonResponse({ ok: false, error: 'UNAUTHORIZED' });
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: false, error: 'SHEET_NOT_FOUND' });
  SpreadsheetApp.flush();
  const range = sheet.getDataRange();
  const values = range.getValues();
  const displayedValues = range.getDisplayValues();
  const iso = value => {
    if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
    if (typeof value === 'number') {
      const spreadsheetDate = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      return isNaN(spreadsheetDate.getTime()) ? null : spreadsheetDate.toISOString();
    }
    if (typeof value === 'string' && value.trim()) {
      const frenchDate = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (frenchDate) return new Date(Date.UTC(Number(frenchDate[3]), Number(frenchDate[2]) - 1, Number(frenchDate[1]), 12)).toISOString();
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    return null;
  };
  const reference = (price, date, fxToEur) => {
    const observedAt = iso(date);
    return typeof price === 'number' && observedAt && typeof fxToEur === 'number' ? { price: price, observedAt: observedAt, fxToEur: fxToEur } : null;
  };
  const quotes = values.slice(1).map((row, index) => ({ row: row, displayed: displayedValues[index + 1] })).filter(item => item.row[0]).map(item => ({
    ticker: String(item.row[0]).trim(), name: String(item.row[1] || '').trim(),
    price: typeof item.row[2] === 'number' ? item.row[2] : null,
    currency: String(item.row[3] || '').trim().toUpperCase(), status: String(item.row[4] || '').trim(),
    fetchedAt: iso(item.row[5]) || new Date().toISOString(), fxToEur: typeof item.row[13] === 'number' ? item.row[13] : null,
    observedAt: iso(item.row[6]) || iso(item.displayed[6]),
    references: {
      day: reference(item.row[7], item.row[8] || item.displayed[8], item.row[14]),
      month: reference(item.row[9], item.row[10] || item.displayed[10], item.row[15]),
      year: reference(item.row[11], item.row[12] || item.displayed[12], item.row[16])
    }
  }));
  return jsonResponse({ ok: true, schemaVersion: 3, generatedAt: new Date().toISOString(), quotes: quotes });
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
