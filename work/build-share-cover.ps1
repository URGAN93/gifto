Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap 1200,630
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$cream = [System.Drawing.ColorTranslator]::FromHtml('#FFF9E8')
$ink = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#25231F'))
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#807660'))
$yellow = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#FFE06A'))
$light = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#FFF1B8'))
$white = [System.Drawing.Brushes]::White
$g.Clear($cream)
$brand = New-Object System.Drawing.Font 'Arial',25,([System.Drawing.FontStyle]::Bold)
$headline = New-Object System.Drawing.Font 'Malgun Gothic',48,([System.Drawing.FontStyle]::Bold)
$body = New-Object System.Drawing.Font 'Malgun Gothic',19
$g.DrawString('GIFTO', $brand, $ink, 72, 56)
$g.DrawString('갖고 싶은 선물에', $headline, $ink, 65, 184)
$g.DrawString('마음을 더해요.', $headline, $ink, 65, 274)
$g.DrawString('소중한 사람들과 함께하는 위시리스트', $body, $muted, 73, 402)
$g.FillEllipse($light, 800, 145, 340, 340)
# Flat gift illustration built from simple vector shapes.
$g.FillRectangle($yellow, 835, 283, 268, 197)
$g.FillRectangle($ink, 951, 283, 36, 197)
$g.FillRectangle($yellow, 819, 255, 300, 55)
$g.FillRectangle($ink, 951, 255, 36, 55)
$pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#25231F')),14
$g.DrawBezier($pen, 969, 256, 856, 251, 862, 140, 932, 190)
$g.DrawBezier($pen, 932, 190, 956, 209, 963, 239, 969, 256)
$g.DrawBezier($pen, 969, 256, 1082, 251, 1076, 140, 1006, 190)
$g.DrawBezier($pen, 1006, 190, 982, 209, 975, 239, 969, 256)
$g.FillEllipse($ink, 786, 198, 12, 12)
$g.FillEllipse($yellow, 1112, 507, 22, 22)
$bitmap.Save((Join-Path $PSScriptRoot '../assets/gifto-share-cover-v2.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$pen.Dispose(); $brand.Dispose(); $headline.Dispose(); $body.Dispose()
$ink.Dispose(); $muted.Dispose(); $yellow.Dispose(); $light.Dispose(); $g.Dispose(); $bitmap.Dispose()
