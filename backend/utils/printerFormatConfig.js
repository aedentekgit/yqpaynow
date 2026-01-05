/**
 * Printer Format Configuration Loader
 * Loads printer formatting settings from JSON config file
 */

const fs = require('fs');
const path = require('path');

let cachedConfig = null;

/**
 * Load printer format configuration from JSON file
 * @returns {Object} Configuration object with formatting settings
 */
function loadPrinterFormatConfig() {
  // Return cached config if already loaded
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const configPath = path.join(__dirname, '../config/printer-format.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    cachedConfig = JSON.parse(configData);
    return cachedConfig;
  } catch (error) {
    console.warn('⚠️  Failed to load printer-format.json, using defaults:', error.message);
    // Return default configuration if file doesn't exist
    return getDefaultConfig();
  }
}

/**
 * Get default configuration (fallback)
 */
function getDefaultConfig() {
  return {
    page: {
      width: '80mm',
      maxWidth: '400px',
      bodyWidth: '302px',
      margin: '0',
      padding: '8px'
    },
    fonts: {
      family: 'Courier New, monospace',
      bodySize: '11px',
      headerTitleSize: '16px',
      headerSubtitleSize: '10px',
      infoSize: '11px',
      tableHeaderSize: '10px',
      itemSize: '10px',
      summarySize: '11px',
      totalSize: '13px',
      footerSize: '10px',
      lineHeight: '1.2'
    },
    colors: {
      headerTitle: '#8B5CF6',
      headerSubtitle: '#666',
      total: '#8B5CF6',
      footer: '#666',
      text: '#000',
      background: '#fff'
    },
    header: {
      textAlign: 'center',
      paddingTop: '5px',
      paddingBottom: '6px',
      marginBottom: '6px',
      borderBottom: '1px dashed #000',
      titleMarginBottom: '2px'
    },
    info: {
      padding: '6px 0',
      marginBottom: '6px',
      borderBottom: '1px dashed #000',
      rowMarginBottom: '4px'
    },
    table: {
      width: '100%',
      itemColumnWidth: '58%',
      qtyColumnWidth: '14%',
      rateColumnWidth: '14%',
      totalColumnWidth: '14%',
      itemAlign: 'left',
      qtyAlign: 'center',
      rateAlign: 'right',
      totalAlign: 'right',
      cellPadding: '2px 0',
      headerBorderBottom: '1px solid #000',
      headerFontWeight: '700'
    },
    gridLayout: {
      itemColumn: '2fr',
      qtyColumn: '0.7fr',
      rateColumn: '1fr',
      totalColumn: '1fr'
    },
    fixedWidthLayout: {
      itemWidth: '140px',
      qtyWidth: '30px',
      rateWidth: '50px',
      totalWidth: '60px'
    },
    items: {
      padding: '0 10px',
      marginBottom: '1px',
      headerPaddingBottom: '2px',
      headerMarginBottom: '2px'
    },
    summary: {
      borderTop: '1px dashed #000',
      paddingTop: '6px',
      marginTop: '6px',
      rowMarginBottom: '4px',
      totalBorderTop: '1px solid #000',
      totalPaddingTop: '4px',
      totalMarginTop: '4px',
      totalFontWeight: '700',
      valueMinWidth: '80px'
    },
    footer: {
      textAlign: 'center',
      marginTop: '8px',
      paddingTop: '6px',
      borderTop: '1px dashed #000',
      thanksMargin: '1px 0',
      thanksFontWeight: 'bold'
    },
    spacing: {
      separatorMargin: '4px 0',
      sectionMargin: '4px'
    }
  };
}

/**
 * Reload configuration (useful for hot-reloading during development)
 */
function reloadConfig() {
  cachedConfig = null;
  return loadPrinterFormatConfig();
}

module.exports = {
  loadPrinterFormatConfig,
  reloadConfig,
  getDefaultConfig
};

