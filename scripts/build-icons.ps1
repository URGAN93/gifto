$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path $PSScriptRoot -Parent
$sourcePath = Join-Path $projectRoot 'assets/gifto-ribbons-fullbleed.png'
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
function Export-AppIcon([string]$RelativePath, [int]$Size, [double]$Scale = 1.0, [bool]$Transparent = $false) {
    $format = if ($Transparent) { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb } else { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb }
    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, $format)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $background = if ($Transparent) { [System.Drawing.Color]::Transparent } else { [System.Drawing.Color]::FromArgb(10, 28, 52) }
        $graphics.Clear($background)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $edge = [int][Math]::Round($Size * $Scale)
        $offset = [int][Math]::Round(($Size - $edge) / 2)
        $graphics.DrawImage($sourceImage, [System.Drawing.Rectangle]::new($offset, $offset, $edge, $edge))
        $bitmap.Save((Join-Path $projectRoot $RelativePath), [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Output "$RelativePath (${Size}x${Size})"
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
try {
    Export-AppIcon 'assets/gifto-concept4-192.png' 192
    Export-AppIcon 'assets/gifto-concept4-512.png' 512
    Export-AppIcon 'assets/gifto-concept4-180.png' 180
    Export-AppIcon 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png' 1024
    foreach ($density in @(@('mdpi',1),@('hdpi',1.5),@('xhdpi',2),@('xxhdpi',3),@('xxxhdpi',4))) {
        $folder = "android/app/src/main/res/mipmap-$($density[0])"
        $factor = [double]$density[1]
        Export-AppIcon "$folder/ic_launcher.png" ([int](48*$factor))
        Export-AppIcon "$folder/ic_launcher_round.png" ([int](48*$factor))
        # Adaptive foreground fits inside the central 66/108 safe area.
        Export-AppIcon "$folder/ic_launcher_foreground.png" ([int](108*$factor)) (66.0/108) $true
    }
} finally { $sourceImage.Dispose() }
