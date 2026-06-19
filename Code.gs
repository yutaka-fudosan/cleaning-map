const PROPERTY_LIST_SHEET_NAME = '物件一覧';
const REQUIRED_HEADERS = [
  '物件名',
  '住所',
  '物件種別',
  '清掃回数',
  '緯度',
  '経度',
  '注意事項'
];

function doGet() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const propertyListSheet = spreadsheet.getSheetByName(PROPERTY_LIST_SHEET_NAME);

    if (!propertyListSheet) {
      throw new Error('「物件一覧」シートが見つかりません。');
    }

    const values = propertyListSheet.getDataRange().getDisplayValues();
    if (values.length === 0) {
      return createJsonResponse([]);
    }

    const headerIndexes = createHeaderIndexes(values[0]);
    validateRequiredHeaders(headerIndexes);

    const spreadsheetUrl = spreadsheet.getUrl().replace(/#.*$/, '');
    const sheetsByName = {};

    spreadsheet.getSheets().forEach(function(sheet) {
      sheetsByName[sheet.getName()] = sheet;
    });

    const properties = values.slice(1).reduce(function(result, row) {
      const name = getCell(row, headerIndexes, '物件名');
      if (!name) return result;

      const latitude = toNumber(getCell(row, headerIndexes, '緯度'));
      const longitude = toNumber(getCell(row, headerIndexes, '経度'));
      if (latitude === null || longitude === null) return result;

      const propertySheet = sheetsByName[name];

      result.push({
        name: name,
        address: getCell(row, headerIndexes, '住所'),
        type: getCell(row, headerIndexes, '物件種別'),
        cleaningFrequency: getCell(row, headerIndexes, '清掃回数'),
        latitude: latitude,
        longitude: longitude,
        notes: getCell(row, headerIndexes, '注意事項'),
        sheetUrl: propertySheet
          ? spreadsheetUrl + '#gid=' + propertySheet.getSheetId()
          : ''
      });

      return result;
    }, []);

    return createJsonResponse(properties);
  } catch (error) {
    return createJsonResponse({ error: error.message });
  }
}

function createHeaderIndexes(headerRow) {
  return headerRow.reduce(function(indexes, header, index) {
    const normalizedHeader = String(header || '').trim();
    if (normalizedHeader) indexes[normalizedHeader] = index;
    return indexes;
  }, {});
}

function validateRequiredHeaders(headerIndexes) {
  const missingHeaders = REQUIRED_HEADERS.filter(function(header) {
    return headerIndexes[header] === undefined;
  });

  if (missingHeaders.length > 0) {
    throw new Error('見出しが不足しています: ' + missingHeaders.join('、'));
  }
}

function getCell(row, headerIndexes, headerName) {
  const index = headerIndexes[headerName];
  return String(row[index] || '').trim();
}

function toNumber(value) {
  const normalizedValue = String(value || '').replace(/,/g, '').trim();
  if (!normalizedValue) return null;

  const number = Number(normalizedValue);
  return Number.isFinite(number) ? number : null;
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
