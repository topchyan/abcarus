Tabulator (Tabulator Tables)

This folder vendors the Tabulator runtime assets used by the renderer UI.

- Source package: `tabulator-tables`
- Version: see `VERSION.txt`
- Files:
  - `tabulator.min.js`
  - `tabulator.min.css`
  - `LICENSE`

Update workflow:
1) `npm install tabulator-tables@<version>`
2) Copy:
   - `node_modules/tabulator-tables/dist/js/tabulator.min.js` → `third_party/tabulator/tabulator.min.js`
   - `node_modules/tabulator-tables/dist/css/tabulator.min.css` → `third_party/tabulator/tabulator.min.css`
   - `node_modules/tabulator-tables/LICENSE` → `third_party/tabulator/LICENSE`
3) Update `third_party/tabulator/VERSION.txt`
