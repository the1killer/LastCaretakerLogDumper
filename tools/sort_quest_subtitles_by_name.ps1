param(
    [string]$InputFile = (Join-Path $PSScriptRoot '..\voyage_quest_subtitles_dump.json')
)

$ErrorActionPreference = 'Stop'

$InputFile = (Resolve-Path -LiteralPath $InputFile).Path
$subtitles = Get-Content -LiteralPath $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json

$sorted = @($subtitles | Sort-Object {
    [regex]::Replace($_.Name, '\d+', {
        param($match)
        $match.Value.PadLeft(20, '0')
    })
}, Name)

$json = ConvertTo-Json -InputObject $sorted -Depth 10
$json = $json -replace '\\u0027', "'"
$json = $json -replace "’", "'"
$json = $json -replace "\u2019", "'"
$json = $json -replace '\\u0026', "&"
[System.IO.File]::WriteAllText($InputFile, $json, [System.Text.Encoding]::UTF8)

Write-Host "Sorted $($sorted.Count) quest subtitles by name -> $InputFile"