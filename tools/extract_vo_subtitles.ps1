param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [string]$OutputFile = ""
)

$jsonFiles = Get-ChildItem -Path $Path -Filter "*.json" -Recurse -File

if ($jsonFiles.Count -eq 0) {
    Write-Warning "No JSON files found under: $Path"
    exit 1
}

$results = [System.Collections.Generic.List[PSObject]]::new()

foreach ($file in $jsonFiles) {
    try {
        $raw = Get-Content -Path $file.FullName -Raw -Encoding UTF8
        $data = $raw | ConvertFrom-Json

        foreach ($entry in $data) {
            $name     = $entry.Name
            $duration = $entry.Properties.duration
            $subtitles = $entry.Properties.Subtitles

            if ($null -eq $subtitles -or $subtitles.Count -eq 0) {
                # skip entries with no subtitles
            } else {
                foreach ($sub in $subtitles) {
                    $text = if ($sub.Text.LocalizedString) {
                        $sub.Text.LocalizedString
                    } elseif ($sub.Text.SourceString) {
                        $sub.Text.SourceString
                    } else {
                        $null
                    }

                    $results.Add([PSCustomObject]@{
                        # File     = $file.FullName
                        Name     = $name
                        Duration = $duration
                        Subtitle = $text
                    })
                }
            }
        }
    } catch {
        Write-Warning "Failed to parse $($file.FullName): $_"
    }
}

Write-Host "Extracted $($results.Count) record(s) from $($jsonFiles.Count) file(s)."

if ($OutputFile) {
    $json = $results | ConvertTo-Json -Depth 5
    $json = $json -replace '\\u0027', "'"
    $json = $json -replace "’", "'"
    $json = $json -replace "\u2019", "'"
    $json = $json -replace '\\u0026', "&"
    
    Set-Content -Path $OutputFile -Value $json -Encoding UTF8
    Write-Host "Results saved to: $OutputFile"
} else {
    $results | ConvertTo-Json -Depth 5
}
