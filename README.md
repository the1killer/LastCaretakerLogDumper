# Last Caretaker Voyage Log Dumper

A UE4SS mod for *The Last Caretaker* that extracts voyage log data from the game and exports it to JSON format.

## Description

This mod allows you to dump all voyage logs and their associated fragments from *The Last Caretaker* game into a structured JSON file. This is useful for documentation, modding reference, or data analysis purposes.

## Features

- **Extract Voyage Logs**: Retrieves all `VoyageLogData` objects from the game
- **Extract Log Fragments**: Captures all `VoyageLogFragment` objects and associates them with their parent logs
- **JSON Export**: Exports data in a clean, readable JSON format with proper indentation
- **Key Binding**: Simple F3 key press to trigger the dump
- **Sample Data Export**: Exports the hologram Sample Data collectibles' thumbnails as PNGs and their title/description text as JSON (F4)

## Installation

1. Install [UE4SS specifically for TLC](https://www.nexusmods.com/thelastcaretaker/mods/4) for *The Last Caretaker*
2. Copy the `T1KTLCVoyageLogDumper` folder to your game's `Mods` directory:
   ```
   [Game Directory]/The Last Caretaker/Binaries/Win64/ue4ss/Mods/
   ```
3. Add `T1KTLCVoyageLogDumper : 1` to mods.txt

## Usage

1. Launch *The Last Caretaker*
2. Press **F2** to dump the voyage logs and locations
    * Press **F3** to dump the Maze Room Numbers (must be at the maze)
3. If **F2** Used, data will be exported to `voyage_logs_dump.json` and `voyage_location_dump.json` in the game's directory
    * Optional, run `sort_logs_by_id.ps1` so that the order of the logs is the same for version tracking.
4. If **F3** Used, data will be in `voyage_maze_numbers_dump.json`
    * Run `update_transposium_numbers.ps1` to add a new sheet to `Transposium_Numbers.xlsx`
5. Check the console output for confirmation messages
6. Press **F4** to export the Sample Data hologram thumbnails as PNGs to `sampledata_images\` in
   the game's directory (renders each texture into a small render target and exports that, since
   there's no direct "export texture as PNG" call in the engine), and their title/description text
   to `voyage_sampledata_text_dump.json` in the same directory

## Output Format

The generated JSON file contains an array of voyage logs with the following structure:

```json
[
  {
    "id": "VoyageLog_Example",
    "title": "Log Title",
    "description": "Log description text",
    "footer": "Footer text",
    "fragments": [
      {
        "id": "VoyageLog_Example:Fragment_01",
        "title": "Fragment Title",
        "description": "Fragment description"
      }
    ]
  }
]
```

`voyage_sampledata_text_dump.json` contains an array of Sample Data hologram records:

```json
[
  {
    "id": "DA_SampleData_13",
    "title": "Sample Title",
    "uncollectedDescription": "Description shown before the sample is collected",
    "sentDescription": "Description shown after the sample is sent"
  }
]
```

## Project Structure

```
T1KTLCVoyageLogDumper/
├── Scripts/
│   ├── main.lua         # Main mod logic and key binding
│   └── jsonshim.lua     # JSON serialization utility
site/                    # Web archive/diff viewer for the dumped data (see below)
```

## Web Archive

The `site/` folder is a static, browsable archive of the dumped data (voyage logs,
quest subtitles, and Sample Data) with a version picker and a diff view for comparing
any two commits. It fetches everything straight from this repo's commit history via
GitHub's API/raw content (`raw.githubusercontent.com` and `api.github.com`) -- there's
no build step or server, so hosting it just means enabling GitHub Pages for this repo
(Settings → Pages → Deploy from a branch → `gh-pages`), and pushes to `main` touching
`site/**` will deploy automatically via `.github/workflows/deploy.yml`.

## How It Works

1. **Data Collection**: The mod uses UE4SS's `FindAllOf()` function to locate all `VoyageLogData` and `VoyageLogFragment` and `VoyageLocatorComponent` objects in the game
2. **Fragment Association**: Fragments are matched to their parent logs based on naming patterns
3. **JSON Conversion**: A custom JSON serializer converts the Lua tables to properly formatted JSON
4. **File Export**: The data is written to `voyage_logs_dump.json` and `voyage_location_dump.json` in the current directory
5. **Sample Data Thumbnails**: Each Sample Data texture is loaded by its known asset path, drawn onto a small render target via `UCanvas:K2_DrawTexture`, and exported as PNG with `UKismetRenderingLibrary:ExportRenderTarget` -- there's no direct "export texture as PNG" call in the engine
6. **Sample Data Text**: Since `VoyageSampleDataAsset` uses Unreal's unversioned property serialization, its property names aren't recoverable from the static game files -- they were confirmed live via UE4SS's property reflection (`ForEachProperty`) and are read directly off each asset instance

## Requirements

- The Last Caretaker (game)
- [UE4SS specifically for TLC](https://www.nexusmods.com/thelastcaretaker/mods/4)

## License

This is a modding tool for personal use. Please respect the game's terms of service and copyright.

## Credits

Created for *The Last Caretaker* modding community by The1Killer.
