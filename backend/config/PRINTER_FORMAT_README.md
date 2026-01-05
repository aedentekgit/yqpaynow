# Printer Format Configuration Guide

## Overview

The `printer-format.json` file controls all aspects of receipt printing alignment, spacing, fonts, and layout. This makes it easy to adjust printer output without modifying code.

## File Location

`backend/config/printer-format.json`

## Quick Start - Adjusting Alignment

### To fix column alignment:

1. **Adjust column widths** in the `table` section:
```json
"table": {
  "itemColumnWidth": "58%",    // Item name column
  "qtyColumnWidth": "14%",      // Quantity column
  "rateColumnWidth": "14%",     // Rate column
  "totalColumnWidth": "14%"     // Total column
}
```

2. **Change text alignment**:
```json
"table": {
  "itemAlign": "left",    // Options: "left", "center", "right"
  "qtyAlign": "center",
  "rateAlign": "right",
  "totalAlign": "right"
}
```

### To adjust page width:

```json
"page": {
  "maxWidth": "400px",    // Maximum receipt width
  "bodyWidth": "302px",   // Body content width
  "padding": "8px"        // Page padding
}
```

### To adjust font sizes:

```json
"fonts": {
  "bodySize": "11px",           // Main text size
  "headerTitleSize": "16px",    // Theater name size
  "itemSize": "10px",           // Item names size
  "totalSize": "13px"           // Grand total size
}
```

### To adjust spacing:

```json
"header": {
  "paddingTop": "5px",
  "paddingBottom": "6px",
  "marginBottom": "6px"
},
"items": {
  "padding": "0 10px",        // Left/right padding for items
  "marginBottom": "1px"      // Space between item rows
}
```

## Common Alignment Fixes

### Problem: Columns are misaligned
**Solution:** Adjust `table` column widths to total 100%:
```json
"itemColumnWidth": "60%",
"qtyColumnWidth": "12%",
"rateColumnWidth": "14%",
"totalColumnWidth": "14%"
```

### Problem: Text is too close to edges
**Solution:** Increase padding:
```json
"page": {
  "padding": "10px"  // Increase from 8px
},
"items": {
  "padding": "0 15px"  // Increase from "0 10px"
}
```

### Problem: Items table is too wide/narrow
**Solution:** Adjust page width:
```json
"page": {
  "maxWidth": "350px",  // Decrease for narrower
  "bodyWidth": "280px"
}
```

### Problem: Numbers not aligned properly
**Solution:** Ensure right alignment:
```json
"table": {
  "rateAlign": "right",
  "totalAlign": "right"
}
```

## Grid Layout (for agent-service.js)

If using grid layout instead of table, adjust:
```json
"gridLayout": {
  "itemColumn": "2fr",   // Item name (fractional units)
  "qtyColumn": "0.7fr",  // Quantity
  "rateColumn": "1fr",   // Rate
  "totalColumn": "1fr"    // Total
}
```

## Fixed Width Layout (for agent-http.js)

For fixed pixel widths:
```json
"fixedWidthLayout": {
  "itemWidth": "140px",
  "qtyWidth": "30px",
  "rateWidth": "50px",
  "totalWidth": "60px"
}
```

## After Making Changes

1. **Save the JSON file**
2. **Restart the backend server** for changes to take effect
3. **Test print** a receipt to verify alignment

## Notes

- All measurements use CSS units (px, %, fr, etc.)
- Colors use hex format (#8B5CF6)
- Font sizes should be in pixels (px)
- After modifying, the server will automatically reload the config on next print

## Example: Centering Everything

To center-align all text:
```json
"table": {
  "itemAlign": "center",
  "qtyAlign": "center",
  "rateAlign": "center",
  "totalAlign": "center"
},
"header": {
  "textAlign": "center"
}
```

## Example: Wider Receipt

To make receipt wider:
```json
"page": {
  "maxWidth": "500px",
  "bodyWidth": "450px"
},
"table": {
  "itemColumnWidth": "50%",
  "qtyColumnWidth": "15%",
  "rateColumnWidth": "17.5%",
  "totalColumnWidth": "17.5%"
}
```

