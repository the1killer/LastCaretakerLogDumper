# extract_maze_numbers.ps1
# Generates voyage_maze_numbers_dump.json from FModel JSON data exports,
# replicating what main.lua does in-game but without needing to run the game.
#
# Reads BP_Maze_RoomNumber_C actors and their DecalComponent children from
# the exported level JSON files to extract the 3-digit room numbers.
#
# Usage: .\extract_maze_numbers.ps1 [-DataPath <path_to_folder>]

param(
    [string]$DataPath = "G:\Users\%USERNAME%\Downloads\FModel\Output\Exports\Voyage\Content\Maps\VoyageWorld2\_Generated_"
)

# Room label lookup - maps instance IDs to room labels (from main.lua)
$maze_room_data = @{
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1234426662" = "B3"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1243881663" = "C3"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1247787664" = "E2"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1287405665" = "G1"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1287408666" = "H1"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1314575667" = "G3"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1314579669" = "E4"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1346505670" = "C4"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1368127671" = "E1"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1439821676" = "E3"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1447221677" = "F1"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1452373678" = "D1"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1610597680" = "C1"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1610600681" = "D2"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1631718683" = "C2"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1637197684" = "B1"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1648634685" = "F2"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF390A3B502_64fd9582c515c2dc_1881279947" = "B2"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF390A6B502_64fd9582c515c2dc_1216033503" = "G2"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1314578668" = "A1"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1385192673" = "A3"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3909CB502_64fd9582c515c2dc_1616968682" = "F3"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF390A6B502_64fd9582c515c2dc_1950753544" = "A2"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1975299502" = "X1"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1988757503" = "X2"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1990989504" = "X3"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1999012505" = "X4"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1999015506" = "X5"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_1999016507" = "X6"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_2000328508" = "X7"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_2000331509" = "X8"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF390E5B502_64fd9582c515c2dc_2000333510" = "X9"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF3904DC002_1bbf791c380ff3a9_1939940165" = "997"
    "BP_Maze_RoomNumber_C_UAID_C87F54CEF390E0B502_64fd9582c515c2dc_1214822351" = "998"
}

# ---------------------------------------------------------------------------
# 1. Find and load JSON data files
# ---------------------------------------------------------------------------

$Path = [System.Environment]::ExpandEnvironmentVariables($DataPath)
if (-not (Test-Path $Path)) {
    Write-Error "Data path not found: $Path"
    exit 1
}

$jsonFiles = Get-ChildItem -Path $Path -Filter "*.json" | Where-Object {
    $_.Name -match "^(5TF|BTN)"
}

if ($jsonFiles.Count -eq 0) {
    Write-Error "No 5TF*.json or BTN*.json files found in: $Path"
    exit 1
}

Write-Host "Found $($jsonFiles.Count) data file(s) to process."

# ---------------------------------------------------------------------------
# 2. Parse all objects from the JSON files
# ---------------------------------------------------------------------------
$allObjects = @()

foreach ($file in $jsonFiles) {
    Write-Host "Loading $($file.Name)..."
    $data = Get-Content $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    $allObjects += $data
    Write-Host "  Loaded $($data.Count) objects."
}

# ---------------------------------------------------------------------------
# 3. Find BP_Maze_RoomNumber_C actors
# ---------------------------------------------------------------------------
$actors = $allObjects | Where-Object { $_.Type -eq "BP_Maze_RoomNumber_C" }
Write-Host "Found $($actors.Count) BP_Maze_RoomNumber_C actors."

# ---------------------------------------------------------------------------
# 4. Find DecalComponent objects and index by owner + decal name
# ---------------------------------------------------------------------------
# Key: "<actor_instance_name>|Decal_N" -> DecalComponent object
$decalIndex = @{}

$decals = $allObjects | Where-Object { $_.Type -eq "DecalComponent" -and $_.Name -match "^Decal_[012]$" }

foreach ($decal in $decals) {
    # Outer.ObjectName contains the owning actor reference like:
    # "BP_Maze_RoomNumber_C'VoyageWorld2:PersistentLevel.BP_Maze_RoomNumber_C_UAID_..._1234567'"
    if ($null -ne $decal.Outer -and $null -ne $decal.Outer.ObjectName) {
        $outerName = $decal.Outer.ObjectName
        # Check if this decal belongs to a BP_Maze_RoomNumber_C actor
        if ($outerName -match "BP_Maze_RoomNumber_C") {
            # Extract the instance name from: BP_Maze_RoomNumber_C'VoyageWorld2:PersistentLevel.<INSTANCE_NAME>'
            if ($outerName -match "PersistentLevel\.([^']+)'") {
                $ownerInstance = $Matches[1]
                $key = "$ownerInstance|$($decal.Name)"
                $decalIndex[$key] = $decal
            }
        }
    }
}

Write-Host "Indexed $($decalIndex.Count) decal components for maze room numbers."

# ---------------------------------------------------------------------------
# 5. Build the output data
# ---------------------------------------------------------------------------
$dump = @()

foreach ($actor in $actors) {
    $instanceName = $actor.Name  # e.g. BP_Maze_RoomNumber_C_UAID_..._1234567

    # Extract the numeric ID (last underscore-separated segment)
    $parts = $instanceName -split "_"
    $id = $parts[-1]

    # Get the 3-digit number from Decal_0, Decal_1, Decal_2
    $digits = @()
    for ($i = 0; $i -le 2; $i++) {
        $key = "$instanceName|Decal_$i"
        $digit = "0"  # default when DecalMaterial is not overridden (uses MI_Decal_Number_0)

        if ($decalIndex.ContainsKey($key)) {
            $decalObj = $decalIndex[$key]
            if ($null -ne $decalObj.Properties -and $null -ne $decalObj.Properties.DecalMaterial) {
                $matName = $decalObj.Properties.DecalMaterial.ObjectName
                if ($matName -match "MI_Decal_Number_(\d+)") {
                    $digit = $Matches[1]
                }
            }
        }
        $digits += $digit
    }

    $num = "$($digits[0])$($digits[1])$($digits[2])"

    # Look up room label
    $room = $null
    if ($maze_room_data.ContainsKey($instanceName)) {
        $room = $maze_room_data[$instanceName]
    }

    $dump += [PSCustomObject]@{
        id    = $id
        num   = $num
        room  = $room
        class = $instanceName
    }
}

# Sort by numeric ID (matching Lua behavior)
$dump = $dump | Sort-Object { [long]$_.id }

Write-Host "Extracted $($dump.Count) maze room number entries."

# ---------------------------------------------------------------------------
# 6. Write output JSON (matching the format of voyage_maze_numbers_dump.json)
# ---------------------------------------------------------------------------
$outputPath = Join-Path $PSScriptRoot "voyage_maze_numbers_dump_test.json"

# Build ordered output matching the Lua script's key order
$outputData = [ordered]@{
    build_number = "FModel Export"
    data         = @($dump | ForEach-Object {
        [ordered]@{
            id    = $_.id
            num   = $_.num
            room  = $_.room
            class = $_.class
        }
    })
}

$json = $outputData | ConvertTo-Json -Depth 10
# Fix indentation to 2 spaces (PowerShell defaults to 4)
$json = $json -replace "    ", "  "

Set-Content -Path $outputPath -Value $json -Encoding UTF8
Write-Host "Output written to: $outputPath"
