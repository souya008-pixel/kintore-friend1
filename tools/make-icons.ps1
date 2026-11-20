# Generates the PWA icons (ASCII-only script for Windows PowerShell 5.1): white dumbbell on a blue gradient
param([string]$Out = (Split-Path -Parent $PSScriptRoot))
Add-Type -AssemblyName System.Drawing

function Add-RoundRect($path, [double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
  $d = [single](2 * $r)
  $path.AddArc([single]$x, [single]$y, $d, $d, 180, 90)
  $path.AddArc([single]($x + $w - 2 * $r), [single]$y, $d, $d, 270, 90)
  $path.AddArc([single]($x + $w - 2 * $r), [single]($y + $h - 2 * $r), $d, $d, 0, 90)
  $path.AddArc([single]$x, [single]($y + $h - 2 * $r), $d, $d, 90, 90)
  $path.CloseFigure()
}

function New-Icon([int]$size, [string]$path, [double]$scale) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $c1 = [System.Drawing.Color]::FromArgb(255, 57, 135, 229)
  $c2 = [System.Drawing.Color]::FromArgb(255, 16, 66, 129)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 60.0
  $g.FillRectangle($bg, $rect)

  $s = $size * $scale
  $o = ($size - $s) / 2
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $cy = $o + $s * 0.50
  # bar
  Add-RoundRect $p ($o + $s * 0.20) ($cy - $s * 0.035) ($s * 0.60) ($s * 0.07) ($s * 0.02)
  # inner plates
  Add-RoundRect $p ($o + $s * 0.24) ($cy - $s * 0.20) ($s * 0.09) ($s * 0.40) ($s * 0.03)
  Add-RoundRect $p ($o + $s * 0.67) ($cy - $s * 0.20) ($s * 0.09) ($s * 0.40) ($s * 0.03)
  # outer plates
  Add-RoundRect $p ($o + $s * 0.14) ($cy - $s * 0.14) ($s * 0.08) ($s * 0.28) ($s * 0.03)
  Add-RoundRect $p ($o + $s * 0.78) ($cy - $s * 0.14) ($s * 0.08) ($s * 0.28) ($s * 0.03)
  $g.FillPath($white, $p)

  # small upward trend mark under the dumbbell
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(230, 255, 255, 255)), ([single]($s * 0.028))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $pts = @(
    (New-Object System.Drawing.PointF ([single]($o + $s * 0.36)), ([single]($o + $s * 0.83))),
    (New-Object System.Drawing.PointF ([single]($o + $s * 0.46)), ([single]($o + $s * 0.76))),
    (New-Object System.Drawing.PointF ([single]($o + $s * 0.54)), ([single]($o + $s * 0.80))),
    (New-Object System.Drawing.PointF ([single]($o + $s * 0.65)), ([single]($o + $s * 0.71)))
  )
  $g.DrawLines($pen, [System.Drawing.PointF[]]$pts)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Icon 192 (Join-Path $Out 'icon-192.png') 1.0
New-Icon 512 (Join-Path $Out 'icon-512.png') 1.0
New-Icon 512 (Join-Path $Out 'icon-maskable-512.png') 0.78
New-Icon 180 (Join-Path $Out 'apple-touch-icon.png') 0.92
Write-Output "icons written to $Out"
