$root = "c:\Users\MAI\CodeBuddy\20260723150636\preview"
$port = 8899
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
$listener.Start()
while ($true) {
  $client = $listener.AcceptTcpClient()
  $stream = $client.GetStream()
  $reader = New-Object System.IO.StreamReader($stream)
  $line = $reader.ReadLine()
  $parts = $line -split ' '
  $path = if ($parts.Length -ge 2) { $parts[1] } else { '/' }
  if ($path -eq '/' -or $path -eq '') { $path = '/preview.html' }
  $filePath = Join-Path $root $path.TrimStart('/')
  if (Test-Path $filePath -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($filePath)
    $ct = switch ($ext) { '.html'{'text/html; charset=utf-8'} '.css'{'text/css'} '.js'{'application/javascript'} default{'application/octet-stream'} }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $header = "HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
    $hb = [System.Text.Encoding]::UTF8.GetBytes($header)
    $stream.Write($hb, 0, $hb.Length)
    $stream.Write($bytes, 0, $bytes.Length)
  } else {
    $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
    $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
    $hb = [System.Text.Encoding]::UTF8.GetBytes($header)
    $stream.Write($hb, 0, $hb.Length)
    $stream.Write($body, 0, $body.Length)
  }
  $stream.Close()
  $client.Close()
}
