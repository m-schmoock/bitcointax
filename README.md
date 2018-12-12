## Bitcoin tax calculation JS website

This page consumes report CSV data from various exchanges and sources,
calculates profits in FIFO or LIFO style and visualizes the stake.
It can handle multiple years at once and should be used like this,
so LIFO/FIFO actually makes sense.

**It will not upload your data anywhere.** It does all the calculation
in your browsers JavaScript engine. Check the code, if concerned or
enable your browsers tab offline developer option.

GoogleCharts is used for rendering, this requires online usage
becuase the GoogleChart libs must be fetched dynamically from google.
BitcoinAverage is used for exchange rates, if not given from input files.

Currently only supports BTC/EUR pair and the following exchange formats:
- Bitcoin.de
- Kraken
- Xapo Visa card (business closed down end 2017)
- Bitwala Sepa transfers (old pre 2018 format)
- Bitwala Card TopUps (old pre 2018 format)
- Custom OTC csv format for manual entries

**Note: Use at own risk!**

I am currently working on also enabling xpubkey transaction tracking.

## Use page via github.io pages:
https://m-schmoock.github.io/bitcointax/

## Browserify the lib

browserify index.js --standalone bitcointaxlib > js/bitcointaxlib.js
