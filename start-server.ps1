$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8000

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "==========================================="
Write-Host "  GeoPortal EPMAPAQ - Servidor Local"
Write-Host "==========================================="
Write-Host ""
Write-Host "  Abre en tu navegador: http://localhost:$port"
Write-Host "  Presiona Ctrl+C para detener."
Write-Host ""

function Resolve-Url($targetUrl) {
    try {
        $req = [System.Net.HttpWebRequest]::Create($targetUrl)
        $req.Method = "HEAD"
        $req.AllowAutoRedirect = $true
        $req.Timeout = 15000
        $req.UserAgent = "Mozilla/5.0"
        $resp = $req.GetResponse()
        $finalUrl = $resp.ResponseUri.AbsoluteUri
        $resp.Close()
        return @{ ok = $true; url = $finalUrl }
    } catch {
        try {
            $req2 = [System.Net.HttpWebRequest]::Create($targetUrl)
            $req2.Method = "GET"
            $req2.AllowAutoRedirect = $true
            $req2.Timeout = 15000
            $req2.UserAgent = "Mozilla/5.0"
            $resp2 = $req2.GetResponse()
            $finalUrl2 = $resp2.ResponseUri.AbsoluteUri
            $resp2.Close()
            return @{ ok = $true; url = $finalUrl2 }
        } catch {
            return @{ ok = $false; error = $_.Exception.Message }
        }
    }
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $req = $context.Request
        $resp = $context.Response

        if ($req.Url.LocalPath -eq "/proxy") {
            $targetUrl = $req.QueryString["url"]
            $resp.StatusCode = 200
            $resp.ContentType = "application/json"
            $resp.Headers.Add("Access-Control-Allow-Origin", "*")

            if ($targetUrl) {
                $result = Resolve-Url $targetUrl
                if ($result.ok) {
                    $json = '{"ok":true,"url":"' + $result.url + '"}'
                } else {
                    $json = '{"ok":false,"url":null,"error":"' + ($result.error -replace '"', '\"') + '"}'
                }
            } else {
                $json = '{"ok":false,"url":null,"error":"missing url param"}'
            }

            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $resp.ContentLength64 = $buffer.Length
            $resp.OutputStream.Write($buffer, 0, $buffer.Length)
            $resp.Close()
            continue
        }

        $filePath = Join-Path $root ($req.Url.LocalPath.TrimStart("/"))
        if ($req.Url.LocalPath -eq "/") { $filePath = Join-Path $root "index.html" }

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".gif"  { "image/gif" }
                ".svg"  { "image/svg+xml" }
                default { "application/octet-stream" }
            }
            $buffer = [System.IO.File]::ReadAllBytes($filePath)
            $resp.StatusCode = 200
            $resp.ContentType = $mime
            $resp.ContentLength64 = $buffer.Length
            $resp.OutputStream.Write($buffer, 0, $buffer.Length)
        } else {
            $resp.StatusCode = 404
            $buffer = [System.Text.Encoding]::UTF8.GetBytes("Not found")
            $resp.ContentLength64 = $buffer.Length
            $resp.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        $resp.Close()
    } catch {
        Write-Host "Error: $_"
    }
}
