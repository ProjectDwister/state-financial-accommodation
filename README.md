# RBI State Liquidity Webpage

Static GitHub Pages app for asking questions about RBI State liquidity utilisation data.

## Files

- `index.html`
- `styles.css`
- `app.js`
- `README.md`

## Deploy

Upload these files to the root of your GitHub Pages repository.

The webpage now includes:

- Loading progress taskbar from 0% to 100%
- Chat input disabled until background data is fully loaded
- Interactive India State/UT map
- Financial-year dropdown for the map
- Hover card showing SDF, WMA and Overdraft utilisation for the selected FY

The page reads the live RBI source configured in `app.js`.

