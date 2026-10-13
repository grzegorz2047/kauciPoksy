# KaucjaPoksy

An experimental, non-commercial Pokémon fan project exploring barcode-based collection.

## MVP
- Camera barcode scanning when supported by the browser.
- Manual EAN entry as a fallback.
- Local collection persistence through a replaceable `CollectionStore` adapter.
- First scan of an EAN discovers an entry; repeat scans grant XP.

## Run locally
Open `index.html` in a modern browser. Camera access generally requires HTTPS or localhost; manual entry works without camera access.

## Persistence architecture
The current `LocalCollectionStore` saves data in this browser profile. A future remote adapter can implement the same interface without rewriting game rules. Local data is device/browser-specific and can be lost if browser storage is cleared.

## Fan-project notice
Pokémon and related names and characters belong to their respective rights holders. This is an unofficial fan project, not affiliated with or endorsed by them. No Pokémon artwork is bundled in this repository. The rights holder may request changes or removal, and the project should be taken offline if required.

## Important
Scanning a barcode does not prove that a container was returned. This is a collection game only; deposits and refunds remain outside the app.
