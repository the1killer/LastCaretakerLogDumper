# update_transposium_numbers.ps1
# Copies the "Room Template" sheet in Transposium_Numbers.xlsx, names it with the
# current date/time, then fills each cell that matches a room identifier from
# voyage_maze_numbers_dump.json with the corresponding num value.
#
# Requires: ImportExcel module  (Install-Module ImportExcel -Scope CurrentUser)
# Usage:    .\update_transposium_numbers.ps1

param(
    [string]$ExcelFile = (Join-Path $PSScriptRoot "../Transposium_Numbers.xlsx"),
    [string]$JsonFile = (Join-Path $PSScriptRoot "../voyage_maze_numbers_dump.json")
)
$ExcelFile = [System.Environment]::ExpandEnvironmentVariables($ExcelFile)
$JsonFile  = [System.Environment]::ExpandEnvironmentVariables($JsonFile)
$TemplateName  = "Room Template"
$NewSheetName  = Get-Date -Format "yyyy-MM-dd HH-mm-ss"

# ---------------------------------------------------------------------------
# 1. Validate inputs
# ---------------------------------------------------------------------------
if (-not (Test-Path $ExcelFile)) {
    Write-Error "Excel file not found: $ExcelFile"
    exit 1
}

if (-not (Test-Path $JsonFile)) {
    Write-Error "JSON file not found: $JsonFile"
    exit 1
}

# ---------------------------------------------------------------------------
# 2. Load room data from JSON  ->  hashtable  room => num
# ---------------------------------------------------------------------------
$roomData = Get-Content $JsonFile -Raw -Encoding UTF8 | ConvertFrom-Json

$roomMap = @{}
foreach ($entry in $roomData.data) {
    if (-not [string]::IsNullOrEmpty($entry.room)) {
        $roomMap[$entry.room] = $entry.num
    }
}

Write-Host "Loaded $($roomMap.Count) room entries from JSON."

# ---------------------------------------------------------------------------
# 3. Open the workbook and copy the template sheet
# ---------------------------------------------------------------------------
$pkg = Open-ExcelPackage -Path $ExcelFile

$templateSheet = $pkg.Workbook.Worksheets[$TemplateName]
if ($null -eq $templateSheet) {
    Write-Error "Sheet '$TemplateName' not found in $ExcelFile"
    $pkg.Dispose()
    exit 1
}

# Remove any existing sheet with the same timestamp name (edge case)
$existing = $pkg.Workbook.Worksheets[$NewSheetName]
if ($null -ne $existing) {
    $pkg.Workbook.Worksheets.Delete($existing)
}

# Copy template and rename the copy
$pkg.Workbook.Worksheets.Copy($TemplateName, $NewSheetName)
$newSheet = $pkg.Workbook.Worksheets[$NewSheetName]

Write-Host "Created sheet '$NewSheetName' from '$TemplateName'."

# ---------------------------------------------------------------------------
# 4. Walk every used cell; replace room-identifier values with num
# ---------------------------------------------------------------------------
$replacedCount = 0
$dimension     = $newSheet.Dimension
$maxColumnU    = 21

if ($null -eq $dimension) {
    Write-Warning "New sheet appears to be empty — nothing to replace."
} else {
    $endColumn = [Math]::Min($dimension.End.Column, $maxColumnU)

    for ($row = $dimension.Start.Row; $row -le $dimension.End.Row; $row++) {
        for ($col = $dimension.Start.Column; $col -le $endColumn; $col++) {
            $cell = $newSheet.Cells[$row, $col]
            $val  = $cell.Text   # read display text so formulas/strings both match

            if ($roomMap.ContainsKey($val)) {
                $cell.Value = $roomMap[$val]
                $replacedCount++
                Write-Verbose "  [$row,$col] '$val' -> '$($roomMap[$val])'"
            } elseif ($val -eq 'GAME VERSION') {
                $cell.Value = "$NewSheetName $($roomData.build_number)"
                $replacedCount++
                Write-Verbose "  [$row,$col] 'GAME VERSION' -> '$($roomData.build_number)'"
            }
        }
    }
}

Write-Host "Replaced $replacedCount cell(s) with num values."

# ---------------------------------------------------------------------------
# 5. Save and close
# ---------------------------------------------------------------------------
Close-ExcelPackage -ExcelPackage $pkg

Write-Host "Saved '$ExcelFile' successfully."
