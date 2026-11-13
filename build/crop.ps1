param(
  [string]$Src,
  [string]$Out,
  [int]$X, [int]$Y, [int]$W, [int]$H
)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($Src)
$r = New-Object System.Drawing.Rectangle($X, $Y, $W, $H)
$bmp = New-Object System.Drawing.Bitmap($r.Width, $r.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = 'HighQualityBicubic'
$g.DrawImage($img, 0, 0, $r, [System.Drawing.GraphicsUnit]::Pixel)
$bmp.Save($Out)
$g.Dispose(); $bmp.Dispose(); $img.Dispose()
Write-Host "saved $Out"
